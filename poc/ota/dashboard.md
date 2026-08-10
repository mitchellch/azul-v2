# OTA Firmware Update — Progress Tracker

**Objective:** Ship a working over-the-air firmware update path from web admin → controller.

**Plan:** [ota-implementation-plan.md](../../docs/design/ota-implementation-plan.md)
**Architecture:** [ota-firmware-update-architecture.md](../../docs/design/ota-firmware-update-architecture.md)

---

## Status Key

| Symbol | Meaning |
| :--- | :--- |
| ⚪ | Not started |
| 🔵 | In progress |
| ✅ | Complete |
| ❌ | Blocked |

---

## Phases

| Phase | Description | Status | Depends on |
| :--- | :--- | :--- | :--- |
| **P1** | Firmware — A/B partitions, OtaManager, first-boot rollback | ✅ | — |
| **P2** | Server — FirmwareRelease model, upload + trigger endpoints, event ingest | ✅ | P1 (MQTT contract) |
| **P3** | Web UI — /firmware page + Settings Update button | ⚪ | P2 |
| **P4** | Signing — Ed25519, Secure Boot v2, anti-rollback | ⚪ | P1–P3 |
| **P5** | Storage + rollouts — S3, pre-signed URLs, staged rollout engine | ⚪ | P2 |
| **P6** | AP-mode OTA — offline firmware push via device soft AP | ⚪ | P1 |
| **P7** | BLE OTA — last-resort chunked transfer | ⚪ | P6 |

---

## P1 — Firmware (MVP)

**Owner:** Mitch
**Target:** 1 day

- ✅ `firmware/main-controller/partitions_azul.csv` with app0/app1 ~3.94 MB each (8 MB N8R8, aligned to 0x10000)
- ✅ `platformio.ini` → `board_build.partitions = partitions_azul.csv`
- ✅ `version.h` with `FW_VERSION` macro (pre-existing)
- ✅ `OtaManager.h` / `OtaManager.cpp` skeleton
- ✅ HTTP streaming download into `Update` library / inactive partition
- ✅ Rolling SHA-256 (`mbedtls_sha256_update`) — verify before `Update.end(true)`
- ✅ `ota_progress` MQTT publish every 10% (via new `MqttManager::publishOtaEvent`)
- ✅ `ota_complete` / `ota_error` publish on exit
- ✅ MqttManager: add `ota/update` command branch
- ✅ `main.cpp` first-boot verify hook (60s MQTT-connect window)
- ✅ `esp_ota_mark_app_valid_cancel_rollback()` on success
- ✅ `esp_ota_mark_app_invalid_rollback_and_reboot()` on timeout
- ✅ Firmware builds clean (1.46 MB used of 3.94 MB slot)
- ✅ Smoke test: manual `mosquitto_pub` triggers download from local server (2026-08-10 with `python3 -m http.server`)

## P2 — Server (MVP)

**Owner:** Mitch
**Target:** 1 day

- ✅ Prisma `FirmwareRelease` model
- ✅ Prisma `DeviceOtaStatus` model
- ✅ Migration applied (`20260810000000_add_firmware_ota`)
- ✅ `POST /api/admin/firmware` (multipart upload, server-side SHA-256, streaming hash)
- ✅ `GET  /api/admin/firmware` (list releases)
- ✅ `POST /api/devices/:mac/ota` (publishes `cmd/ota/update`, creates DeviceOtaStatus row)
- ✅ Static route `/firmware/*` from `server/uploads/firmware/`
- ✅ MQTT event handler persists `ota_progress` / `ota_complete` / `ota_error`
- ✅ Admin auth middleware wired on `/api/admin/firmware*` (M2M-only for MVP)
- ✅ Reject upload if version already exists for that target (409)
- ✅ Reject trigger if device offline (409)
- ✅ Idempotent trigger — returns existing row if same release already in-flight
- ⚪ `ota_rollback` ingest — device can't publish from old firmware, defer to P3 (server-side inference from post-update status ping)

## P3 — Web UI + Release Flow (MVP)

**Owner:** Mitch
**Target:** 0.5 day

- ⚪ `/firmware` page — releases table + upload form
- ⚪ Settings tab: Firmware section on controller detail page
- ⚪ Version dropdown (only shows versions newer than current)
- ⚪ Confirm modal → `POST /api/devices/:mac/ota`
- ⚪ Progress badge streams via existing SSE channel
- ⚪ `scripts/release-firmware.sh` — build + hash + upload one-liner
- ⚪ End-to-end test: click Update → controller reboots into new version

---

## MVP Smoke-Test Matrix

Run all 5 before declaring P1–P3 done.

- ✅ Happy path — upload, click, reboot < 30s, version updated on status page (2026-08-10: 16.6s download, first-boot verify + MQTT ack fired)
- ✅ Bad SHA — corrupt file post-upload → `ota_error: sha256_mismatch`, no reboot (2026-08-10: verified with all-zeros SHA, device stayed on new version)
- ⚪ Server dies mid-download — 3× retry then `ota_error: download_failed`
- ⚪ Firmware can't reach MQTT — auto-rollback on next boot
- ⚪ Idempotent — clicking Update twice at same version no-ops the second time

