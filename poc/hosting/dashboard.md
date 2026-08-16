# Raspberry Pi Hosting — Progress Tracker

**Objective:** Bring the Azul server stack up on a home-hosted Raspberry Pi so mobile + firmware work from anywhere without USB tethering.

**Plan:** [pi-hosting-plan.md](../../docs/design/pi-hosting-plan.md)

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
| **P1** | Hardware + OS bring-up | ⚪ | — |
| **P2** | DNS migration to Cloudflare | ⚪ | — (can start anytime) |
| **P3** | Router config + DDNS | ⚪ | P1, P2 |
| **P4** | Server stack (Postgres, Mosquitto, Node) | ⚪ | P1 |
| **P5** | TLS certs via Let's Encrypt DNS-01 | ⚪ | P2, P4 |
| **P6** | Cutover mobile + firmware | ⚪ | P3, P4, P5 |
| **P7** | Hardening (UFW, fail2ban, backups) | ⚪ | P6 |

---

## Prerequisites (settled)

- ✅ Home WAN is not on CGNAT — public IPv4 `168.100.191.58` (confirmed via router status page 2026-08-16)
- ✅ Router (Calix EXOS) exposes port-forwarding UI, no ISP lock
- ✅ IPv6 available (bonus, not currently used)
- ✅ Domain `azul-devices.com` owned at Network Solutions, subdomain plan agreed (`api.`, `mqtt.`, `app.`, `auth.`)
- ✅ Architectural choice: port-forward direct, DNS at Cloudflare, no Tunnel. See plan §2.

---

## P1 — Hardware + OS

**Target:** ½ day once hardware arrives

- ⚪ Order Pi 5 8GB + PSU + SSD + case + Ethernet cable (~$180)
- ⚪ Flash Raspberry Pi OS Lite (64-bit) to SSD via Imager
- ⚪ Imager advanced options: hostname `azul-pi`, SSH enabled, user set, WiFi backup configured
- ⚪ Boot from SSD (skip SD entirely — Pi 5 supports USB boot out of the box)
- ⚪ Router: reserve static DHCP lease for Pi's MAC → e.g. `192.168.1.50`
- ⚪ SSH in, `apt update && apt full-upgrade`, reboot
- ⚪ Confirm IPv6 works: `curl -6 ifconfig.io`
- ⚪ Install baseline: `git curl vim ufw fail2ban unattended-upgrades`
- ⚪ Configure unattended-upgrades for security patches
- ⚪ SSH key-based login working; password login disabled

## P2 — DNS to Cloudflare

**Target:** 1 hour (mostly waiting for propagation)

- ⚪ Cloudflare account created, `azul-devices.com` added on Free plan
- ⚪ Cloudflare DNS scan reviewed; note any existing records to preserve
- ⚪ Two Cloudflare nameservers copied
- ⚪ Network Solutions → azul-devices.com → nameservers set to Cloudflare NS values
- ⚪ Cloudflare confirms active (via email)
- ⚪ API token minted, scope `DNS:Edit` on `azul-devices.com`
- ⚪ Token stored securely for later (`/etc/cloudflare.token` on Pi, chmod 600)

## P3 — Router + DDNS

**Target:** ½ day

- ⚪ Port forward: WAN 443 → Pi:443 (TCP)
- ⚪ Port forward: WAN 8883 → Pi:8883 (TCP)
- ⚪ Confirm UPnP is off (no auto-added rules)
- ⚪ Test forwarding from external network before certs (e.g. temporary `python3 -m http.server 443` on Pi + phone on cellular hits it)
- ⚪ DDNS script written — polls WAN IP, updates Cloudflare A records if changed
- ⚪ Script runs every 5 min via systemd timer
- ⚪ Initial A records: `api.` and `mqtt.` pointing at current WAN IP with TTL 60s

## P4 — Server Stack

**Target:** 1 day

- ⚪ Postgres 15 installed via apt
- ⚪ Postgres listens on `127.0.0.1` only (verified with `ss -tlnp`)
- ⚪ `azul` role + `azul` database created; credentials match dev
- ⚪ Repo cloned to `/home/mitch/azul`
- ⚪ `npx prisma migrate deploy` — schema up to date
- ⚪ Mosquitto installed
- ⚪ `/etc/mosquitto/conf.d/azul.conf` — 1883 on 127.0.0.1, 8883 on 0.0.0.0 with cert paths
- ⚪ MQTT users created via `mosquitto_passwd` (server + per-firmware fleet)
- ⚪ Anonymous MQTT access disabled
- ⚪ Node 22 via nvm on Pi
- ⚪ Server `.env` populated (DATABASE_URL, MQTT_URL, Auth0 creds, no DEBUG_MODE)
- ⚪ `npm run build` in `server/` produces `dist/`
- ⚪ systemd unit `azul-server.service` written, enabled, started
- ⚪ `systemctl status azul-server` → active; `curl http://localhost:3000/health` from Pi → 200

