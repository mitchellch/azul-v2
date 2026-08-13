// Global zone state singleton.
// One SSE connection for all user devices. Survives page navigation.
//
// Architecture: fetch an access token from /api/stream, then connect
// directly to the backend SSE endpoint using fetch(). This bypasses
// Next.js App Router's response buffering which prevents SSE proxying.

import { useSyncExternalStore, useCallback } from 'react';

export type ZoneLive = {
  id: string;
  number: number;
  name: string;
  status: 'idle' | 'running' | 'pending';
  runtimeSeconds: number;
  source?: 'scheduler' | 'manual';
  photoUrl?: string | null;
};

export type OtaLive = {
  statusId: string;
  version: string;
  status: 'pending' | 'downloading' | 'verifying' | 'installing' | 'complete' | 'error' | 'rolled_back';
  progress: number;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
};

type Subscriber    = (zones: ZoneLive[]) => void;
type OtaSubscriber = (ota: OtaLive | null) => void;

const BACKEND = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api';

const cache       = new Map<string, ZoneLive[]>();
const subscribers = new Map<string, Set<Subscriber>>();

const otaCache       = new Map<string, OtaLive | null>();
const otaSubscribers = new Map<string, Set<OtaSubscriber>>();

function notifyOta(mac: string) {
  const val = otaCache.get(mac) ?? null;
  otaSubscribers.get(mac)?.forEach(fn => fn(val));
}

let connected        = false;
let opening          = false;
let reconnectTimer:  ReturnType<typeof setTimeout> | null = null;
let tickMaster:      ReturnType<typeof setInterval> | null = null;

function notify(mac: string) {
  const zones = cache.get(mac);
  if (!zones) return;
  subscribers.get(mac)?.forEach(fn => fn(zones));
}

function normalizeSource(s: string | undefined): ZoneLive['source'] {
  return s === 'scheduler' ? 'scheduler' : 'manual';
}

function applyZoneUpdate(mac: string, rawZones: any[]) {
  const prev = cache.get(mac) ?? [];
  const next = prev.map(z => {
    const u = rawZones.find((x: any) => (x.number ?? x.id) === z.number);
    if (!u) return z;
    const serverStatus = (u.status ?? 'idle') as ZoneLive['status'];
    const serverRuntime = u.runtime_seconds ?? u.runtime ?? 0;
    return {
      ...z,
      status: serverStatus,
      // Preserve client countdown when both agree zone is running
      runtimeSeconds: (z.status === 'running' && serverStatus === 'running')
        ? z.runtimeSeconds
        : serverRuntime,
      source: serverStatus === 'running' ? normalizeSource(u.source) : undefined,
    };
  });
  cache.set(mac, next);
  notify(mac);
}

function startTick() {
  if (tickMaster) return;
  tickMaster = setInterval(() => {
    for (const [mac, zones] of cache) {
      let changed = false;
      const next = zones.map(z => {
        if (z.status !== 'running') return z;
        if (z.runtimeSeconds > 1) {
          changed = true;
          return { ...z, runtimeSeconds: z.runtimeSeconds - 1 };
        }
        if (z.runtimeSeconds === 1) {
          changed = true;
          return { ...z, runtimeSeconds: 0 };
        }
        // runtimeSeconds === 0: auto-idle, server will override if zone is still running
        changed = true;
        return { ...z, status: 'idle' as const, runtimeSeconds: 0, source: undefined };
      });
      if (changed) { cache.set(mac, next); notify(mac); }
    }
  }, 1000);
}

function handleEvent(raw: string) {
  let data: any;
  try { data = JSON.parse(raw); } catch { return; }
  const mac: string = data.mac;
  if (!mac) return;

  if (data.type === 'snapshot' && data.device && Array.isArray(data.device.zones)) {
    const prev = cache.get(mac) ?? [];
    const next: ZoneLive[] = data.device.zones.map((z: any) => {
      const existing = prev.find(p => p.number === z.number);
      const status = (z.status ?? 'idle') as ZoneLive['status'];
      return {
        id:             z.id,
        number:         z.number,
        name:           z.name ?? `Zone ${z.number}`,
        status,
        runtimeSeconds: (existing?.status === 'running' && status === 'running')
          ? existing.runtimeSeconds
          : z.runtime_seconds ?? 0,
        source:         status === 'running' ? normalizeSource(z.source) : undefined,
        photoUrl:       z.photoUrl ?? z.photo_url ?? existing?.photoUrl ?? null,
      };
    });
    cache.set(mac, next);
    notify(mac);
  }

  if (data.type === 'status' && Array.isArray(data.zones)) {
    applyZoneUpdate(mac, data.zones);
  }

  if (data.type === 'ota' && data.ota) {
    const o = data.ota as Record<string, unknown>;
    const next: OtaLive = {
      statusId:    (o.id ?? data.otaStatusId) as string,
      version:     (o.version ?? '') as string,
      status:      (o.status  ?? 'pending')   as OtaLive['status'],
      progress:    Number(o.progress ?? 0),
      error:       (o.error   ?? null) as string | null,
      startedAt:   (o.startedAt ?? new Date().toISOString()) as string,
      completedAt: (o.completedAt ?? null) as string | null,
    };
    otaCache.set(mac, next);
    notifyOta(mac);
  }
}

