# Firmware Changelog — Main Controller

## [0.1.0] — Unreleased

### Added
- ZoneController: 8-zone state machine with start/stop/auto-expiry timers
- WiFiManager: connect on boot, auto-reconnect, NVS credential storage
- RestServer: HTTP REST API on port 80 (zone CRUD, status)
- BleServer: NimBLE GATT server (status notify, zone command write, zone data read)
- CLI: USB serial interface (zone control, WiFi setup, version, reboot)
- Versioning: SemVer in version.h + git SHA injected at build time
