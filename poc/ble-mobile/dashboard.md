# BLE Mobile Control — Implementation Dashboard

**Objective:** Full BLE-based mobile control of the Azul irrigation controller, from device adoption through schedule management and log viewing.

**Protocol spec:** [`docs/design/ble-mobile-protocol.md`](../../docs/design/ble-mobile-protocol.md)

---

## Status Key

| Symbol | Meaning |
| :--- | :--- |
| ⚪ | Not started |
| 🔵 | In progress |
| ✅ | Complete |
| ❌ | Blocked |

---

## Firmware Phases

| Phase | Description | Status | Depends on | Details |
| :--- | :--- | :--- | :--- | :--- |
| **F1** | ClaimManager — device identity and TOFU ownership in NVS | ✅ | — | [Details](F1-claim-manager.md) |
| **F2** | BleServer rewrite — command/response infrastructure, all verb handlers | ✅ | F1 | [Details](F2-ble-server.md) |
| **F3** | ScheduleJson helpers — shared serialization between RestServer and BleServer | ✅ | F2 | [Details](F3-schedule-json.md) |
| **F4** | Zone name NVS persistence — survive reboot for BLE and REST renames | ✅ | — | [Details](F4-zone-persistence.md) |

## Mobile Phases

| Phase | Description | Status | Depends on | Details |
| :--- | :--- | :--- | :--- | :--- |
| **M1** | Install `react-native-ble-plx`, configure permissions | ✅ | — | [Details](M1-ble-library.md) |
| **M2** | BLE service layer — scan, connect, sendCommand, chunked reassembly | ✅ | M1 | [Details](M2-ble-service.md) |
| **M3** | Controller store — Zustand + AsyncStorage persistence | ✅ | — | [Details](M3-controller-store.md) |
| **M4** | Scan screen — discover nearby controllers | ✅ | M2 | [Details](M4-scan-screen.md) |
| **M5** | Adopt screen — PIN confirmation and claim flow | ✅ | M2, M3 | [Details](M5-adopt-screen.md) |
| **M6** | Home screen — controller list, navigate to detail | ✅ | M3, M5 | [Details](M6-home-screen.md) |
| **M7** | Controller detail — status, zone cards, quick controls | ✅ | M2, M6 | [Details](M7-controller-detail.md) |
| **M8** | Zone settings screen — rename zones | ✅ | M7 | [Details](M8-zone-settings.md) |
| **M9** | Settings screen — time/timezone sync | ✅ | M7 | [Details](M9-settings-screen.md) |
| **M10** | Schedules screen — full CRUD and activate/deactivate | ✅ | M7 | [Details](M10-schedules-screen.md) |
| **M11** | Logs screen — audit log view | ✅ | M7 | [Details](M11-logs-screen.md) |

---

## Integration Milestones

These are the "working end-to-end" checkpoints. Don't advance past one until it passes.

| # | Description | Requires |
| :--- | :--- | :--- |
| **I1** | App discovers and adopts a real controller over BLE | F1, F2, M1–M5 |
| **I2** | App displays live zone status from controller | F2, M7 |
| **I3** | App can start/stop zones and view audit log | F2, M7, M11 |
| **I4** | App can create, activate, and delete a schedule | F2, F3, M10 |
| **I5** | All zone renames survive controller reboot | F4, M8 |

---

## Parallel Work Allowed

- F1 and M1 have no dependencies — start both immediately.
- F2 and M2 can be built in parallel against the frozen protocol spec — integrate at I1.
- F4 is independent of F2 — can be done any time.
- M3 is independent of M1/M2 — can be done any time.
- M8, M9, M10, M11 are all independent of each other — parallelize once M7 exists.
