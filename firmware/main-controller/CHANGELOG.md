# Firmware Changelog — Main Controller

## [0.2.0] — Unreleased

### Added
- Scheduling system: Schedule model, ScheduleStore (NVS ring, 5 slots), Scheduler processor
- TimeManager: NTP sync, timezone/DST storage, ISO date conversion
- AuditLog: 256-entry NVS ring buffer of zone activation events (compact format)
- ChangeLog: 32-entry NVS ring buffer of schedule CRUD history
- REST API: full schedule CRUD, activate, active schedule, log, time endpoints
- CLI: `schedule`, `schedules`, `log` read-only commands
- Keepalive schedule: hardcoded fallback (all zones, 5 min at 6am daily) when no user schedule covers today
- Overlap prevention: scheduler sequences zone runs to avoid simultaneous activation

### Changed
- RestServer: constructor takes Scheduler, AuditLog, ChangeLog, TimeManager refs
- CLI: constructor takes Scheduler, AuditLog refs
- GET /api/status: added ntp_synced, active_schedule_uuid, active_schedule_name

## [0.1.0] — 2026-05-07

### Added
- ZoneController: 8-zone state machine with start/stop/auto-expiry timers
- WiFiManager: connect on boot, auto-reconnect (2-check debounce), NVS credential storage
- RestServer: HTTP REST API on port 80 — full zone CRUD, temperature (C/F), SSID
- BleServer: NimBLE GATT server (status notify, zone command write, zone data read)
  - Characteristic User Description labels (0x2901)
  - Correct setValue using uint8_t* overload
- CLI: USB serial interface — zone control, WiFi setup, version, reboot
  - Command history (Up/Down arrows, 10 entries)
  - TAB completion with longest-common-prefix extension
  - Partial Enter: unique match executes, ambiguous extends
  - Ctrl-U line kill
  - Exact match precedence (stop executes even with stop-all present)
- Logger: thread-safe (FreeRTOS mutex), reprints prompt after background messages
- Versioning: SemVer in version.h + git SHA + build timestamp injected at build time
- Binary named: azul-mc-YYYYMMDD-vX.Y.Z-<sha>.bin
