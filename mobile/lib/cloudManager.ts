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

export type OtaStatusEvent = {
  id:          string;
  version:     string;
  status:      'pending' | 'downloading' | 'verifying' | 'installing' | 'complete' | 'error' | 'rolled_back';
  progress:    number;
  error:       string | null;
  startedAt:   string;
  completedAt: string | null;
} | null;

type OtaSubscriber = (ota: OtaStatusEvent) => void;

type Entry = {
  mac:               string;
  state:             CloudConnectionState;
  pollTimer:         ReturnType<typeof setInterval>  | null;
  stopped:           boolean;
  stateSubscribers:  Set<StateSubscriber>;
  statusSubscribers: Set<StatusSubscriber>;
  otaSubscribers:    Set<OtaSubscriber>;
  // Last-known values, replayed to new subscribers so UIs that mount later
  // see the current state immediately instead of waiting for the next event.
  lastStatus:        StatusData | null;
  lastOta:           OtaStatusEvent;
};

function emitStatus(e: Entry, patch: StatusData) {
  e.lastStatus = { ...(e.lastStatus ?? {}), ...patch };
  for (const fn of e.statusSubscribers) fn(patch);
}

function emitOta(e: Entry, ota: OtaStatusEvent) {
  e.lastOta = ota;
  for (const fn of e.otaSubscribers) fn(ota);
}

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

const entries = new Map<string, Entry>();

// Single shared SSE stream for ALL user devices — one held OkHttp Call instead of N.
// react-native-sse uses XHR which never releases its OkHttp Dispatcher slot on
// long-lived streams; opening one-per-mac starves the fetch pool.
let sharedSSE: EventSource | null = null;
let sharedRetryTimer: ReturnType<typeof setTimeout> | null = null;

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

function ensureSharedSSE() {
  if (sharedSSE) return;
  const { accessToken } = useAuthStore.getState();
  if (!accessToken) return;
  if (sharedRetryTimer) { clearTimeout(sharedRetryTimer); sharedRetryTimer = null; }

  console.log('[cloudManager] opening shared SSE at /devices/stream');
  const es = new EventSource(`${API_URL}/devices/stream`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    lineEndingCharacter: '\n',
  });

  es.addEventListener('message', (ev: any) => {
    try {
      const event = JSON.parse(ev.data);
      const mac: string | undefined = event.mac;
      if (!mac) return;
      const e = entries.get(mac);
      if (!e || e.stopped) return;

      if (event.type === 'snapshot') {
        if (Array.isArray(event.device?.zones)) applyZoneUpdate(mac, event.device.zones);
        // Snapshot device object carries firmware version + latest-available-firmware
        // (server-computed against device.target). Emit as partial status update;
        // provider merges with prior status via setStatus(prev => ({...prev, ...s})).
        if (event.device) {
          emitStatus(e, {
            firmware:                event.device.firmware ?? undefined,
            latestAvailableFirmware: event.device.latestAvailableFirmware ?? null,
          });
          // Snapshot also carries the current OTA row — emit so a client that
          // mounts or reconnects mid-OTA (or after a manual state reset) sees
          // the authoritative server state instead of stale local progress.
          if ('currentOta' in event.device) {
            emitOta(e, event.device.currentOta ?? null);
          }
        }
      } else if (event.type === 'status') {
        emitStatus(e, { firmware: event.firmware, uptime_seconds: event.uptime, zones_running: event.zones_running });
        if (Array.isArray(event.zones)) applyZoneUpdate(mac, event.zones);
      } else if (event.type === 'connection') {
        setState(e, { connected: !!event.online });
      } else if (event.type === 'ota') {
        emitOta(e, event.ota ?? null);
      }
    } catch { /* ignore parse errors */ }
  });

  es.addEventListener('error', () => {
    console.warn('[cloudManager] shared SSE error, retrying in 3s');
    sharedSSE?.close();
    sharedSSE = null;
    if (sharedRetryTimer) clearTimeout(sharedRetryTimer);
    sharedRetryTimer = setTimeout(() => { if (entries.size > 0) ensureSharedSSE(); }, 3_000);
  });

  sharedSSE = es;
}

function closeSharedSSEIfIdle() {
  if (entries.size > 0) return;
  if (sharedRetryTimer) { clearTimeout(sharedRetryTimer); sharedRetryTimer = null; }
  if (sharedSSE) { sharedSSE.close(); sharedSSE = null; console.log('[cloudManager] closed shared SSE (no active entries)'); }
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

    emitStatus(e, {
      firmware:                d.firmware       ?? undefined,
      uptime_seconds:          d.uptime_seconds ?? undefined,
      zones_running:           d.zones_running  ?? undefined,
      latestAvailableFirmware: d.latestAvailableFirmware ?? null,
    });
    if ('currentOta' in d) emitOta(e, d.currentOta ?? null);

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

    ensureSharedSSE();

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
    emitStatus(e, {
      firmware:                d.firmware,
      uptime_seconds:          d.uptime_seconds,
      zones_running:           d.zones_running,
      latestAvailableFirmware: d.latestAvailableFirmware ?? null,
    });
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
      pollTimer: null,
      stopped: false,
      stateSubscribers:  new Set(),
      statusSubscribers: new Set(),
      otaSubscribers:    new Set(),
      lastStatus:        null,
      lastOta:           null,
    };
    entries.set(mac, e);
    load(e);
  },

  stop(mac: string): void {
    const e = entries.get(mac);
    if (!e) return;
    e.stopped = true;
    if (e.pollTimer) clearInterval(e.pollTimer);
    entries.delete(mac);
    closeSharedSSEIfIdle();
  },

  reload(mac: string): void {
    let e = entries.get(mac);
    if (!e) {
      e = {
        mac, state: { connecting: true, connected: false },
        pollTimer: null, stopped: false,
        stateSubscribers: new Set(), statusSubscribers: new Set(),
        otaSubscribers: new Set(),
        lastStatus: null, lastOta: null,
      };
      entries.set(mac, e);
    } else {
      if (e.pollTimer) clearInterval(e.pollTimer);
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
    if (e.lastStatus) fn(e.lastStatus);
    return () => e.statusSubscribers.delete(fn);
  },

  subscribeOta(mac: string, fn: OtaSubscriber): () => void {
    const e = entries.get(mac);
    if (!e) return () => {};
    e.otaSubscribers.add(fn);
    if (e.lastOta) fn(e.lastOta);
    return () => e.otaSubscribers.delete(fn);
  },
};
