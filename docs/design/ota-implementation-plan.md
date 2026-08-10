# OTA Firmware Update — Implementation Plan (MVP)

**Scope:** First shippable OTA path. Trims the full architecture in [ota-firmware-update-architecture.md](ota-firmware-update-architecture.md) to what's required for a single developer to push a new firmware image to a controller without a USB cable.

**What's excluded from MVP** (still in the architecture doc, deferred to later phases):

- CI signing pipeline, Secure Boot v2, anti-rollback eFuses (Phase 6 in the arch doc)
- AP-mode OTA and BLE OTA (offline paths, Phases 4–5)
- Staged/canary rollouts, admin dashboard, S3 bucket, pre-signed URLs (Phase 3)
- Move firmware storage from local disk → S3 (Phase 2 hardening)

MVP relies on WiFi + MQTT + HTTP over the existing local server. Anything the retail product will need (signing, rollout gating, S3) is called out in [risks](#8-risk-register) so the seams aren't the wrong shape.

---

## 1. Objective

Push a new firmware `.bin` to a specific controller by clicking a button in the web admin UI. Verify by SHA-256 before boot. Auto-rollback if the new image can't reach MQTT within 60s of first boot.

**Success criteria:**

1. `pio run` produces a `.bin`. Upload it via `POST /api/admin/firmware`.
2. Click "Update" on the controller's Settings page → controller reboots into new firmware within ~30s.
3. Corrupt the download mid-transfer → controller aborts, stays on old slot, reports `ota_error`.
4. Push a firmware that can't connect to MQTT → auto-rollback to previous slot on next boot.

---

## 2. Phased Delivery

### Phase 1 — Firmware (est. 1 day)

**Deliverables:**

- `firmware/main-controller/partitions_azul.csv` — A/B partition layout matching arch doc §3.
- `firmware/main-controller/platformio.ini` — reference the new partition CSV.
- `firmware/main-controller/src/OtaManager.{h,cpp}` — single class with:
  - `beginUpdate(const char* url, const char* sha256, const char* expectedVersion)`
  - Streams via `HTTPClient` + `Update` library into the inactive OTA partition.
  - Verifies SHA-256 mid-stream (rolling `mbedtls_sha256_update`), aborts on mismatch.
  - Publishes `ota_progress` every 10%, `ota_complete` / `ota_error` on exit.
- `MqttManager::handleMessage()` — new command branch `ota/update` → `_ota.beginUpdate(...)`.
- First-boot hook in `main.cpp`:
  - If `esp_ota_get_state_partition() == ESP_OTA_IMG_PENDING_VERIFY`, start a 60s timer.
  - When MQTT connects within window → `esp_ota_mark_app_valid_cancel_rollback()`.
  - On timeout → `esp_ota_mark_app_invalid_rollback_and_reboot()`.

**Non-goals for Phase 1:**

- No image signing yet — leave a `signature` field placeholder in the MQTT payload, ignore its value.
- No AP-mode / BLE paths.

### Phase 2 — Server (est. 1 day)

**Deliverables:**

- Prisma schema additions (see arch doc §5.1, trimmed):
  - `FirmwareRelease` (id, version, target, filePath, sha256, size, releaseNotes, createdAt).
  - `DeviceOtaStatus` (deviceId, version, status, startedAt, completedAt, error).
- Local disk storage at `server/uploads/firmware/<version>/<target>.bin`. No S3 yet.
- Endpoints (all admin-scoped middleware — reuse existing auth):
  - `POST /api/admin/firmware` — multipart upload; compute SHA-256 server-side; persist record.
  - `GET  /api/admin/firmware` — list releases.
  - `POST /api/devices/:mac/ota` — body `{ version }`; look up release; publish MQTT command:
    ```
    Topic: azul/<mac>/cmd/ota/update
    Body:  { "url": "http://<server>/firmware/<version>/<target>.bin",
             "sha256": "<hex>",
             "version": "<x.y.z>",
             "size": <bytes> }
    ```
- Static route `GET /firmware/*` serving files from `server/uploads/firmware/` (no auth — MVP lives on LAN / behind adb reverse). Add HTTPS + auth in Phase 6 hardening.
- Event ingest: extend the existing MQTT `events` handler to persist `ota_progress`, `ota_complete`, `ota_error`, `ota_rollback` into `DeviceOtaStatus`.

### Phase 3 — Web UI + Release Flow (est. 0.5 day)

**Deliverables:**

- `web/app/(dashboard)/firmware/page.tsx` — table of releases, upload form.
- Controller Settings tab: "Firmware" section showing current version + "Update to…" dropdown of newer releases + confirm button → `POST /api/devices/:mac/ota`.
- Progress badge on controller card: reads `DeviceOtaStatus` (via SSE stream, same channel as zone state).
- `scripts/release-firmware.sh` — one-liner that reads `pio run` output, computes SHA-256, curls the upload endpoint. Bump version in a `firmware/main-controller/version.h` before building.

---

## 3. Data Contracts

### 3.1. MQTT — `azul/<mac>/cmd/ota/update`

```json
{
  "url": "http://192.168.1.10:3000/firmware/0.3.0/main-controller.bin",
  "sha256": "a1b2c3d4e5f6...",
  "version": "0.3.0",
  "size": 1572864,
  "signature": null
}
```

`signature` is reserved for Phase 6 (Ed25519). Firmware ignores it in MVP.

### 3.2. MQTT — `azul/<mac>/events` (progress replies)

Same shape as the arch doc §4.2. Not repeated here.

### 3.3. REST — `POST /api/admin/firmware`

`multipart/form-data`:
- `file` — the `.bin`
- `version` — semver string, must be unique per `target`
- `target` — `main-controller` (only value for MVP)
- `releaseNotes` — optional

Response: the created `FirmwareRelease` row.

### 3.4. REST — `POST /api/devices/:mac/ota`

```json
{ "version": "0.3.0" }
```

Response: `{ ok: true, ota_status_id: "cuid..." }` or 4xx if version unknown / device offline.

---

## 4. Version Handling

- Version lives in a single header: `firmware/main-controller/version.h` → `#define FW_VERSION "0.3.0"`.
- Firmware publishes `firmware` in its status ping (already does — no change).
- Server compares `deviceOtaStatus.version` to `device.firmware` on next status ping to close out the "did the update actually take" question.

---

## 5. Safety Invariants

The firmware must uphold these regardless of what the server sends:

1. **Never overwrite the running partition.** `Update` library handles this; verify with an assert on `esp_ota_get_running_partition() != esp_ota_get_next_update_partition(nullptr)` before starting.
2. **SHA-256 verified before `Update.end(true)`.** No exceptions. On mismatch, `Update.abort()` and publish `ota_error: "sha256_mismatch"`.
3. **First boot must reach MQTT within 60s.** If not, mark image invalid and reboot back to the previous slot.
4. **Retry policy on transient download failure:** 3 attempts, 10s backoff between. After that, publish `ota_error: "download_failed"` and stay on current slot.

---

## 6. Testing Plan

Manual smoke tests (add automated ones once the MVP works):

| Test | How | Expected |
| :--- | :--- | :--- |
| Happy path | Upload new version, click Update | Reboot into new version < 30s; status page shows new firmware |
| Bad SHA | Manually corrupt file after upload record | `ota_error: sha256_mismatch`; stays on old slot |
| Server unreachable mid-download | `docker compose stop server` during OTA | Auto-retry × 3, then `ota_error: download_failed` |
| New firmware can't reach MQTT | Build with wrong broker IP, push | Auto-rollback on next boot; status ping reports old version |
| Repeated update to same version | Click Update twice with same version selected | Firmware idempotent; second run no-ops (version match) |

---

## 7. Files to Create / Modify

**New:**
- `firmware/main-controller/partitions_azul.csv`
- `firmware/main-controller/src/OtaManager.{h,cpp}`
- `firmware/main-controller/version.h`
- `server/prisma/migrations/<ts>_firmware_releases/migration.sql`
- `server/src/handlers/firmware.ts` (POST/GET admin routes)
- `server/src/handlers/deviceOta.ts` (POST /devices/:mac/ota)
- `web/app/(dashboard)/firmware/page.tsx`
- `scripts/release-firmware.sh`
- `poc/ota/dashboard.md` — tracker

**Modified:**
- `firmware/main-controller/platformio.ini` — `board_build.partitions = partitions_azul.csv`
- `firmware/main-controller/src/main.cpp` — first-boot verify hook
- `firmware/main-controller/src/MqttManager.cpp` — new command branch
- `server/prisma/schema.prisma` — add models
- `server/src/index.ts` — mount static `/firmware/*` route
- `server/src/mqtt/eventHandler.ts` — persist OTA event types
- `web/app/(dashboard)/controllers/[mac]/page.tsx` — Firmware section in Settings tab

---

## 8. Risk Register

| Risk | Mitigation | Deferred fix |
| :--- | :--- | :--- |
| Bad firmware bricks device | A/B partition + first-boot rollback | Same |
| Power loss mid-write | `Update` library only marks partition valid at `end(true)` | Same |
| Weak WiFi drops connection | 3× retry + 10s backoff; 5min hard timeout | Same |
| Wrong image on device | SHA-256 mid-stream verify | Same + Ed25519 sig (Phase 6) |
| Unsigned image accepted | **Accepted risk for MVP** (LAN + admin auth on server) | Ed25519 sig verify in bootloader |
| Firmware endpoint publicly accessible | Server is dev-local only | Auth + HTTPS + S3 pre-signed URLs |
| No rollout gating | Manual per-device only; can't push to a fleet | Staged rollout engine (arch §5.3) |

The MVP is safe for a fleet of 3 controllers on a home network. Do not enable this path against retail devices without at least: signed images, HTTPS transport, and rollout gating.

---

## 9. Out-of-Scope Reminders

Do **not** slip these into the MVP branch — each is a separate PR:

- Firmware signing / Secure Boot / anti-rollback
- S3 storage + pre-signed URLs
- Staged rollouts + auto-pause on error rate
- Admin dashboard for fleet OTA health
- AP-mode OTA (`OtaApServer` class)
- BLE OTA fallback

Tracked as separate phases in `poc/ota/dashboard.md`.