async function parseSSE(reader: ReadableStreamDefaultReader<Uint8Array>) {
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      if (line.startsWith('data: ')) handleEvent(line.slice(6).trim());
    }
  }
}

async function connect() {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }

  let token: string;
  try {
    const res = await fetch('/api/stream');
    if (res.status === 401) {
      console.warn('[zoneStream] auth expired — stopping reconnect');
      opening = false;
      return;
    }
    if (!res.ok) throw new Error(`token ${res.status}`);
    token = (await res.json()).token;
  } catch (err) {
    console.warn('[zoneStream] token error', err);
    reconnectTimer = setTimeout(connect, 3000);
    return;
  }

  try {
    const res = await fetch(`${BACKEND}/devices/stream`, {
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'text/event-stream' },
      cache: 'no-store',
    });
    if (!res.ok || !res.body) throw new Error(`upstream ${res.status}`);
    connected = true;
    await parseSSE(res.body.getReader());
  } catch (err: any) {
    if (err?.name === 'AbortError') return;
    console.warn('[zoneStream] stream error', err?.message);
  }

  connected = false;
  reconnectTimer = setTimeout(connect, 3000);
}

export const zoneStream = {
  open() {
    if (connected || opening) return;
    opening = true;
    startTick();
    connect();
  },

  getZones(mac: string): ZoneLive[] {
    return cache.get(mac) ?? [];
  },

  subscribe(mac: string, fn: Subscriber): () => void {
    if (!subscribers.has(mac)) subscribers.set(mac, new Set());
    subscribers.get(mac)!.add(fn);
    return () => { subscribers.get(mac)?.delete(fn); };
  },

  patch(mac: string, zoneNumber: number, status: ZoneLive['status'], runtimeSeconds?: number) {
    const prev = cache.get(mac) ?? [];
    cache.set(mac, prev.map(z =>
      z.number === zoneNumber
        ? { ...z, status, ...(runtimeSeconds !== undefined && { runtimeSeconds }) }
        : z
    ));
    notify(mac);
  },

  seed(mac: string, zones: ZoneLive[]) {
    if (cache.has(mac)) return;
    cache.set(mac, zones);
    notify(mac);
  },

  setZoneName(mac: string, zoneNumber: number, name: string) {
    const prev = cache.get(mac) ?? [];
    cache.set(mac, prev.map(z => z.number === zoneNumber ? { ...z, name } : z));
    notify(mac);
  },

  setZonePhoto(mac: string, zoneNumber: number, photoUrl: string | null) {
    const prev = cache.get(mac) ?? [];
    cache.set(mac, prev.map(z => z.number === zoneNumber ? { ...z, photoUrl } : z));
    notify(mac);
  },

  getOta(mac: string): OtaLive | null {
    return otaCache.get(mac) ?? null;
  },

  setOta(mac: string, ota: OtaLive | null) {
    otaCache.set(mac, ota);
    notifyOta(mac);
  },

  subscribeOta(mac: string, fn: OtaSubscriber): () => void {
    if (!otaSubscribers.has(mac)) otaSubscribers.set(mac, new Set());
    otaSubscribers.get(mac)!.add(fn);
    return () => { otaSubscribers.get(mac)?.delete(fn); };
  },
};

const EMPTY: ZoneLive[] = [];

export function useZones(mac: string): ZoneLive[] {
  const subscribe  = useCallback((fn: () => void) => zoneStream.subscribe(mac, fn), [mac]);
  const getSnapshot = useCallback(() => cache.get(mac) ?? EMPTY, [mac]);
  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
}

export function useOta(mac: string): OtaLive | null {
  const subscribe  = useCallback((fn: () => void) => zoneStream.subscribeOta(mac, fn), [mac]);
  const getSnapshot = useCallback(() => otaCache.get(mac) ?? null, [mac]);
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}
