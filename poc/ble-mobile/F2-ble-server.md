# F2 — BleServer Rewrite

**Status:** ⚪ Not started  
**Depends on:** F1  
**Unlocks:** F3, I1, I2, I3

## Goal

Replace the current ad-hoc BLE server with a full command/response dispatcher that covers all use cases. After this phase the firmware BLE surface is functionally equivalent to the REST API, plus adoption.

## Files

| Action | Path |
| :--- | :--- |
| Modify | `firmware/main-controller/include/BleServer.h` |
| Modify | `firmware/main-controller/src/BleServer.cpp` |
| Modify | `firmware/main-controller/src/main.cpp` |

## New Characteristics

Add to the existing service:

| Char | UUID | Properties |
| :--- | :--- | :--- |
| Response | `...90b4` | READ, NOTIFY |
| Provision PIN | `...90b5` | READ |

Both added in `begin()` alongside existing `b1`/`b2`/`b3`.

## Constructor Signature Change

```cpp
// Before
BleServer(ZoneController& zones, AuditLog& audit, ZoneQueue& queue);

// After
BleServer(ZoneController& zones, AuditLog& audit, ZoneQueue& queue,
          Scheduler& scheduler, ClaimManager& claimMgr, TimeManager& time);
```

Update `main.cpp` instantiation accordingly.

## BleCommandCallback

Replace `ZoneCmdCallback` with `BleCommandCallback`. Structure:

```cpp
void onWrite(NimBLECharacteristic* chr) override {
    // 1. Parse request envelope: id, cmd, data, auth_token
    // 2. Auth gate: if claimed && cmd != "get_device_info" && cmd != "claim"
    //              -> verifyOwner(auth_token); on fail -> sendResponse(id, false, error)
    // 3. Dispatch by cmd string
}
```

All handler methods are private on `BleServer` and called from the callback via reference.

## Command Handlers

Implement one private method per command verb. Use `RestServer.cpp` as the reference implementation for all business logic — do not re-derive it, just translate the JSON field names and call the same underlying objects.

| Verb | Handler method |
| :--- | :--- |
| `get_device_info` | `handleGetDeviceInfo` |
| `claim` | `handleClaim` |
| `get_status` | `handleGetStatus` |
| `get_time` / `set_time` | `handleGetTime` / `handleSetTime` |
| `get_zones` / `update_zone` | `handleGetZones` / `handleUpdateZone` |
| `start_zone` / `stop_zone` / `stop_all` | `handleStartZone` / `handleStopZone` / `handleStopAll` |
| `get_schedules` / `get_schedule` / `get_active_schedule` | schedule reads |
| `create_schedule` / `update_schedule` / `delete_schedule` | schedule writes |
| `activate_schedule` / `deactivate_schedule` | schedule activation |
| `get_log` | `handleGetLog` |

## sendResponse and sendChunked

```cpp
// Build full response envelope JSON string, then chunk it
void sendResponse(const char* id, bool ok, const String& dataJson);

// Slice payload into 180-byte chunks, notify b4 for each
void sendChunked(const char* id, const String& payload);
```

`sendChunked` chunk format:
```json
{"id":"...","seq":0,"done":false,"d":"<slice>"}
```

Build each chunk notification with `snprintf` or ArduinoJson — keep it small. The `d` field is a raw string slice; no nested JSON escaping needed since the assembled payload is parsed by the app after reassembly.

## MTU

Call `NimBLEDevice::setMTU(517)` before `NimBLEDevice::init()` in `begin()`.

## Done When

- [ ] Compiles cleanly with new constructor
- [ ] `get_device_info` responds without auth token
- [ ] Auth gate rejects unknown `auth_token`
- [ ] `claim` flow works end-to-end (with F1 ClaimManager)
- [ ] `get_status`, `get_time`, `set_time` respond correctly
- [ ] `start_zone` / `stop_zone` / `stop_all` work via BLE
- [ ] `get_zones`, `update_zone` work
- [ ] All schedule CRUD commands work (verified against serial log)
- [ ] `get_log` returns audit entries
- [ ] Chunked responses reassemble correctly for payloads > 180 bytes
- [ ] Existing `b1` status notifications still fire every 5s
