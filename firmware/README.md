# Azul Firmware

ESP32-S3 firmware for the Azul irrigation controllers, built with PlatformIO and the Arduino framework.

## Structure

```
main-controller/
  src/
    main.cpp              Entry point — wires all modules together
    ZoneController.cpp    Zone state machine (shared by all interfaces)
    WiFiManager.cpp       WiFi connect/reconnect, NVS credential storage
    RestServer.cpp        HTTP REST API (ESPAsyncWebServer)
    BleServer.cpp         BLE GATT server (NimBLE-Arduino)
    CLI.cpp               USB serial command-line interface
  include/
    ZoneController.h
    WiFiManager.h
    RestServer.h
    BleServer.h
    CLI.h
    version.h             SemVer constants — bump here when releasing
  test/
    test_zone_controller/ Unit tests for ZoneController (runs on host)
  scripts/
    inject_version.py     PlatformIO pre-build script — injects git SHA
  platformio.ini
  CHANGELOG.md

zone-extender/            Battery-powered wireless extender (stub)
lib/                      Shared firmware libraries (future)
```

## Current State (May 2026)

`main-controller` v0.1.0 — first successful build. Implements:
- **REST API** — full zone CRUD over HTTP on port 80
- **BLE** — GATT server with status notify, zone command write, zone data read
- **CLI** — USB serial interface with zone control + WiFi setup
- **WiFi** — stored credentials in NVS, auto-reconnect
- **Versioning** — SemVer + git SHA in binary name and all interfaces
- **Unit tests** — 21 tests for ZoneController, run on host via native platform

`zone-extender` is a stub — no logic yet.

---

## Prerequisites

