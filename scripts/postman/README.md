# Postman Integration Tests — Runbook

## Prerequisites

| Requirement | Details |
|---|---|
| **Postman Desktop** | [Download](https://www.postman.com/downloads/) — the desktop app, not the web version |
| **Auth0 M2M App** | A Machine-to-Machine application in Auth0 authorized for the `https://api.azul` audience |
| **Dev environment running** | Docker (Postgres + Mosquitto), backend server (`localhost:3000`) |

## First-Time Setup

### 1. Import the Environment

1. Open Postman → **Environments** (left sidebar)
2. Click **Import** → select `scripts/postman/Azul-Local.postman_environment.json`
3. Open the imported **Azul Local** environment
4. Set `auth0_client_id` to your Auth0 M2M Client ID
5. Set `auth0_client_secret` to your Auth0 M2M Client Secret
6. Save

These credentials are stored in the environment, not the collection, so re-importing the collection won't overwrite them.

### 2. Import the Collection

1. Click **Import** → select `scripts/postman/Azul-API.postman_collection.json`
2. The **Azul API** collection appears in the left sidebar

### 3. Select the Environment

In the top-right environment dropdown, select **Azul Local**. If this shows "No Environment", auth will fail.

## Running the Full Test Suite

1. Click the **Azul API** collection in the sidebar
2. Click **Run** (the play button at the top)
3. In the Runner:
   - **Environment**: Azul Local (should already be selected)
   - **Iterations**: 10 (tests zone state timing across multiple passes)
   - Leave other settings at defaults
4. Click **Run Azul API**

Expected result: **850 tests, 0 failures** (85 tests x 10 iterations).

## Test Flow Descriptions

The **Test Flows** folder runs as an ordered integration suite. Each subfolder builds on the previous state.

| Folder | What it validates |
|---|---|
| **0. Setup** | Fetches the first schedule UUID and saves it to `schedule_uuid` for later tests |
| **Zone activation** | Start zone 1, verify it shows `running`, stop it, verify `idle` |
| **Zone queuing** | Start zone 1, then zone 2 — verifies zone 2 goes to `pending` (not `running`) while zone 1 is active |
| **Stop All** | Starts zones 1-3, calls `stop-all`, verifies all return to `idle` |
| **Schedule CRUD lifecycle** | Full create → read → update → activate → deactivate → delete → verify 404 cycle. Uses 1900 dates to avoid overlap with real schedules |
| **Multi-controller isolation** | Starts a zone on Controller B, verifies Controller A is unaffected |
| **Zone edge cases** | Zone 0 (below range) returns 400, zone 9 (above range) returns 400, non-existent MAC returns 404 |
| **Schedule edge cases** | Non-existent schedule UUID returns 404, invalid body returns 400 |
| **Connection status** | Verifies `GET /devices/:mac` returns connection metadata |

## Standalone Requests

Outside the Test Flows folder, the collection includes individual requests organized by resource:

- **Devices** — List all, get by MAC
- **Zones** — Start, stop, stop-all
- **Schedules** — List, get active, get by UUID
- **Connection** — Connection status

These are useful for manual exploration and debugging.

## How Auth Works

The collection has a **pre-request script** that automatically fetches an Auth0 M2M token before each request. It:

1. Checks if `token_expiry` is still in the future
2. If expired (or missing), requests a new token using `client_credentials` grant
3. Stores the token and expiry as collection variables

You never need to manually fetch or paste a token.

## Troubleshooting

### 401 Unauthorized on every request

**Check the environment is selected.** The top-right dropdown must show "Azul Local", not "No Environment". Credentials live in the environment, not the collection.

### 401 after re-importing the collection

The collection JSON has placeholder values for `auth0_client_id` and `auth0_client_secret`. Re-importing doesn't touch your environment — but if `token_expiry` has a stale value, the script skips token refresh. Fix: open the collection **Variables** tab, clear the `token` and `token_expiry` values, save, and re-run.

### 409 Conflict on Schedule CRUD

The test schedule uses 1900 dates to avoid overlapping with real schedules. If a previous test run was interrupted before cleanup (step 8: Delete), a leftover schedule with 1900 dates may exist. Delete it manually:

```
DELETE http://localhost:3000/api/devices/AC:A7:04:26:60:D0/schedules/<uuid>
```

### Tests pass individually but fail in Runner

The Test Flows folder relies on execution order. Postman Runner executes requests top-to-bottom within each folder. If **0. Setup** fails, downstream tests that depend on `schedule_uuid` will also fail.

### Token fetch fails silently

Open the Postman **Console** (bottom-left) to see the raw Auth0 token request and response. Common causes:
- M2M app not authorized for the `https://api.azul` audience in Auth0
- Client secret rotated but not updated in the environment

## Collection Variables Reference

| Variable | Source | Description |
|---|---|---|
| `base_url` | Collection | `http://localhost:3000/api` |
| `auth0_domain` | Collection | Auth0 tenant URL |
| `auth0_client_id` | Environment | M2M Client ID (set by you) |
| `auth0_client_secret` | Environment | M2M Client Secret (set by you) |
| `mac` | Collection | Primary test controller MAC (`AC:A7:04:26:60:D0`) |
| `mac_b` | Collection | Secondary test controller MAC (`E8:F6:0A:85:4C:90`) |
| `zone` | Collection | Default zone number (`1`) |
| `schedule_uuid` | Collection (auto) | Set by 0. Setup — first schedule's UUID |
| `test_schedule_uuid` | Collection (auto) | Set by Schedule CRUD step 1 — ephemeral test schedule |
| `token` | Collection (auto) | JWT access token (auto-fetched) |
| `token_expiry` | Collection (auto) | Token expiry epoch (auto-set) |
