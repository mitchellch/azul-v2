# Deploy Workflow — Ops Runbook

**Scope:** How to deploy and iterate on Azul's apps once the home server (see [home-server-hosting-plan.md](home-server-hosting-plan.md)) is the production host. Complement to the setup plan — this doc is the recurring reference; the plan is a one-shot artifact.

**Audience:** Future-me at 11pm when a deploy broke, or a collaborator who's never touched `azul-server`.

---

## 1. Environment Matrix

| Component | Dev (laptop) | Prod (azul-server) |
| :--- | :--- | :--- |
| Server | `npm run dev` (tsx watch, `localhost:3000`) | systemd `azul-server.service`, built to `dist/`, behind Caddy on 443 |
| Web | `npm run dev` (Next.js dev on `localhost:3001`) | systemd `azul-web.service` (`next start`, SSR); optionally behind Caddy on 443 |
| Mobile | Metro + adb-reverse-to-laptop (`http://localhost:3000/api`) | APK built with `EXPO_PUBLIC_API_URL=https://api.azul-devices.com/api` |
| Firmware | `pio run -t upload` (USB), OTA to laptop-hosted server | Same firmware image; MQTT target = `mqtts://mqtt.azul-devices.com:8883` |
| Postgres | Docker on laptop (`localhost:5432`) | Docker on azul-server (`localhost:5432` from server perspective) |
| Mosquitto | Docker on laptop (`localhost:1883`) | Docker on azul-server (`localhost:1883` for server, `0.0.0.0:8883` for firmware) |

**Recommendation for solo dev:** target azul-server for everything except server iteration. Kill the "dev vs prod" toggle for mobile — always build mobile against `api.azul-devices.com`. Fewer environments = fewer bugs from environment drift.

The one exception where you truly want laptop-local: schema-breaking Prisma changes, where you want to iterate without touching prod data. Then it's laptop + docker Postgres, migrate, test, and only push once stable.

---

## 2. Config Files & Where They Live

| File | Path | Committed? | Purpose |
| :--- | :--- | :--- | :--- |
| `mobile/.env` | in repo | ✅ (public keys only) | Baseline env — production API URL |
| `mobile/.env.local` | not committed | ❌ | Per-developer overrides. **Trap: silently overrides `.env`. See [[mobile-env-local-lan-ip]].** Delete unless you have a specific reason. |
| `server/.env` | not committed | ❌ | Dev laptop only. DB URL, MQTT URL, Auth0 secrets. |
| `/home/mitchellch/azul/server/.env` | on azul-server filesystem | ❌ | Prod version. Same shape as laptop `.env` but with server-local `DATABASE_URL`, `MQTT_URL=mqtt://localhost:1883`, `SERVER_PUBLIC_URL=http://192.168.1.219:3000`, no `DEBUG_MODE`. |
| `firmware/main-controller/include/config.h` | in repo | ✅ | Compile-time firmware config incl. MQTT hostname. |

**Rule:** if you touch any `.env` file on azul-server, `sudo systemctl restart azul-server` afterward. `.env` is read once at process start.

---

## 3. Deploy Recipes

### 3.1 Server

**Fast path (manual SSH):**

```bash
ssh mitchellch@192.168.1.219 'bash -s' < scripts/deploy-server.sh
```

Where `scripts/deploy-server.sh` (checked into repo) is roughly:

```bash
#!/usr/bin/env bash
set -euo pipefail
cd /home/mitchellch/azul
git fetch --all
git checkout main
git pull --ff-only
cd server
npm ci                        # exact-lockfile install
npx prisma generate           # regenerate client if schema changed
npx prisma migrate deploy     # apply any pending migrations
npm run build                 # tsc → dist/
sudo systemctl restart azul-server
sudo systemctl status azul-server --no-pager | head -10
```

~5-15 seconds end-to-end depending on whether `npm ci` needs to run.

**Zero-touch (GitHub Actions):** on push to `main`, an Action SSHes to azul-server and runs the same script. Requires the server's SSH host key + a deploy key in Actions secrets. Set up once, forget.

