# Mobile Connectivity: Cloud vs BLE

**Status:** Approved  
**Scope:** How the Azul mobile app decides whether to communicate with a controller via the cloud backend (MQTT) or directly via BLE.

---

## 1. Design Decision

BLE is a **fallback** for when WiFi is unavailable or unreliable — not the primary communication channel. The mobile app defaults to cloud mode and only switches to BLE when the user explicitly chooses to.

This keeps mobile and web behavior in sync under normal conditions. BLE exists for local resilience, not everyday use.

---

## 2. Communication Modes

### Cloud Mode (default)

```
Mobile App → Backend API → MQTT Broker → Controller
```

- Requires internet access on the mobile device
- Requires the controller to be WiFi-connected
- Mobile and web apps stay in sync via the backend database
- All state changes are persisted to PostgreSQL

### Local Mode (BLE)

```
Mobile App ↔ Controller (BLE, direct)
```

- No internet required
- Works when controller WiFi is unavailable or degraded
- Changes are stored on the controller and synced to the backend when WiFi returns
- Web app will not reflect BLE-only changes until the controller reconnects to WiFi

---

## 3. Connection Health Grading

The backend monitors each controller's MQTT health using a **5-minute rolling window** of status pings. Each `azul/{mac}/status` message from the controller is recorded as a ping.

| Grade | Last message | Missed pings | Mobile action |
|---|---|---|---|
| **good** | < 30s ago | 0 | Proceed in cloud mode |
| **degraded** | 30–60s ago | 1–2 | Show warning indicator |
| **poor** | 60–120s ago | 3+ | Prompt user to switch to BLE |
| **offline** | > 120s ago | all | Show "offline" — BLE only |

### Endpoint

```
GET /api/devices/:mac/connection-status

Response:
{
  "mac": "e8:f6:0a:85:4c:90",
  "status": "good | degraded | poor | offline",
  "lastSeen": "2026-05-10T15:30:45Z",
  "missedPings": 0,
  "pingIntervalAvgMs": 62000,
  "recommendLocalMode": false,
  "reason": "Last message 12s ago"
}
```

Implementation: `server/src/lib/connectionMonitor.ts`

---

## 4. Mobile Startup Flow

```
App launches
    │
    ▼
GET /api/devices/:mac/connection-status
    │
    ├─ status == "good" or "degraded"
    │       └─▶ Proceed in cloud mode
    │
    ├─ status == "poor"
    │       └─▶ Prompt: "Connection unstable. Use Bluetooth instead?"
    │                   ├─ Yes → enter local BLE mode
    │                   └─ No  → proceed in cloud mode anyway
    │
    └─ status == "offline"
            └─▶ Show: "Controller offline. Bluetooth only."
                        └─▶ Enter local BLE mode
```

The user's mode choice is **not sticky** — it is evaluated fresh on every app launch. This ensures the app always prefers cloud mode when the connection recovers.

---

## 5. Sync on Reconnect

When a controller returns to WiFi after a period of BLE-only local control:

1. Controller reconnects to MQTT broker
2. Controller publishes full schedule list to `azul/{mac}/schedules`
3. Backend syncs schedules from controller to database (controller is source of truth)
4. Web app receives `schedules_synced` SSE event and refreshes its schedule list

**Conflict resolution:** The controller always wins. Any changes made via the web app while the controller was offline may be overwritten by the controller's state on reconnect. This is acceptable because:
- The controller is the physical device — its state is what actually runs
- Web-only changes that weren't pushed to the controller via MQTT were never applied anyway

---

## 6. Web App

The web app has no BLE capability. If a controller is offline, the web app shows an "offline" indicator but cannot fall back to local control. Users should use the mobile app for local control when WiFi is unavailable.

---

## 7. Related Documents

- [ble-mobile-protocol.md](ble-mobile-protocol.md) — BLE GATT service, command catalogue, auth model
- [cloud-api-architecture.md](cloud-api-architecture.md) — Backend API, MQTT protocol, database schema
