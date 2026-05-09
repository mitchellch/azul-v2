type Listener = (event: object) => void;

const registry = new Map<string, Set<Listener>>();

export const sseRegistry = {
  subscribe(mac: string, fn: Listener): () => void {
    if (!registry.has(mac)) registry.set(mac, new Set());
    registry.get(mac)!.add(fn);
    return () => {
      registry.get(mac)?.delete(fn);
      if (registry.get(mac)?.size === 0) registry.delete(mac);
    };
  },

  emit(mac: string, event: object) {
    registry.get(mac)?.forEach(fn => fn(event));
  },

  subscriberCount(mac: string): number {
    return registry.get(mac)?.size ?? 0;
  },
};
