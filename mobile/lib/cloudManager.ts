// Module-level cloud connection manager.
// One SSE connection + poll interval per MAC, lives for the app session.
// Writes zone/status state directly to controllerStore.

import EventSource from 'react-native-sse';
import { getDeviceStatus } from '@/services/cloudApi';
import { controllerStore } from '@/lib/controllerStore';
import { useAuthStore } from '@/store/auth';
import type { ZoneData, StatusData } from '@/context/ControllerConnection';

const API_URL          = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000/api';
const POLL_INTERVAL_MS = 10_000;
const OPTIMISTIC_GRACE_MS = 5_000;

// Tracks when a zone was optimistically set to running/pending by client tap
const optimisticAt = new Map<string, number>(); // key: "mac:zoneId"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CloudConnectionState = { connecting: boolean; connected: boolean };
type StateSubscriber  = (s: CloudConnectionState) => void;
type StatusSubscriber = (s: StatusData) => void;

type Entry = {
  mac:               string;
  state:             CloudConnectionState;
  es:                EventSource | null;
  pollTimer:         ReturnType<typeof setInterval>  | null;
  sseRetryTimer:     ReturnType<typeof setTimeout>   | null;
  stopped:           boolean;
  stateSubscribers:  Set<StateSubscriber>;
  statusSubscribers: Set<StatusSubscriber>;
};

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

const entries = new Map<string, Entry>();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setState(e: Entry, patch: Partial<CloudConnectionState>) {
  e.state = { ...e.state, ...patch };
  for (const fn of e.stateSubscribers) fn(e.state);
}

function normalizeSource(s: string | undefined): ZoneData['source'] {
  return s === 'scheduler' ? 'scheduler' : 'manual';
}

function applyZoneUpdate(mac: string, rawZones: any[]) {
  const prev = controllerStore.get(mac);
  if (prev.length === 0) return;
  const next = prev.map(z => {
    const u = rawZones.find((x: any) => (x.number ?? x.id) === z.id);
    if (!u) return z;
    const serverStatus = (u.status ?? 'idle') as ZoneData['status'];
    // Protect optimistic state during grace period (poll race with firmware event)
    if ((z.status === 'pending' || z.status === 'running') && serverStatus === 'idle') {
      const key = `${mac}:${z.id}`;
      const setAt = optimisticAt.get(key);
      if (setAt && Date.now() - setAt < OPTIMISTIC_GRACE_MS) return z;
      optimisticAt.delete(key);
    }
    return {
      ...z,
      status: serverStatus,
      source: serverStatus === 'running' ? normalizeSource(u.source) : undefined,
      // Preserve client countdown when both agree zone is running
      runtime_seconds: (z.status === 'running' && serverStatus === 'running')
        ? z.runtime_seconds
        : u.runtime_seconds ?? u.runtime ?? 0,
    };
  });
  controllerStore.setZones(mac, next);
  controllerStore.syncQueue(mac);
}

function startSSE(e: Entry) {
  if (e.stopped) return;
  e.es?.close();
  e.es = null;
  if (e.sseRetryTimer) { clearTimeout(e.sseRetryTimer); e.sseRetryTimer = null; }

  const { accessToken } = useAuthStore.getState();
  if (!accessToken) return;

  const es = new EventSource(`${API_URL}/devices/${e.mac}/stream`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    lineEndingCharacter: '\n',
  });

  es.addEventListener('message', (ev: any) => {
    if (e.stopped) return;
    try {
      const event = JSON.parse(ev.data);
      if (event.type === 'snapshot') {
        if (Array.isArray(event.device?.zones)) applyZoneUpdate(e.mac, event.device.zones);
      } else if (event.type === 'status') {
        const s: StatusData = { firmware: event.firmware, uptime_seconds: event.uptime, zones_running: event.zones_running };
        for (const fn of e.statusSubscribers) fn(s);
        if (Array.isArray(event.zones)) applyZoneUpdate(e.mac, event.zones);
      } else if (event.type === 'connection') {
        setState(e, { connected: !!event.online });
      }
    } catch { /* ignore parse errors */ }
  });

  es.addEventListener('error', () => {
    if (e.stopped) return;
    e.sseRetryTimer = setTimeout(() => { if (!e.stopped) startSSE(e); }, 3_000);
  });

  e.es = es;
}