**Verify after deploy:**
```bash
curl -s https://api.azul-devices.com/health | jq
# → {"ok":true,"uptime":X.X}
```

### 3.2 Web

The web app is a Next.js **SSR** app with server-side Auth0 — it runs as a systemd service (`next start`, port 3001), **not** a static export. Deploy is a rebuild + service restart:

```bash
ssh mitchellch@192.168.1.219 'cd /home/mitchellch/azul/web && git pull && npm ci && npm run build && sudo systemctl restart azul-web'
```

Caddy (if fronting it for TLS) proxies `443 → localhost:3001`; no Caddy restart is needed for a web-only change. (Cloudflare Pages / static export is **not** an option here — the server-side Auth0 session and API proxy routes require a running Node server.)

### 3.3 Mobile

**JS-only change:**
- Metro reload picks it up. No rebuild needed as long as `.env` didn't change.

**`.env` change or native change:**
- `cd mobile && npx expo run:android` — full rebuild + reinstall. ~5 minutes.

**Publishing to internal testers (future):**
- Expo EAS Build (or bare Gradle) with `EXPO_PUBLIC_API_URL=https://api.azul-devices.com/api` baked in. TestFlight / Google Play internal track.

### 3.4 Firmware

**Physical USB upload (bring-up, debugging):**

```bash
cd firmware/main-controller
pio run -t upload
```

**OTA to a specific controller (normal):**

```bash
scripts/release-firmware.sh   # builds, uploads to /api/admin/firmware
# then in web admin UI, click "Update" on the controller
```

Post-cutover, `release-firmware.sh` uploads to `https://api.azul-devices.com/api/admin/firmware` (its `API_URL` env var switches from laptop to the server hostname). One-line change.

---

## 4. Migration Hygiene

**Rule:** every schema change is a Prisma migration, and every deploy runs `prisma migrate deploy` before restarting the server.

**Workflow for a schema change:**

1. On laptop: edit `server/prisma/schema.prisma`.
2. `npx prisma migrate dev --name descriptive-name` — creates migration SQL, applies to laptop DB, regenerates client.
3. Test locally.
4. Commit both the migration SQL file *and* the schema change together. Never one without the other.
5. Push to `main`. Deploy pipeline runs `prisma migrate deploy` on azul-server.

**Never:**
- Edit prod DB by hand. If you must, write a migration and apply it via `migrate deploy` even if it's a one-off data fix (use `--create-only` and hand-write the SQL, then apply).
- Skip `prisma generate` after schema changes. Symptom: `Property 'X' does not exist on type 'PrismaClient'`.
- Delete a migration file after it's been applied to prod. Prisma tracks state in `_prisma_migrations` table; deleted file = corrupted state.

**When migrations fail on azul-server:**
- Server won't start. `systemctl status azul-server` shows the error.
- `psql`, look at `_prisma_migrations` table — the failing migration will have `finished_at IS NULL`.
- Fix the SQL, `npx prisma migrate resolve --applied <name>` or `--rolled-back <name>` as appropriate, then re-deploy.

---

## 5. Rollback Recipes

### 5.1 Server broke after deploy

```bash
ssh mitchellch@192.168.1.219
cd /home/mitchellch/azul
git log --oneline -5           # find last good commit
git checkout <last-good-sha>
cd server
npm ci && npx prisma generate && npm run build
sudo systemctl restart azul-server
```

If the bad deploy also ran a bad migration:
- `npx prisma migrate resolve --rolled-back <migration-name>` if you never actually needed it, then hand-write a corrective migration for prod.
- Or restore Postgres from last night's `pg_dump` backup (see P7 in the plan) and re-run migrations up to the last known good.

### 5.2 Firmware fleet broke after OTA

- OTA system has automatic first-boot rollback (60s MQTT-connect timeout → falls back to previous slot). If firmware boots and can't reach MQTT, it self-heals.
- If firmware boots and *can* reach MQTT but is still broken, manual OTA of the previous version: use `scripts/release-firmware.sh` to publish the older `.bin`, trigger OTA to each affected controller.
- Nuclear option: physical USB reflash. Requires taking the controller off the wall.

### 5.3 Mobile broke after update

