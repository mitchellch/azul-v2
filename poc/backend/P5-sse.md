# P5 — SSE Real-Time Status Stream

**Status:** ⚪ Not started  
**Depends on:** P4  
**Unlocks:** Web app live dashboard

## Goal

Web (and mobile when remote) can subscribe to live controller status without polling.

## Design

In-process SSE registry — no Redis needed at this scale.

`src/lib/sseRegistry.ts`:
```typescript
type Listener = (event: object) => void;
const registry = new Map<string, Set<Listener>>();

export const sseRegistry = {
  subscribe(mac: string, fn: Listener): () => void {
    if (!registry.has(mac)) registry.set(mac, new Set());
    registry.get(mac)!.add(fn);
    return () => registry.get(mac)?.delete(fn);
  },
  emit(mac: string, event: object) {
    registry.get(mac)?.forEach(fn => fn(event));
  },
};
```

The MQTT status handler calls `sseRegistry.emit(mac, { type: 'status', ...data })`.

## Endpoint

```
GET /api/devices/:mac/stream   (SSE, requires JWT)
```

Sends:
- Immediate snapshot of current device + zone state
- Live updates whenever the device publishes a status message

## Done When

- [ ] SSE connection to `/api/devices/:mac/stream` stays open
- [ ] Status messages from MQTT are forwarded to connected SSE clients within 1s
- [ ] Connection cleanup (unsubscribe) fires on client disconnect
- [ ] Returns 403 for devices not owned by the requesting user
