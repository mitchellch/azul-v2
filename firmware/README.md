# Azul Firmware

ESP32-S3 firmware for the Azul irrigation controllers, built with PlatformIO and the Arduino framework.

## Structure

```
main-controller/          Mains-powered hub controller
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
  platformio.ini

zone-extender/            Battery-powered wireless extender (stub)
  src/main.cpp
  platformio.ini

lib/                      Shared firmware libraries (future)
```

## Current State (May 2026)

`main-controller` has a complete v0.1 firmware skeleton:
- **REST API** — full zone CRUD over HTTP on port 80
- **BLE** — GATT server with status notify, zone command write, zone data read
- **CLI** — USB serial interface with all zone commands + WiFi setup
- **WiFi** — stored credentials in NVS, auto-reconnect

`zone-extender` is a stub — no logic yet.

## Prerequisites

- [PlatformIO](https://platformio.org/install) — IDE extension or CLI
- USB cable (data-capable) for the ESP32-S3-DevKitC-1

## Quick Start

```bash
cd firmware/main-controller

# Build
pio run

# Flash to connected ESP32-S3
pio run --target upload

# Open CLI / serial monitor
pio device monitor
```

On first boot the device has no WiFi credentials. Use the CLI to set them:
```
> wifi-set YourSSID YourPassword
> reboot
```

After reboot, WiFi connects and the REST server starts on port 80. Find the IP:
```
> wifi-status
```

## REST API Quick Reference

```
GET  http://<device-ip>/api/status
GET  http://<device-ip>/api/zones
POST http://<device-ip>/api/zones/1/start   {"duration": 60}
POST http://<device-ip>/api/zones/1/stop
POST http://<device-ip>/api/zones/stop-all
PUT  http://<device-ip>/api/zones/1         {"name": "Front Lawn"}
```

## BLE Quick Reference

Advertising name: `Azul-Controller`

- **Read** Zone Data characteristic to get all zone statuses
- **Write** Zone Command characteristic with JSON: `{"cmd":"start","zone":1,"duration":60}`
- **Subscribe** to Status characteristic for live updates every 5s

See [firmware architecture doc](../docs/design/firmware-architecture.md) for full UUIDs and details.
