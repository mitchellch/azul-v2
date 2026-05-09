# Backend Implementation Dashboard

**Objective:** Production-ready API server connecting mobile/web clients to controllers via MQTT.

**Architecture:** [cloud-api-architecture.md](../../docs/design/cloud-api-architecture.md)  
**Web app design:** [web-app-architecture.md](../../docs/design/web-app-architecture.md)

---

## Status Key

| Symbol | Meaning |
| :--- | :--- |
| ⚪ | Not started |
| 🔵 | In progress |
| ✅ | Complete |
| ❌ | Blocked |

---

## Phases

| Phase | Description | Status | Depends on | Details |
| :--- | :--- | :--- | :--- | :--- |
| **P1** | Fix the foundation — auth middleware, MQTT crash fix, PendingDevice | ✅ | — | [Details](P1-foundation.md) |
| **P2** | Device claiming — POST /api/devices/claim, ownership scoping | ✅ | P1 | [Details](P2-claiming.md) |
| **P3** | Schedule CRUD — full lifecycle + MQTT push to device | ✅ | P2 | [Details](P3-schedules.md) |
| **P4** | Audit log ingest + online/offline tracking | ✅ | P2 | [Details](P4-audit-online.md) |
| **P5** | SSE real-time status stream | ⚪ | P4 | [Details](P5-sse.md) |
| **P6** | Remote zone control via cloud (mobile out-of-BLE-range) | ✅ | P2 | [Details](P6-remote-control.md) |
| **P7** | Multi-tenant / landscaper org model | ⚪ | P3 | [Details](P7-multi-tenant.md) |

---

## Device Claiming Flow

The mobile BLE adoption (already working) and backend registration are separate steps:

```
1. Mobile BLE: claim command → firmware stores owner_sub, clears PIN
2. Mobile API: POST /api/devices/claim → backend associates Auth0 user with MAC
3. Controller MQTT: publishes status → backend updates Device record
```

After P2, the mobile `controllers.ts` store should add a `cloudId` field to persist the backend `Device.id`.

---

## Final Target Schema (reference)

```
users           id, auth0_sub, email, name
pending_devices mac (PK), firmware, ip_address, first_seen_at, last_seen_at
devices         id, user_id, mac, name, firmware, ip_address, online, last_seen_at
zones           id, device_id, number, name
schedules       id, device_id, uuid, name, start_date, end_date, active
schedule_runs   id, schedule_id, zone_id, zone_number, day_mask, hour, minute,
                duration_seconds, interval_days
audit_log       id, device_id, zone_id, zone_number, started_at, duration_seconds, source
```

Multi-tenant additions (P7): `organizations`, `org_members`, `org_id` FK on `devices`.

---

## Parallel Work Allowed

- P3, P4, P6 can all run in parallel after P2
- P5 can start after P4 (needs the online/offline data it emits)
- P7 is fully independent once P3 is done
