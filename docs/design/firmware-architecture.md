# Firmware Architecture

**Device:** ESP32-S3 (N16R8) — Main Controller
**Framework:** Arduino via PlatformIO
**Status:** v0.1 implemented — WiFi, REST, BLE, CLI

---

## 1. Core Principles

**Single source of truth.** WiFi/REST, BLE, and CLI are all interfaces into one `ZoneController` object. Adding or removing an interface never touches zone logic.

**Non-blocking loop.** `ESPAsyncWebServer` and `NimBLE-Arduino` run on background tasks. The main loop handles zone ticks, CLI polling, and periodic housekeeping only.

**Graceful degradation.** BLE and CLI always start. REST only starts if WiFi connects. The device is always reachable via USB even without network.

---

## 2. Component Map

```
main.cpp
  ├── ZoneController      Shared zone state (start/stop/tick/name)
  ├── WiFiManager         Connect, reconnect, store credentials in NVS
  ├── RestServer          ESPAsyncWebServer — local network HTTP API
  ├── BleServer           NimBLE GATT server — BLE characteristics
  └── CLI                 Serial command parser over USB CDC
```

---

## 3. REST API (port 80)

| Method | Route | Description |
|---|---|---|
| GET | `/api/status` | Device uptime, IP, zones_running flag |
| GET | `/api/zones` | All zones with status and remaining time |
| GET | `/api/zones/:id` | Single zone |
| POST | `/api/zones/:id/start` | Body: `{"duration":60}` |
| POST | `/api/zones/:id/stop` | Stop a specific zone |
| POST | `/api/zones/stop-all` | Stop all zones |
| PUT | `/api/zones/:id` | Body: `{"name":"Front Lawn"}` |

All responses are JSON. CORS headers are included for browser-based development tools.

---

## 4. BLE GATT Server

**Service UUID:** `12345678-1234-1234-1234-1234567890ab`
**Advertising name:** `Azul-Controller`

| Characteristic | UUID suffix | Properties | Description |
|---|---|---|---|
| Status | `...90b1` | READ, NOTIFY | JSON: uptime, zones_running. Notified every 5s. |
| Zone Command | `...90b2` | WRITE | JSON command: `{"cmd":"start","zone":1,"duration":60}` |
| Zone Data | `...90b3` | READ | JSON array of all zones with status |

**Commands (write to Zone Command characteristic):**
```json
{"cmd": "start",    "zone": 1, "duration": 60}
{"cmd": "stop",     "zone": 1}
{"cmd": "stop-all"}
```

---

## 5. CLI (USB Serial, 115200 baud)

Connect via PlatformIO monitor (`pio device monitor`) or any serial terminal.

| Command | Description |
|---|---|
| `help` | List all commands |
| `status` | Uptime, WiFi IP, zones running |
| `zones` | Table of all zones with status |
| `start <id> [seconds]` | Start a zone (default 60s) |
| `stop <id>` | Stop a zone |
| `stop-all` | Stop all zones |
| `wifi-set <ssid> <pass>` | Save credentials to NVS flash |
| `wifi-status` | Show connection status and saved SSID |
| `reboot` | Restart the device |

Credentials set via `wifi-set` survive reboots (stored in NVS via `Preferences`).

---

## 6. WiFi Credential Flow

On first boot, no credentials exist. The REST server is skipped. Use the CLI over USB:

```
> wifi-set MyNetwork MyPassword
WiFi credentials saved for 'MyNetwork'. Reboot to connect.
> reboot
```

On next boot, WiFi connects automatically and the REST server starts.

---

## 7. Main Loop

```
loop()
  ├── zones.tick()              — decrement running zone timers (every loop)
  ├── cli.poll()                — read serial bytes, dispatch on newline
  ├── bleServer.notifyStatus()  — push BLE notification (every 5s)
  └── wifiManager.reconnectIfNeeded() — attempt reconnect if dropped (every 30s)
```

REST and BLE operate asynchronously on ESP-IDF background tasks — they do not block the loop.

---

## 8. Future Additions (not yet implemented)

| Feature | Where it fits |
|---|---|
| MQTT client | New `MqttClient` module, same ZoneController interface |
| OTA firmware update | New `OtaManager` module, triggered via REST or CLI |
| LoRa gateway | New `LoRaGateway` module, relays commands to Zone Extenders |
| Zone Extender firmware | Separate PlatformIO project in `firmware/zone-extender/` |
| Solenoid GPIO drivers | Add to `ZoneController::startZone()` / `stopZone()` |
| Schedule execution | New `Scheduler` module, calls into ZoneController |

---

## 9. Versioning

Firmware versions follow SemVer (`MAJOR.MINOR.PATCH`) with a git SHA suffix.

**Version string examples:**
```
0.1.0-abc1234         Clean build from commit abc1234
0.1.0-abc1234-dirty   Built with uncommitted changes
```

**How it works:**
- `include/version.h` — manually maintained SemVer numbers, committed to git
- `scripts/inject_version.py` — PlatformIO pre-build script, injects `FW_GIT_SHA` and `FW_GIT_DIRTY` as compiler defines
- `platformio.ini` — `extra_scripts = pre:scripts/inject_version.py`

**Where version appears:**
- Boot banner in CLI
- `version` CLI command (full detail: semver + SHA + dirty flag)
- `status` CLI command
- `GET /api/status` → `"firmware"` field
- BLE status characteristic JSON → `"firmware"` field

**Bumping a version:**
1. Update `FW_VERSION_MAJOR/MINOR/PATCH` in `include/version.h`
2. Update `custom_fw_version` in `platformio.ini` (used in build log)
3. Add an entry to `CHANGELOG.md`
4. Commit and tag: `git tag firmware-mc-v0.2.0`

**Git tag convention:**
- Main controller: `firmware-mc-vX.Y.Z`
- Zone extender: `firmware-ze-vX.Y.Z`

## 10. Build & Flash

```bash
cd firmware/main-controller

# Build
pio run

# Flash (ESP32-S3 connected via USB)
pio run --target upload

# Open serial monitor / CLI
pio device monitor
```

The ESP32-S3-DevKitC-1 uses native USB CDC — no FTDI adapter needed. On first plug-in macOS may need a moment to enumerate the port.