| Tool | Install |
|---|---|
| PlatformIO CLI | `pip3 install platformio` |
| PlatformIO VS Code extension | [marketplace.visualstudio.com](https://marketplace.visualstudio.com/items?itemName=platformio.platformio-ide) |
| USB data cable | For flashing and serial monitor |

All library dependencies (RadioLib, ESPAsyncWebServer, NimBLE-Arduino, ArduinoJson) are downloaded automatically on first build.

---

## Build

```bash
cd firmware/main-controller

# Build for ESP32-S3 (default)
pio run

# Build and show verbose output
pio run -v

# Clean build artifacts and rebuild from scratch
pio run --target clean && pio run
```

**Output binary:** `.pio/build/esp32-s3/azul-mc-<date>-v<version>-<sha>.bin`

The binary name is automatically generated at build time from the date, version in `platformio.ini`, and the current git SHA. A `-dirty` suffix is appended if there are uncommitted changes.

Example: `azul-mc-20260507-v0.1.0-182a46c.bin`

---

## Flash

```bash
cd firmware/main-controller

# Flash to connected ESP32-S3 (auto-detects port)
pio run --target upload

# Flash to a specific port
pio run --target upload --upload-port /dev/cu.usbmodem*
```

The ESP32-S3-DevKitC-1 uses native USB CDC — no FTDI adapter needed. On first plug-in, macOS may take a moment to enumerate the port.

---

## Serial Monitor / CLI

```bash
cd firmware/main-controller

# Open serial monitor (115200 baud, with crash decoder)
pio device monitor

# Exit: Ctrl+C
```

The monitor filter `esp32_exception_decoder` is enabled — if the device crashes and prints a stack trace, it automatically translates hex addresses to function names and line numbers using the `.elf` file.

### CLI Commands

Once connected, type `help` to see all commands:

| Command | Description |
|---|---|
| `status` | Firmware version, uptime, WiFi IP, zones running |
| `zones` | Table of all zones with status and remaining time |
| `start <id> [seconds]` | Start a zone (default 60s) |
| `stop <id>` | Stop a zone |
| `stop-all` | Stop all zones |
| `wifi-set <ssid> <pass>` | Save WiFi credentials to flash |
| `wifi-status` | Show connection status and saved SSID |
| `version` | Full version string with git SHA |
| `reboot` | Restart the device |

### First Boot WiFi Setup

On first boot there are no WiFi credentials. Use the CLI:

```
> wifi-set YourNetworkName YourPassword
WiFi credentials saved for 'YourNetworkName'. Reboot to connect.
> reboot
```

After reboot, find the IP address:

```
> wifi-status
Connected to: YourNetworkName
IP Address:   192.168.1.42
Signal:       -55 dBm
```

---

## Unit Tests

Tests run on the host machine (Mac/Linux) — no ESP32 required.

```bash
cd firmware/main-controller

# Run all unit tests
pio test -e native

# Run with verbose output
pio test -e native -v
```

**Expected output:**

```
============ 21 test cases: 21 succeeded in 00:00:05 ==================
```

### What is tested

`ZoneController` is the only component with logic suitable for host-side unit testing. The other modules (`WiFiManager`, `RestServer`, `BleServer`, `CLI`) wrap hardware and network APIs that require a real device.

| Test group | Count | Covers |
|---|---|---|
| Initial state | 3 | All zones idle, correct IDs, no zones running |
| `startZone` | 5 | Valid start, sets running flag, invalid IDs rejected, multiple zones |
| `stopZone` | 4 | Stop running zone, stop idle zone safely, invalid IDs, clears flag |
| `stopAll` | 2 | Clears all zones, safe on idle controller |
| `setZoneName` | 3 | Name set, invalid ID safe, long name truncated |
| `getZone` | 1 | Invalid ID returns null |
| `tick` | 3 | Idle zones unaffected, zone expires, only correct zone expires |

### Test infrastructure

- **Framework:** Unity (via PlatformIO native platform)
- **Arduino stub:** `test/test_zone_controller/arduino_stub.h` — minimal stubs for `millis()`, `Serial`, `delay()` so `ZoneController` compiles on the host
- **`UNIT_TEST` define:** Guards `#include <Arduino.h>` in `ZoneController.h` — when set, uses the stub instead

---

## Integration Tests

Tests run against a live device over WiFi — ESP32 must be flashed and connected to the same network.

```bash
cd firmware/main-controller

# Install dependencies (once)
pip3 install -r tests/integration/requirements.txt

# Run against the default IP (192.168.1.207)
python3 -m pytest tests/integration/ -v

# Run against a specific device IP
python3 -m pytest tests/integration/ --host=192.168.1.42 -v
```

**Expected output:**

```
============================= 37 passed in 22.59s ==============================
```

### What is tested

| File | Count | Covers |
|---|---|---|
| `test_status.py` | 7 | Device fields, firmware format, `zones_running` flag |
| `test_zones.py` | 9 | Zone list shape, count, field validation, single zone, invalid ID |
| `test_zone_control.py` | 14 | Start/stop/stop-all, timer countdown, auto-expiry, error handling |
| `test_zone_update.py` | 7 | Zone rename, persistence, 400/404 error handling |

### Test infrastructure

- **Framework:** pytest + requests
- **`conftest.py`:** `--host` CLI option, session-scoped API fixture, `autouse` fixture that stops all zones before and after every test to ensure a clean slate

---

## REST API Quick Reference

```
GET  http://<device-ip>/api/status              Device info, firmware version, uptime
GET  http://<device-ip>/api/zones               All zones with status
GET  http://<device-ip>/api/zones/1             Single zone
POST http://<device-ip>/api/zones/1/start       Body: {"duration": 60}
POST http://<device-ip>/api/zones/1/stop
POST http://<device-ip>/api/zones/stop-all
PUT  http://<device-ip>/api/zones/1             Body: {"name": "Front Lawn"}
```

---

## BLE Quick Reference

Advertising name: `Azul-Controller`

- **Read** Zone Data characteristic — JSON array of all zones
- **Write** Zone Command characteristic — `{"cmd":"start","zone":1,"duration":60}`
- **Subscribe** to Status characteristic — JSON status pushed every 5s

See [firmware architecture doc](../docs/design/firmware-architecture.md) for full UUIDs and details.

---

## Versioning

Bump the version in two places when making a release:

1. `include/version.h` — update `FW_VERSION_MAJOR/MINOR/PATCH`
2. `platformio.ini` — update `custom_fw_version`
3. Add an entry to `CHANGELOG.md`
4. Commit and tag: `git tag firmware-mc-v0.2.0`

See [firmware architecture doc](../docs/design/firmware-architecture.md) for full versioning details.
