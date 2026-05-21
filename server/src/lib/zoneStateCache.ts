type ZoneState = { id: number; status: 'idle' | 'running' | 'pending'; runtime: number; source?: string; apiSetAt?: number; runtimeSetAt?: number };

const API_GRACE_MS = 5000;
const PENDING_TIMEOUT_MS = 10 * 60 * 1000;

const cache = new Map<string, Map<number, ZoneState>>();

export const zoneStateCache = {
  update(mac: string, zones: ZoneState[]) {
    const map = cache.get(mac) ?? new Map<number, ZoneState>();
    const now = Date.now();
    for (const z of zones) {
      const existing = map.get(z.id);
      if (existing?.apiSetAt) {
        const age = now - existing.apiSetAt;
        if (existing.status === 'pending') {
          if (z.status === 'running') {
            map.set(z.id, { ...z, runtimeSetAt: now });
          } else if (age > PENDING_TIMEOUT_MS) {
            map.set(z.id, { ...z, runtimeSetAt: now });
          }
          continue;
        }
        if (existing.status === 'running' && age < API_GRACE_MS) {
          continue;
        }
      }
      map.set(z.id, { ...z, runtimeSetAt: now });
    }
    cache.set(mac, map);
  },

  patch(mac: string, zoneNumber: number, partial: Partial<ZoneState>) {
    const map = cache.get(mac) ?? new Map<number, ZoneState>();
    const existing = map.get(zoneNumber) ?? { id: zoneNumber, status: 'idle' as const, runtime: 0 };
    const now = Date.now();
    const next = { ...existing, ...partial, apiSetAt: now, runtimeSetAt: now };
    map.set(zoneNumber, next);
    cache.set(mac, map);
  },

  get(mac: string): ZoneState[] {
    const now = Date.now();
    return Array.from(cache.get(mac)?.values() ?? []).map(z => {
      if (z.status === 'running' && z.runtimeSetAt) {
        const elapsed = Math.floor((now - z.runtimeSetAt) / 1000);
        const remaining = Math.max(0, z.runtime - elapsed);
        if (remaining === 0) return { ...z, status: 'idle' as const, runtime: 0 };
        return { ...z, runtime: remaining };
      }
      return z;
    });
  },
};
