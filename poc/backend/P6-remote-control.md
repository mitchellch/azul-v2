# P6 — Remote Zone Control

**Status:** ⚪ Not started  
**Depends on:** P2  
**Unlocks:** Mobile remote control, web zone control

## Goal

Users can start/stop zones from outside BLE range via the API.

## Endpoints (already partially exist — add auth + ownership)

```
POST /api/devices/:mac/zones/:zoneNumber/start    { "duration": 60 }
POST /api/devices/:mac/zones/:zoneNumber/stop
POST /api/devices/:mac/zones/stop-all
```

Each endpoint:
1. Calls `assertDeviceOwner(mac, req.user.id)`
2. Validates zone number (1–8)
3. Publishes MQTT command: `azul/{mac}/cmd/zone/start` etc.
4. Returns `{ ok: true }` — does not wait for confirmation (fire-and-forget)

## Note on Latency

MQTT command → controller response takes ~1-5 seconds depending on broker latency. The API returns immediately. The actual zone state change will be reflected in the next SSE status push (P5) or on the next `GET /api/devices/:mac`.

## Zone name endpoint (already in zones.ts — add auth)

```
GET /api/devices/:mac/zones           — list zones with names
PUT /api/devices/:mac/zones/:number   — update zone name
```

## Done When

- [ ] `POST /api/devices/:mac/zones/1/start` with `{ duration: 60 }` publishes MQTT and returns 200
- [ ] Command reaches the controller (visible in serial monitor: `[BLE] cmd=...` — wait, MQTT not BLE, check MQTT log)
- [ ] `POST /api/devices/:mac/zones/stop-all` stops all zones
- [ ] All endpoints return 403 for unowned devices
