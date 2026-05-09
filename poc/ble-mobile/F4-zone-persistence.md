# F4 — Zone Name NVS Persistence

**Status:** ⚪ Not started  
**Depends on:** Nothing (independent)  
**Unlocks:** I5

## Goal

Zone names currently live only in RAM. Any rename — via BLE or REST — is lost on reboot. Add NVS persistence to `ZoneController` so names survive power cycles.

## Files

| Action | Path |
| :--- | :--- |
| Modify | `firmware/main-controller/include/ZoneController.h` |
| Modify | `firmware/main-controller/src/ZoneController.cpp` |

## NVS

Namespace: `"zones"`  
Keys: `"z1"` through `"z8"` (zone name strings, max 32 chars)

## Changes

1. In `ZoneController::begin()` (or `init()`): open NVS namespace `"zones"`, load each zone name if present.
2. In `ZoneController::setZoneName(id, name)`: write to NVS after updating the in-memory struct.
3. Default names (`"Zone 1"` etc.) are not written to NVS — only explicitly set names are. On load, if a key is absent the default name is used.

## Done When

- [ ] Zone names persist across reboot when set via REST `PATCH /api/zones/:id`
- [ ] Zone names persist across reboot when set via BLE `update_zone`
- [ ] Default names still appear for zones that have never been renamed
- [ ] NVS write happens only on name change, not on every tick
