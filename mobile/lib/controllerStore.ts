// Global zone state store for all controllers.
// Survives navigation — providers write to it, screens subscribe from it.
// Single ticker counts down all running zones regardless of which screen is mounted.

import type { ZoneData } from '@/context/ControllerConnection';

type Subscriber = (zones: ZoneData[]) => void;

const cache       = new Map<string, ZoneData[]>();
const subscribers = new Map<string, Set<Subscriber>>();
// queue[id] = ordered list of zone IDs that are pending/running, oldest first
const queue       = new Map<string, number[]>();
let   tickStarted = false;

function notify(id: string) {
  const zones = cache.get(id);
  if (!zones) return;
  subscribers.get(id)?.forEach(fn => fn(zones));
}

function startTick() {
  if (tickStarted) return;
  tickStarted = true;
  setInterval(() => {
    for (const [id, zones] of cache) {
      let changed = false;
      const next = zones.map(z => {
        if (z.status !== 'running') return z;
        if (z.runtime_seconds > 1) {
          changed = true;
          return { ...z, runtime_seconds: z.runtime_seconds - 1 };
        }
        if (z.runtime_seconds === 1) {
          changed = true;
          return { ...z, runtime_seconds: 0 };
        }
        // runtime_seconds === 0: auto-idle, server will override if zone is still running
        changed = true;
        return { ...z, status: 'idle' as const, runtime_seconds: 0, source: undefined };
      });
      if (changed) {
        cache.set(id, next);
        notify(id);
      }
    }
  }, 1000);
}

export const controllerStore = {
  get(id: string): ZoneData[] {
    return cache.get(id) ?? [];
  },

  subscribe(id: string, fn: Subscriber): () => void {
    if (!subscribers.has(id)) subscribers.set(id, new Set());
    subscribers.get(id)!.add(fn);
    startTick();
    return () => { subscribers.get(id)?.delete(fn); };
  },

  // Seed from initial fetch — no-op if store already has data for this controller.
  seed(id: string, zones: ZoneData[]) {
    if (cache.has(id)) return;
    cache.set(id, zones);
    notify(id);
  },

  // Full replacement — called when firmware sends a complete zone snapshot.
  setZones(id: string, zones: ZoneData[]) {
    cache.set(id, zones);
    notify(id);
  },

  // Merge a single zone — used for optimistic updates (pending on tap).
  patch(id: string, zoneId: number, status: ZoneData['status'], runtime_seconds?: number) {
    const prev = cache.get(id) ?? [];
    cache.set(id, prev.map(z =>
      z.id === zoneId
        ? { ...z, status, ...(runtime_seconds !== undefined && { runtime_seconds }) }
        : z
    ));
    notify(id);
  },

  setZoneName(id: string, zoneId: number, name: string) {
    const prev = cache.get(id) ?? [];
    cache.set(id, prev.map(z => z.id === zoneId ? { ...z, name } : z));
    notify(id);
  },

  setZonePhoto(id: string, zoneId: number, photoUrl: string | null) {
    const prev = cache.get(id) ?? [];
    cache.set(id, prev.map(z => z.id === zoneId ? { ...z, photoUrl } : z));
    notify(id);
  },

  // Queue management: enqueue a zone (no-op if already queued)
  enqueue(id: string, zoneId: number) {
    const q = queue.get(id) ?? [];
    if (!q.includes(zoneId)) queue.set(id, [...q, zoneId]);
  },

  // Remove a zone from the queue
  dequeue(id: string, zoneId: number) {
    const q = queue.get(id) ?? [];
    queue.set(id, q.filter(x => x !== zoneId));
  },

  // Returns 1-based position: 1 = currently running (or "next"), 2 = second in line, etc.
  // Returns null if zone is not in queue.
  queuePosition(id: string, zoneId: number): number | null {
    const q = queue.get(id) ?? [];
    const idx = q.indexOf(zoneId);
    return idx === -1 ? null : idx + 1;
  },

  // Sync queue to reality: queue holds only pending zones; remove anything that is no longer pending.
  // When a pending zone transitions to running (firmware activated it), it leaves the queue and
  // the remaining zones shift up automatically.
  syncQueue(id: string) {
    const zones = cache.get(id) ?? [];
    const pending = new Set(zones.filter(z => z.status === 'pending').map(z => z.id));
    const q = queue.get(id) ?? [];
    const next = q.filter(x => pending.has(x));
    queue.set(id, next);
  },
};