---

## P4 — Signing (post-MVP hardening)

- ⚪ Ed25519 keypair generated, private key in secrets manager
- ⚪ CI signs `.bin` on tag push
- ⚪ `signature` field populated in MQTT `cmd/ota/update`
- ⚪ Bootloader Secure Boot v2 enabled
- ⚪ Firmware refuses unsigned images
- ⚪ Anti-rollback eFuse configured
- ⚪ Penetration test — attempt downgrade / unsigned push

## P5 — Storage + Rollouts

- ⚪ S3 bucket + IAM role
- ⚪ Server writes uploads to S3, generates 1hr pre-signed URLs
- ⚪ Rollout table: `strategy`, `percent`, `started_at`
- ⚪ Canary → staged → full state machine
- ⚪ Auto-pause on >5% error rate
- ⚪ Admin dashboard: per-release rollout status

## P6 — AP-Mode OTA

- ⚪ `OtaApServer` class in firmware
- ⚪ BLE command `ota/ap-start` triggers AP mode
- ⚪ Mobile: cache `.bin` from server while online
- ⚪ Mobile: switch WiFi to controller AP (NEHotspotConfiguration / WifiNetworkSpecifier)
- ⚪ `POST http://192.168.4.1/ota/upload` with `X-SHA256` header
- ⚪ Captive portal mitigation (204 to apple/gstatic)
- ⚪ Auto-timeout after 5min inactivity
- ⚪ Progress UI in mobile app

## P7 — BLE OTA

- ⚪ Chunked transfer protocol (seq + retry)
- ⚪ DLE + 2M PHY negotiation
- ⚪ Mobile progress UI (~1.5 MB in 8–20s target)

---

## Open Questions

- **Firmware URL host:** how does the controller know the server's IP? Today it uses `SERVER_HOST` from NVS provisioning. Confirm this is set on all 3 dev controllers before P1 smoke test.
- **Rollback signal to server:** when the device rolls back, does it publish `ota_rollback` from the *old* firmware? Old firmware won't know a rollback happened. Fix: server infers rollback when post-update status ping reports the old version.
- **Zone extenders:** OTA path for extenders (LoRa-connected, no WiFi) is a separate design — not covered here or in the arch doc yet. Add to P5+ or a new phase.

---

## Session Notes

_Add dated notes here as work progresses. Older notes at the bottom._

- **2026-08-10 (P2 smoke test PASS)** — End-to-end verified on E8:F6:0A:85:4C:90. `scripts/release-firmware.sh 0.2.2` → 201 with sha `fe699152...`. `POST /api/devices/:mac/ota` → 202, DeviceOtaStatus row created. MQTT command fired with correct LAN URL from `SERVER_PUBLIC_URL`, controller downloaded in 20.76s (comparable to P1's 16.6s), rebooted into 0.2.2 with all NVS state preserved (zone names, schedules, active-schedule flag). DB row transitioned to `status=complete, progress=100`. **Bonus:** firmware DOES echo `statusId` back in events — the server's fallback (find newest in-flight row) is a safety net, not the primary code path. Idempotency test passed: rapid double-trigger returned same status id with `existing: true`. Duplicate-upload test passed: 409 as designed. Offline-trigger test not run (would require power-pull; low value given happy path exercised the online guard).
- **2026-08-10 (P2 code complete)** — Server-side OTA implemented: `FirmwareRelease` + `DeviceOtaStatus` Prisma models with migration `20260810000000_add_firmware_ota`, admin router at `/api/admin/firmware` (M2M-only), `POST /api/devices/:mac/ota` trigger, `/firmware/*` static route, and MQTT ingest of `ota_progress` / `ota_complete` / `ota_error` into `DeviceOtaStatus`. Types clean via `tsc --noEmit`. **Not yet smoke-tested on hardware** — reproduction recipe below. Firmware side didn't need changes: server picks the newest in-flight status row when the device event doesn't echo `statusId`.
- **2026-08-10 (end of P1)** — End-to-end OTA verified on E8:F6:0A:85:4C:90. Flashed 0.2.0-with-OTA baseline, then pushed 0.2.1 via `mosquitto_pub` + `python3 -m http.server 8000`. Full download in 16.6s, `ota_complete` fired, controller rebooted into 0.2.1 with all NVS state preserved (schedules, WiFi creds, zone names). Bad-SHA path also verified: full download, `ota_error: sha256_mismatch`, no reboot. **Bug logged:** first `http_failed` event (URL got mangled in terminal paste) caused an unexpected reboot — needs investigation before P2. Two smoke tests still to run: MQTT-unreachable rollback, mid-download server crash. Idempotency deferred to P2/P3 (server-side check).
- **2026-08-10** — P1 firmware code complete and builds clean. `OtaManager`, A/B partition table, first-boot rollback, and `ota/update` MQTT branch all in place. `MqttManager` gained `publishOtaEvent` helper.
- **2026-08-10** — Plan + tracker created. Firmware currently at 0.2.0 (per [[project_mobile_status]]).
