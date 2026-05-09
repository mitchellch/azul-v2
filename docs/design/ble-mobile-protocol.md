# BLE Mobile Protocol Specification

**Status:** Approved  
**Scope:** All BLE communication between the Azul mobile app and the main controller firmware.

---

## 1. GATT Service and Characteristics

Service UUID: `12345678-1234-1234-1234-1234567890ab` (unchanged)

| Name | UUID | Properties | Description |
| :--- | :--- | :--- | :--- |
| Status | `...90b1` | READ, NOTIFY | Device status JSON. Pushed every 5s and on state change. |
| Command | `...90b2` | WRITE | All request commands from app to firmware. |
| Zone Data | `...90b3` | READ | Zone snapshot. Unchanged from current implementation. |
| Response | `...90b4` | READ, NOTIFY | Firmware response after processing a command. |
| Provision PIN | `...90b5` | READ | 6-digit ASCII PIN while unclaimed. Empty string post-claim. |

`b4` and `b5` are new additions. `b1`, `b2`, `b3` are backward compatible — the command payload contract on `b2` changes but the characteristic UUID is preserved.

---

## 2. Request / Response Framing

All messages are JSON. App writes to `b2`; firmware notifies `b4`.

### Request envelope (app → firmware)

```json
{
  "id": "<uuid4>",
  "cmd": "<verb>",
  "data": { ... },
  "auth_token": "<owner_sub>"
}
```

- `id` — UUID4 generated per-request. Echoed in the response for matching.
- `cmd` — verb string. See Section 4.
- `data` — optional, command-specific payload.
- `auth_token` — Auth0 `sub` of the claimed owner. Omit only for `get_device_info` and `claim`.

### Response envelope (firmware → `b4`)

```json
{ "id": "<echo>", "ok": true, "data": { ... } }
{ "id": "<echo>", "ok": false, "error": "<message>" }
```

---

## 3. Chunked Transfer

BLE ATT payloads are limited by the negotiated MTU. Firmware uses a conservative **180-byte slice** for the `d` field — safe at any MTU ≥ 183 bytes, which is always negotiated on iOS and Android.

### Chunk notification format

```json
{ "id": "<echo>", "seq": 0, "done": false, "d": "<payload slice>" }
{ "id": "<echo>", "seq": 1, "done": true,  "d": "<payload slice>" }
```

The `d` field carries a raw string slice of the full response envelope JSON. The app concatenates all `d` values in `seq` order and parses the assembled string when `done: true` is received.

Single-response payloads under 180 bytes are sent as one chunk with `done: true` and `seq: 0`.

### App reassembly state machine

```
Map<id, { chunks: string[], resolve, reject, timer }>
```

On each notification:
1. Look up pending request by `id`.
2. Append `d` to `chunks`.
3. If `done: true`: concatenate, parse, resolve. Clear timer.
4. If timer fires before `done: true`: reject with timeout error.

### Timeouts

| Operation | Timeout |
| :--- | :--- |
| Default | 10s |
| `get_schedules`, `create_schedule`, `update_schedule` | 15s |

### One command in flight

The app must serialize commands — do not write a second command to `b2` until the first resolves. Implement a command queue in the BLE service layer. Disable action buttons in the UI while a command is pending.

---

## 4. Command Verb Catalogue

### Provisioning

| Command | Auth required | Request `data` | Response `data` |
| :--- | :--- | :--- | :--- |
| `get_device_info` | No | — | `{firmware, build, claimed, mac}` |
| `claim` | No | `{pin, owner_sub}` | `{claimed: true}` |

### Configuration

| Command | Auth required | Request `data` | Response `data` |
| :--- | :--- | :--- | :--- |
| `get_status` | Yes | — | Same shape as `GET /api/status` |
| `get_time` | Yes | — | Same shape as `GET /api/time` |
| `set_time` | Yes | `{epoch, tz_offset, tz_dst, tz_name}` | `{ok: true}` |

### Zones

| Command | Auth required | Request `data` | Response `data` |
| :--- | :--- | :--- | :--- |
| `get_zones` | Yes | — | Zone array |
| `update_zone` | Yes | `{id, name}` | `{ok: true}` |
| `start_zone` | Yes | `{id, duration}` | `{ok: true}` |
| `stop_zone` | Yes | `{id}` | `{ok: true}` |
| `stop_all` | Yes | — | `{ok: true}` |

### Schedules

| Command | Auth required | Request `data` | Response `data` |
| :--- | :--- | :--- | :--- |
| `get_schedules` | Yes | — | Schedule array |
| `get_schedule` | Yes | `{uuid}` | Schedule object |
| `get_active_schedule` | Yes | — | Schedule object or `null` |
| `create_schedule` | Yes | Schedule object (no uuid) | `{uuid}` |
| `update_schedule` | Yes | Schedule object (with uuid) | `{ok: true}` |
| `delete_schedule` | Yes | `{uuid}` | `{ok: true}` |
| `activate_schedule` | Yes | `{uuid}` | `{ok: true}` |
| `deactivate_schedule` | Yes | — | `{ok: true}` |

### Logs

| Command | Auth required | Request `data` | Response `data` |
| :--- | :--- | :--- | :--- |
| `get_log` | Yes | `{n}` | Audit entry array |

---

## 5. Authentication Model

### v1 (current)

The `auth_token` field carries the Auth0 `sub` (e.g. `auth0|abc123`). Firmware does a `strcmp` against the stored `owner_sub` in NVS. No JWT verification on-device.

**Trust model:** physical BLE proximity + knowledge of the owner's `sub` = authorized. The `sub` is available from the decoded `id_token` in the mobile session. Never put a raw access token in a BLE characteristic.

**Known limitation:** The `sub` is stable and not secret. Anyone with BLE range and the owner's `sub` can issue commands. Acceptable for v1 — document as a known risk and plan to upgrade to HMAC challenge/response in a future firmware version.

### Claim flow

1. First boot: firmware checks NVS `"azble"/"owner_sub"`. If absent: device is unclaimed.
2. Firmware generates `esp_random() % 1000000`, zero-pads to 6 digits, stores to NVS `"azble"/"pin"`, exposes on `b5`.
3. App scans, connects, reads `b5`, shows PIN to user for visual confirmation.
4. App sends `claim` with PIN + Auth0 `sub`.
5. Firmware validates PIN, writes `owner_sub` to NVS, sets `b5` value to `""`.
6. `b5` characteristic remains in GATT table (NimBLE cannot remove chars at runtime) but returns empty string. App uses `get_device_info` response to determine claim status.

---

## 6. Implementation Notes

- **MTU:** Call `NimBLEDevice::setMTU(517)` before `NimBLEDevice::init()`. Actual MTU is negotiated after connection — read it only in the `onMTUChange` callback, not immediately after connect.
- **WRITE vs WRITE_NO_RESPONSE:** Use `NIMBLE_PROPERTY::WRITE` on `b2`. The write ACK confirms receipt; the app starts its response timeout only after the ACK.
- **Notification re-subscription:** `react-native-ble-plx` subscriptions do not survive disconnect/reconnect. The `connect()` function in the mobile BLE service must re-subscribe to `b4` and `b1` on every connection.
- **Zone name persistence:** `ZoneController` currently stores names in RAM only. BLE renames are lost on reboot. Firmware phase F4 adds NVS persistence to fix this for both BLE and REST.
- **Schedule JSON size:** 5 schedules × 24 runs ≈ 4–5 KB → ~28 chunks. The 15s timeout covers this.
