# P4 — Audit Log Ingest + Online/Offline Tracking

**Status:** ⚪ Not started  
**Depends on:** P2  
**Unlocks:** P5

## Goal

Ingest zone run events from MQTT into the database. Track device online/offline state with a background sweep.

## Audit Log Ingest

`src/mqtt/handlers.ts` — add `handleDeviceEvent(mac, data)`:

Controller publishes to `azul/{mac}/events`:
```json
{ "type": "zone_run", "zone": 3, "duration": 300, "source": "scheduler", "ts": 1234567890 }
```

Handler:
1. Look up Device by mac — skip if not found (unclaimed device)
2. Look up Zone by deviceId + zone number — create if missing
3. Insert AuditLog row

## Online/Offline Tracking

`src/jobs/offlineSweep.ts` — new file:
```typescript
export function startOfflineSweep() {
  setInterval(async () => {
    const cutoff = new Date(Date.now() - 5 * 60 * 1000); // 5 min ago
    await db.device.updateMany({
      where: { online: true, lastSeenAt: { lt: cutoff } },
      data:  { online: false },
    });
  }, 2 * 60 * 1000); // every 2 min
}
```

Wire into `src/index.ts`.

## Audit Log Endpoint

```
GET /api/devices/:mac/log?limit=50&offset=0
```

Returns recent AuditLog entries for the device, newest first.

## Done When

- [ ] Zone run event from MQTT is stored in audit_log table
- [ ] `GET /api/devices/:mac/log` returns audit entries
- [ ] Device goes offline (online: false) after 5 minutes with no status heartbeat
- [ ] Device comes back online (online: true) when next status message arrives