- APK rollback: reinstall the previous APK from local build cache or Expo internal distribution.
- Since it's dev-signed, just `adb install -r <old.apk>`.

### 5.4 Cert expired / TLS handshake failing

- `certbot renew` should have run via cron. Check `systemctl status snap.certbot.renew.timer` (or wherever cron lives).
- Manual renew: `sudo certbot renew --force-renewal`.
- Post-renew hook restarts mosquitto + reloads caddy — verify with `systemctl status`.

---

## 6. Common Failure Modes

### 6.1 Mobile shows "Connecting… → Reconnecting…"

Diagnosis order:
1. Server reachable? `curl https://api.azul-devices.com/health` from any device.
2. If yes → mobile's baked-in API URL wrong. Check `mobile/.env.local` for a stale override — the classic trap. See [[mobile-env-local-lan-ip]].
3. If no → server down. `systemctl status azul-server` on azul-server.
4. If the box is up but server won't start → check journal: `journalctl -u azul-server -n 100 --no-pager`. Usually a Prisma migration mismatch or missing `.env` var.

### 6.2 Firmware won't connect to MQTT

Diagnosis order:
1. Cert valid? From laptop: `openssl s_client -connect mqtt.azul-devices.com:8883 -showcerts`. Expiring soon or self-signed = bad.
2. DNS resolving? From firmware perspective — nothing helpful the ESP32 will tell you here. Test from laptop: `dig mqtt.azul-devices.com` should return the server's WAN IP.
3. Port open? From external network (phone on cellular): `nc -zv mqtt.azul-devices.com 8883`. Success = router forwarding is working.
4. Firmware side: check `MQTT_HOST` / `MQTT_PORT` / TLS cert baked into `firmware/main-controller/include/config.h`. Serial console output tells you what it's trying.

### 6.3 Server started but zone commands don't reach firmware

- MQTT is up, but is the server *connected* to it? Check server logs on azul-server: `journalctl -u azul-server -f`. Look for `[MQTT] Connected to mqtt://localhost:1883`.
- Is the controller online (from server's view)? `curl https://api.azul-devices.com/api/devices` (with auth) — check `online: true`.
- Is `mosquitto` running on azul-server? `docker compose ps` in `server/` (it runs as a container).
- Is Mosquitto's 1883 listener actually on `127.0.0.1`? `ss -tlnp | grep mosquitto`. Should show 127.0.0.1:1883 and 0.0.0.0:8883.

### 6.4 Public IP changed and services became unreachable

- DDNS should have picked it up within 5 min. Check `/var/log/azul-ddns.log` (or wherever the script logs).
- Manual: `curl -4 ifconfig.io` on azul-server to get current WAN IP, then update Cloudflare A records for `api.` and `mqtt.` via dashboard.
- DNS TTL is 60s — worst case ~6 min of downtime for external clients.

### 6.5 Postgres out of disk

- SSD full = server writes fail = zone events stop being logged = eventually server crashes.
- `df -h /` on azul-server. If > 80%, prune old `event_log` partitions or backups.
- Long-term: `server/scripts/archive-events.ts` (see [[event_log_partitions]]) should be on a monthly cron. Currently manual per memory.

---

## 7. Sanity Checklist Before Every Deploy

Quick mental checklist. Not a form — just questions to hold in your head:

- Did I run migrations locally? Do they show up in `git status`?
- Did I commit the schema change *and* the migration SQL file together?
- Any new env vars in `.env.example`? Did I update azul-server's `.env` too?
- Did I bump firmware version if firmware changed? ([[firmware-version-h-source-of-truth]])
- If I'm changing MQTT topics or payload shapes, does firmware in the field speak the new dialect? Or is there a compatibility bridge?

If any of these are "no" or "not sure" — stop, verify, then deploy.

---

## 8. Related Documents

- [Home server hosting plan](home-server-hosting-plan.md) — the setup that got us here
- [OTA implementation plan](ota-implementation-plan.md) — firmware deploy path
- [OTA architecture](ota-firmware-update-architecture.md) — firmware rollback details
- [Cloud API architecture](cloud-api-architecture.md) — API surface
