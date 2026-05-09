# P3 — Schedule CRUD + MQTT Push

**Status:** ⚪ Not started  
**Depends on:** P2  
**Unlocks:** P7

## Goal

Full schedule lifecycle via REST. Every mutation pushes the updated schedule to the device via MQTT.

## Schema Addition

Add `Schedule` and `ScheduleRun` models (see dashboard for full schema).

## Endpoints

```
GET    /api/devices/:mac/schedules
POST   /api/devices/:mac/schedules
GET    /api/devices/:mac/schedules/:uuid
PUT    /api/devices/:mac/schedules/:uuid
DELETE /api/devices/:mac/schedules/:uuid
POST   /api/devices/:mac/schedules/:uuid/activate
DELETE /api/devices/:mac/schedules/active
```

## MQTT Push on Mutation

After any create/update: `mqttClient.publish(mac, 'schedule/set', scheduleJson)`  
After activate: `mqttClient.publish(mac, 'schedule/activate', { uuid })`  
After delete: `mqttClient.publish(mac, 'schedule/delete', { uuid })`  
After deactivate: `mqttClient.publish(mac, 'schedule/deactivate', {})`

The schedule JSON shape must match what the controller firmware expects (same as the BLE `create_schedule` payload).

## New File

`src/handlers/schedules.ts` — all schedule handlers  
`src/lib/scheduleSerializer.ts` — converts DB rows ↔ firmware JSON shape

## Done When

- [ ] Create a schedule → stored in DB + pushed to device via MQTT
- [ ] Update a schedule → DB updated + pushed
- [ ] Delete a schedule → DB deleted + push delete command
- [ ] Activate → DB updated + push activate command
- [ ] Deactivate → DB updated + push deactivate command
- [ ] All endpoints return 403 for devices not owned by the requesting user