## P5 — TLS Certs

**Target:** ½ day

- ⚪ certbot + `python3-certbot-dns-cloudflare` installed
- ⚪ `/etc/letsencrypt/cloudflare.ini` populated with API token, chmod 600
- ⚪ Certs issued for `api.azul-devices.com` and `mqtt.azul-devices.com` via DNS-01
- ⚪ Caddy (or nginx) installed as HTTPS reverse-proxy in front of Node on `localhost:3000`
- ⚪ Caddy config terminates TLS on 443, proxies to `localhost:3000`
- ⚪ Mosquitto config points at Let's Encrypt cert paths for 8883 listener
- ⚪ certbot renew cron auto-installed; post-renew hook restarts mosquitto + reloads caddy
- ⚪ `curl https://api.azul-devices.com/health` from external network → 200
- ⚪ `mosquitto_sub -h mqtt.azul-devices.com -p 8883 --cafile ...` from external network → subscribes

## P6 — Cutover

**Target:** ½ day, careful

- ⚪ New firmware build with MQTT host = `mqtt.azul-devices.com`, port 8883, TLS on, ISRG Root X1 baked in
- ⚪ Test firmware push to controller #1 (26:7B:8C or similar) via existing OTA path
- ⚪ Controller #1 reconnects to Pi broker → verify heartbeat in Pi mosquitto logs
- ⚪ Firmware pushed to remaining controllers, one at a time, each verified before next
- ⚪ `mobile/.env` updated: `EXPO_PUBLIC_API_URL=https://api.azul-devices.com/api`
- ⚪ Mobile rebuilt via `expo run:android` + installed on device
- ⚪ Mobile smoke test: tap controller → programs load, zone start/stop work over cellular (not just WiFi)
- ⚪ Web `.env` updated similarly, web smoke test
- ⚪ Laptop server retired: kill `npm run dev`, `[HTTP]` logger removed from `server/src/index.ts` (commit 35c2ba4)
- ⚪ Old laptop `mosquitto` service stopped
- ⚪ Old `.env.local` LAN IP cleared to avoid future confusion ([[mobile-env-local-lan-ip]])

## P7 — Hardening

**Target:** ½ day

- ⚪ UFW: allow SSH from LAN only, allow 443 and 8883 from anywhere, deny everything else, enable
- ⚪ fail2ban: sshd jail active, mosquitto jail active
- ⚪ SSH: password auth disabled, key-only
- ⚪ MQTT anonymous auth disabled (verified)
- ⚪ Nightly `pg_dump` cron running, output to Pi SSD
- ⚪ Backup rsync to Backblaze B2 (or equivalent) working
- ⚪ Backup restore tested end-to-end on a clean database
- ⚪ UptimeRobot (or equivalent) hitting `/health` every 5 min, email alert on 2 consecutive failures
- ⚪ journald size cap set, Postgres log rotation configured

---

## Open Questions / Decisions Pending

- **UPS or no UPS?** ~$60 keeps Pi + router up through short blackouts. Worth it once controllers are on Pi-hosted MQTT.
- **Firmware TLS trust store**: bake ISRG Root X1 (Let's Encrypt) only, or also include a fallback cert? Only-ISRG is simplest; fallback means firmware ships knowing how to reach a backup broker.
- **MQTT auth model**: username+password per fleet, or per-device client certs? Certs are more secure but way more provisioning complexity. Start with u/p, migrate later if needed.
- **Web app hosting**: on the Pi behind Caddy, or on Cloudflare Pages as a static export? Pages is free and faster, but requires the web app to work as fully static Next.js output. TBD.

---

## Notes

- Cutover **must** keep laptop server running until at least one controller is confirmed on the Pi. Rollback = firmware config flip back to laptop broker. Do NOT retire laptop until fleet is fully migrated.
- Deleted `mobile/.env.local` LAN IP override was the source of a full session of "why can't I connect" — see [[mobile-env-local-lan-ip]]. On the Pi, `.env` is the sole config file.
