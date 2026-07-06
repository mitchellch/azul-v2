// Module-level BLE connection manager.
// One connection per controller, lives for the app lifetime — never torn down on navigation.
// Keyed by mac (same as cloudManager and controllerStore) — no dual-key problem.
// Writes all zone/status state directly to controllerStore.

import { Device, Subscription } from 'react-native-ble-plx';
import {
  connect, disconnect,
  sendCommand,
  subscribeToStatus,
  subscribeToZoneData,
} from '@/services/ble';
import { controllerStore } from '@/lib/controllerStore';
// import { relayConfigIfNeeded } from '@/lib/configRelay';
import type { ZoneData, StatusData } from '@/context/ControllerConnection';

function normalizeSource(s: string | undefined): ZoneData['source'] {
  return s === 'scheduler' ? 'scheduler' : 'manual';
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BleConnectionState = {
  connecting: boolean;
  connected:  boolean;
};

type StateSubscriber = (s: BleConnectionState) => void;

type ControllerEntry = {
  mac:      string;
  deviceId: string;
  ownerSub: string;
  state:    BleConnectionState;
  device:   Device | null;
  statusSub:    Subscription | null;
  zoneDataSub:  Subscription | null;
  retryTimer:   ReturnType<typeof setTimeout> | null;
  retryCount:   number;
  // Block B3 notifications until the initial get_zones has returned
  initialFetchDone: boolean;
  subscribers:       Set<StateSubscriber>;
  statusSubscribers: Set<(s: StatusData) => void>;
  stopped: boolean;
};

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

const entries = new Map<string, ControllerEntry>();

const MAX_RETRIES    = 10;
const RETRY_DELAY_MS = 3_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setState(e: ControllerEntry, patch: Partial<BleConnectionState>) {
  e.state = { ...e.state, ...patch };
  for (const fn of e.subscribers) fn(e.state);
}

function scheduleRetry(e: ControllerEntry) {
  if (e.stopped) return;
  if (e.retryCount >= MAX_RETRIES) return;
  e.retryCount++;
  e.retryTimer = setTimeout(() => {
    if (!e.stopped) doConnect(e);
  }, RETRY_DELAY_MS);
}

async function doConnect(e: ControllerEntry) {
  if (e.stopped) return;

  e.statusSub?.remove();  e.statusSub  = null;
  e.zoneDataSub?.remove(); e.zoneDataSub = null;
  if (e.retryTimer) { clearTimeout(e.retryTimer); e.retryTimer = null; }
  e.initialFetchDone = false;

  setState(e, { connecting: true, connected: false });

  try {
    const device = await connect(e.deviceId);
    if (e.stopped) { disconnect(device).catch(() => {}); return; }

    e.device = device;
    e.retryCount = 0;

    e.statusSub = subscribeToStatus(device, (s: any) => {
      if (e.stopped) return;
      for (const fn of e.statusSubscribers) fn(s as StatusData);
    });

    e.zoneDataSub = subscribeToZoneData(device, (zoneArr: any[]) => {
      if (e.stopped) return;
      // Ignore B3 notifications until get_zones has returned — early B3s reflect
      // stale firmware state and would overwrite running→idle on reconnect.
      if (!e.initialFetchDone) return;
      setState(e, { connected: true, connecting: false });
      controllerStore.setZones(e.mac, zoneArr.map(z => {
        const prevStatus = controllerStore.get(e.mac).find(p => p.id === z.id)?.status;
        const status = (prevStatus === 'pending' && z.status === 'idle') ? 'pending' as const : z.status;
        return {
          ...z,
          status,
          source: status === 'running' ? normalizeSource(z.source) : undefined,
        };
      }));
      controllerStore.syncQueue(e.mac);
    });

    // Authoritative fetch — always apply, never seed
    const [statusData, zonesData] = await Promise.all([
      sendCommand(device, 'get_status', undefined, e.ownerSub),
      sendCommand(device, 'get_zones',  undefined, e.ownerSub),
    ]);
    if (e.stopped) return;

    for (const fn of e.statusSubscribers) fn(statusData as StatusData);
    controllerStore.setZones(e.mac, (zonesData as any[]).map(z => ({
      ...z,
      source: z.status === 'running' ? normalizeSource(z.source) : undefined,
    })));
    controllerStore.syncQueue(e.mac);
    e.initialFetchDone = true;

    // Config relay disabled — needs config version initialization on firmware first
    // relayConfigIfNeeded(device, e.mac, e.ownerSub).catch(() => {});

    device.onDisconnected(() => {
      if (e.stopped) return;
      e.device = null;
      e.initialFetchDone = false;
      setState(e, { connected: false, connecting: false });
      scheduleRetry(e);
    });

    setState(e, { connecting: false, connected: true });

  } catch {
    if (e.stopped) return;
    e.device = null;
    setState(e, { connecting: false, connected: false });
    scheduleRetry(e);
  }
}

// ---------------------------------------------------------------------------
// Public API  (all keyed by mac)
// ---------------------------------------------------------------------------

export const bleManager = {
  start(mac: string, deviceId: string, ownerSub: string): void {
    let e = entries.get(mac);
    if (e) {
      e.ownerSub = ownerSub;
      e.stopped  = false;
      return;
    }
    e = {
      mac, deviceId, ownerSub,
      state: { connecting: true, connected: false },
      device: null, statusSub: null, zoneDataSub: null,
      retryTimer: null, retryCount: 0, initialFetchDone: false,
      subscribers: new Set(), statusSubscribers: new Set(),
      stopped: false,
    };
    entries.set(mac, e);
    doConnect(e);
  },

  stop(mac: string): void {
    const e = entries.get(mac);
    if (!e) return;
    e.stopped = true;
    e.statusSub?.remove();
    e.zoneDataSub?.remove();
    if (e.retryTimer) clearTimeout(e.retryTimer);
    if (e.device) disconnect(e.device).catch(() => {});
    entries.delete(mac);
  },

  reconnect(mac: string): void {
    const e = entries.get(mac);
    if (!e || e.stopped) return;
    if (e.retryTimer) clearTimeout(e.retryTimer);
    e.retryCount = 0;
    if (e.device) disconnect(e.device).catch(() => {});
    doConnect(e);
  },

  getState(mac: string): BleConnectionState {
    return entries.get(mac)?.state ?? { connecting: true, connected: false };
  },

  subscribeState(mac: string, fn: StateSubscriber): () => void {
    const e = entries.get(mac);
    if (!e) return () => {};
    e.subscribers.add(fn);
    return () => e.subscribers.delete(fn);
  },

  subscribeStatus(mac: string, fn: (s: StatusData) => void): () => void {
    const e = entries.get(mac);
    if (!e) return () => {};
    e.statusSubscribers.add(fn);
    return () => e.statusSubscribers.delete(fn);
  },

  async execCommand(mac: string, cmd: string, data?: object): Promise<unknown> {
    const e = entries.get(mac);
    if (!e) throw new Error('Controller not managed');

    if (!e.state.connected) {
      e.retryCount = 0;
      doConnect(e);
      await new Promise<void>((resolve, reject) => {
        const start = Date.now();
        const check = setInterval(() => {
          if (e.state.connected) { clearInterval(check); resolve(); }
          else if (Date.now() - start > 12_000) { clearInterval(check); reject(new Error('Could not connect to controller. Please try again.')); }
        }, 250);
      });
    }

    if (!e.device) throw new Error('Controller is not connected.');
    try {
      return await sendCommand(e.device, cmd, data, e.ownerSub);
    } catch (err: any) {
      const msg: string = err?.message ?? '';
      if (msg.includes('write failed') || msg.includes('not connected') || msg.includes('disconnect')) {
        throw new Error('Lost connection to controller. Reconnecting…');
      }
      throw err;
    }
  },
};
