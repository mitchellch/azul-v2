# F3 — ScheduleJson Shared Helpers

**Status:** ⚪ Not started  
**Depends on:** F2  
**Unlocks:** Clean code; required before M10 integration testing

## Goal

`jsonToSchedule()` and `scheduleToJson()` currently live as private methods in `RestServer.cpp`. Both `RestServer` and `BleServer` need them. Extract to a shared compilation unit so the logic lives in exactly one place.

## Files

| Action | Path |
| :--- | :--- |
| Create | `firmware/main-controller/include/ScheduleJson.h` |
| Create | `firmware/main-controller/src/ScheduleJson.cpp` |
| Modify | `firmware/main-controller/src/RestServer.cpp` |
| Modify | `firmware/main-controller/src/BleServer.cpp` |

## API

```cpp
// ScheduleJson.h
#pragma once
#include <ArduinoJson.h>
#include "ScheduleModel.h"
#include "TimeManager.h"

// Serialize a Schedule to a JsonObject within an existing document
void scheduleToJson(const Schedule& s, JsonObject& obj);

// Parse a JsonVariant into a Schedule; writes error message to errOut on failure
bool jsonToSchedule(const JsonVariant& body, Schedule& s, char* errOut, size_t errLen);
```

## Migration

1. Copy the existing implementations from `RestServer.cpp` into `ScheduleJson.cpp`.
2. Replace the private method calls in `RestServer.cpp` with calls to the free functions.
3. Replace the duplicated implementations in `BleServer.cpp` with calls to the free functions.
4. Confirm both files compile and all schedule operations still work.

## Done When

- [ ] `ScheduleJson.h` / `.cpp` compile standalone
- [ ] `RestServer.cpp` has no local `scheduleToJson`/`jsonToSchedule` — uses shared versions
- [ ] `BleServer.cpp` has no local `scheduleToJson`/`jsonToSchedule` — uses shared versions
- [ ] All schedule REST endpoints still pass (regression check)
- [ ] All schedule BLE commands still work