async function load(e: Entry) {
  if (e.stopped) return;
  console.log(`[cloudManager] load(${e.mac}) — fetching device status`);
  setState(e, { connecting: true, connected: false });
  try {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 10_000);
    let d: any;
    try {
      d = await getDeviceStatus(e.mac, abort.signal);
    } finally {
      clearTimeout(timer);
    }
    if (e.stopped) return;
    console.log(`[cloudManager] load(${e.mac}) — success, ${Array.isArray(d.zones) ? d.zones.length : 0} zones`);

    const status: StatusData = {
      firmware:      d.firmware       ?? undefined,
      uptime_seconds: d.uptime_seconds ?? undefined,
      zones_running:  d.zones_running  ?? undefined,
    };
    for (const fn of e.statusSubscribers) fn(status);

    // Always authoritative — never seed, always overwrite
    const zonesData: any[] = Array.isArray(d.zones) ? d.zones : [];
    controllerStore.setZones(e.mac, zonesData.map(z => ({
      id:              z.number,
      name:            z.name ?? `Zone ${z.number}`,
      status:          (z.status ?? 'idle') as ZoneData['status'],
      runtime_seconds: z.runtime_seconds ?? 0,
      source:          z.status === 'running' ? normalizeSource(z.source) : undefined,
      photoUrl:        z.photoUrl ?? z.photo_url ?? null,
    })));
    controllerStore.syncQueue(e.mac);

    setState(e, { connecting: false, connected: true });

    startSSE(e);

    if (e.pollTimer) clearInterval(e.pollTimer);
    e.pollTimer = setInterval(() => pollStatus(e), POLL_INTERVAL_MS);
  } catch (err: any) {
    console.warn(`[cloudManager] load(${e.mac}) — failed: ${err?.message ?? err}`);
    if (!e.stopped) setState(e, { connecting: false, connected: false });
  }
}

async function pollStatus(e: Entry) {
  if (e.stopped) return;
  try {
    const d = await getDeviceStatus(e.mac) as any;
    if (e.stopped) return;
    const s: StatusData = { firmware: d.firmware, uptime_seconds: d.uptime_seconds, zones_running: d.zones_running };
    for (const fn of e.statusSubscribers) fn(s);
    if (Array.isArray(d.zones)) applyZoneUpdate(e.mac, d.zones);
  } catch { /* retry next interval */ }
}

export function markOptimistic(mac: string, zoneId: number) {
  optimisticAt.set(`${mac}:${zoneId}`, Date.now());
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const cloudManager = {
  // Idempotent — safe to call on every provider mount or app-level start.
  start(mac: string): void {
    if (entries.has(mac)) return;
    const e: Entry = {
      mac,
      state: { connecting: true, connected: false },
      es: null, pollTimer: null, sseRetryTimer: null,
      stopped: false,
      stateSubscribers:  new Set(),
      statusSubscribers: new Set(),
    };
    entries.set(mac, e);
    load(e);
  },

  stop(mac: string): void {
    const e = entries.get(mac);
    if (!e) return;
    e.stopped = true;
    e.es?.close();
    if (e.pollTimer)     clearInterval(e.pollTimer);
    if (e.sseRetryTimer) clearTimeout(e.sseRetryTimer);
    entries.delete(mac);
  },

  reload(mac: string): void {
    let e = entries.get(mac);
    if (!e) {
      e = {
        mac, state: { connecting: true, connected: false },
        es: null, pollTimer: null, sseRetryTimer: null, stopped: false,
        stateSubscribers: new Set(), statusSubscribers: new Set(),
      };
      entries.set(mac, e);
    } else {
      e.es?.close(); e.es = null;
      if (e.pollTimer)     clearInterval(e.pollTimer);
      if (e.sseRetryTimer) clearTimeout(e.sseRetryTimer);
    }
    load(e);
  },

  getState(mac: string): CloudConnectionState {
    return entries.get(mac)?.state ?? { connecting: true, connected: false };
  },

  subscribeState(mac: string, fn: StateSubscriber): () => void {
    const e = entries.get(mac);
    if (!e) return () => {};
    e.stateSubscribers.add(fn);
    return () => e.stateSubscribers.delete(fn);
  },

  subscribeStatus(mac: string, fn: StatusSubscriber): () => void {
    const e = entries.get(mac);
    if (!e) return () => {};
    e.statusSubscribers.add(fn);
    return () => e.statusSubscribers.delete(fn);
  },
};
