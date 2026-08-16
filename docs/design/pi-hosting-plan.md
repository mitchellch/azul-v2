# Raspberry Pi Hosting — Implementation Plan

**Scope:** Move Azul's server stack (Node API, Mosquitto, Postgres) from the dev laptop onto a home-hosted Raspberry Pi so mobile + firmware can reach the services from anywhere — without depending on `adb reverse` USB tethering. First step toward eventual cloud deployment; the same code and topology moves to a cloud host later without further changes.

**What's excluded from this plan** (deferred to later work):

- Public cloud deployment (Fly.io, AWS, Railway, etc.)
- High availability, redundancy, or automated failover
- Managed Postgres / hosted MQTT broker
- CDN or edge-cached assets
- Formal monitoring / alerting / on-call rotation

The Pi is the intermediate host that unlocks remote mobile access and remote firmware operation, without incurring cloud-provider costs before we need them.

---

## 1. Objective

Bring up a Raspberry Pi at home that serves:

- **`api.azul-devices.com`** — Node/Express API (currently on laptop `localhost:3000`)
- **`mqtt.azul-devices.com`** — Mosquitto broker for firmware ↔ server ↔ web MQTT (currently on laptop `localhost:1883`)
- **Postgres** — internal only, listens on the Pi's LAN interface, no public exposure

Reachable from:
- Mobile app on cellular, corporate WiFi (Zscaler), or any external network
- Firmware controllers deployed anywhere with internet
- Web app served from any host

**Success criteria:**

1. Mobile app configured with `EXPO_PUBLIC_API_URL=https://api.azul-devices.com/api` connects successfully with no adb tunneling.
2. Firmware on a controller configured to `mqtts://mqtt.azul-devices.com:8883` connects, publishes heartbeat, receives commands.
3. Server survives a Pi reboot without manual intervention (systemd + docker restart policies).
4. TLS certs auto-renew (Let's Encrypt via DNS-01) without human touch.
5. Public IP change survives via DDNS updating the A record.

---

## 2. Architectural Choice: Port-Forward vs Cloudflare Tunnel

**Decision:** Port-forward, not Cloudflare Tunnel.

**Rationale:**

- Home WAN is not on CGNAT (confirmed public IPv4 `168.100.191.58`); direct port forwarding works.
- Router (Calix EXOS) exposes full port-forwarding UI, unrestricted by ISP.
- Cloudflare Tunnel free tier only proxies HTTP/HTTPS; MQTT would have to run over WSS-on-443, adding a Mosquitto listener config, an nginx/Caddy reverse-proxy layer, and firmware-side WebSocket support. Port-forward keeps raw MQTTS on 8883 — one fewer moving part in the firmware.
- Zscaler on client devices doesn't affect this path — outbound HTTPS/MQTTS from mobile through Zscaler to a public IP looks identical to any SaaS.

**When to revisit:** if ISP moves us behind CGNAT, if home ISP starts blocking inbound 443/8883, or if we outgrow home bandwidth/uptime. Migration path from port-forward → Tunnel is straightforward if it becomes necessary.

DNS still moves to Cloudflare (free tier) — not for Tunnel, but for scriptable DNS-API access (DDNS updates, DNS-01 cert challenges) and free TLS wildcard for `*.azul-devices.com`.

---

## 3. Phased Delivery

| Phase | Description | Outcome |
| :--- | :--- | :--- |
| **P1** | Hardware + OS bring-up | Pi boots off SSD, has static LAN IP, SSH access |
| **P2** | DNS migration | `azul-devices.com` nameservers → Cloudflare; API token minted |
| **P3** | Router configuration | Port forwards `443` and `8883` → Pi; DDNS running |
| **P4** | Server stack install | Postgres, Mosquitto, Node API running as systemd services |
| **P5** | TLS certs | Let's Encrypt certs for `api.` and `mqtt.` via DNS-01, auto-renew |
| **P6** | Cutover | Mobile + firmware repointed at public hostnames; laptop server retired |
| **P7** | Hardening | UFW, fail2ban, MQTT auth, backups |

Sequential — each phase depends on the previous. P6 is the visible "moved off laptop" milestone; P7 is the "safe to leave running" milestone.

---

## 4. P1 — Hardware + OS

**Bill of materials:**

| Item | Notes |
| :--- | :--- |
| Raspberry Pi 5, 8GB | 4GB works; 8GB gives Postgres + Node headroom |
| Official 27W USB-C PSU | Underpowered PSUs cause SSD/USB flakiness |
| USB3 SSD, 256GB+ | Boot from SSD; SD-card writes kill cards under Postgres load |
| Active-cooling case | Pi 5 throttles without airflow |
| Ethernet cable | Wired > WiFi for a server role |

**Steps:**

1. Flash Raspberry Pi OS Lite (64-bit) to SSD using Raspberry Pi Imager.
2. In Imager's advanced options: set hostname `azul-pi`, enable SSH, set username/password, configure WiFi as backup (Ethernet primary).
3. Boot Pi with SSD only (skip SD entirely — Pi 5 supports USB boot out of the box).
4. On router: assign static DHCP lease to the Pi's MAC → `192.168.1.50` (or similar reserved IP).
5. SSH in, `sudo apt update && sudo apt full-upgrade -y`, reboot.
6. Enable IPv6 explicitly if not on by default.
7. Install baseline tools: `git curl vim ufw fail2ban unattended-upgrades`.
8. Configure `unattended-upgrades` to auto-apply security patches.

---

## 5. P2 — DNS to Cloudflare

**Prerequisite:** Cloudflare account (free tier).

**Steps:**

1. In Cloudflare dashboard: **Add a site** → `azul-devices.com` → Free plan.
2. Cloudflare scans existing DNS records at Network Solutions and shows the list. Confirm nothing is misconfigured.
3. Cloudflare provides two nameservers (e.g. `bruno.ns.cloudflare.com`, `nora.ns.cloudflare.com`).
4. Log into Network Solutions → **Domains → azul-devices.com → Settings → Custom Nameservers** → paste the two Cloudflare NS values.
5. Wait for propagation (5-30 min). Cloudflare emails when detected.
6. In Cloudflare, mint an API token scoped to **DNS:Edit** for `azul-devices.com`. Save to Pi at `/etc/cloudflare.token` (chmod 600).

**Subdomain records to create later** (P3 / P5):

| Record | Type | Target |
| :--- | :--- | :--- |
| `api.azul-devices.com` | A | (WAN IP, updated by DDNS) |
| `mqtt.azul-devices.com` | A | (WAN IP, updated by DDNS) |
| `app.azul-devices.com` | A | (WAN IP, updated by DDNS — optional if web hosted elsewhere) |

---

## 6. P3 — Router + DDNS

**Port forwards** (Calix EXOS → Advanced → Security → Port Forwarding):

| Local LAN Ports | Local LAN IP | Protocol | WAN Ports |
| :--- | :--- | :--- | :--- |
| 443 | `192.168.1.50` (Pi) | TCP | 443 |
| 8883 | `192.168.1.50` (Pi) | TCP | 8883 |

**DDNS** (on Pi):

Write a small script that:
1. Queries `curl -4 ifconfig.io` for current WAN IPv4.
2. Compares against cached value.
3. If changed, POSTs new IP to Cloudflare's DNS API for `api.` and `mqtt.` A records.

Run every 5 minutes via cron or systemd timer. No third-party DDNS service needed since we control DNS at Cloudflare directly.

---

## 7. P4 — Server Stack

**Postgres:**

- Install via apt: `sudo apt install postgresql-15`.
- Configure to listen on `127.0.0.1` only (no LAN or WAN exposure).
- Create `azul` role + `azul` database matching current dev credentials.
- Restore latest schema via `npx prisma migrate deploy` from the repo checked out on the Pi.
- Load fixtures / seed data if applicable.

**Mosquitto:**

- Install via apt: `sudo apt install mosquitto mosquitto-clients`.
- `/etc/mosquitto/conf.d/azul.conf`:
  - Listener 1883 on `127.0.0.1` (plaintext, for server-local connections)
  - Listener 8883 on `0.0.0.0` (MQTTS, for firmware over internet)
  - `require_certificate false`, username/password auth via password file
  - `cafile` / `certfile` / `keyfile` pointing at Let's Encrypt paths (populated in P5)
- Create MQTT users: `mosquitto_passwd` — one per firmware fleet + one for the server.

**Node API:**

- Clone `azul-v2` repo to `/home/mitch/azul`.
- Install Node 22 via nvm.
- `cd server && npm install && npx prisma generate`.
- systemd unit `/etc/systemd/system/azul-server.service`:
  - `ExecStart=/home/mitch/.nvm/versions/node/v22.x.x/bin/node dist/index.js`
  - `Restart=always`, `WorkingDirectory=/home/mitch/azul/server`
  - `EnvironmentFile=/home/mitch/azul/server/.env`
- Enable + start: `sudo systemctl enable --now azul-server`.

`.env` on Pi:
- `DATABASE_URL=postgresql://azul:...@localhost:5432/azul`
- `MQTT_URL=mqtt://localhost:1883` (server → local plaintext listener)
- Auth0 creds copied from laptop `.env`
- No `DEBUG_MODE=true`

---

## 8. P5 — TLS Certs

**Let's Encrypt via DNS-01 challenge** (works without opening port 80):

1. Install certbot: `sudo apt install certbot python3-certbot-dns-cloudflare`.
2. Create `/etc/letsencrypt/cloudflare.ini` with the API token from P2 (chmod 600).
3. Request certs:
   ```
   sudo certbot certonly --dns-cloudflare \
     --dns-cloudflare-credentials /etc/letsencrypt/cloudflare.ini \
     -d api.azul-devices.com -d mqtt.azul-devices.com
   ```
4. Certbot writes to `/etc/letsencrypt/live/api.azul-devices.com/`.
5. Point Mosquitto's `certfile`/`keyfile` at those paths.
6. Node API: put Caddy or nginx in front, terminating TLS on 443, proxying to `localhost:3000`. Alternative: use Node's `https` module with the same cert files; Caddy is simpler.
7. Certbot renew cron auto-installed; add a post-renew hook that restarts Mosquitto and reloads Caddy.

---

## 9. P6 — Cutover

**Sequence to avoid downtime for physical controllers:**

1. Bring Pi to running state — API + MQTT reachable from public internet at their real hostnames. Verify with `curl https://api.azul-devices.com/health` from external network.
2. Publish new firmware build with `MQTT_HOST=mqtt.azul-devices.com`, `MQTT_PORT=8883`, `MQTT_USE_TLS=true`, and ISRG Root X1 baked into the TLS trust store.
3. Push OTA to the three test controllers one at a time. Verify each reconnects to the new broker before OTA'ing the next.
4. Update `mobile/.env` → `EXPO_PUBLIC_API_URL=https://api.azul-devices.com/api`. Rebuild + reinstall via `expo run:android`.
5. Update `web/.env` similarly.
6. Retire laptop server: stop the `npm run dev` process, delete the temporary `[HTTP]` request logger from `server/src/index.ts` (was diagnostic — see git log for `35c2ba4`).

---

## 10. P7 — Hardening

- **UFW:** `ufw allow 22/tcp from 192.168.1.0/24` (SSH LAN-only), `ufw allow 443/tcp`, `ufw allow 8883/tcp`, `ufw enable`.
- **fail2ban:** enable `sshd` and `mosquitto` jails.
- **MQTT auth:** disable anonymous access, require username+password (or per-device client certs).
- **SSH:** disable password auth, key-only.
- **Backups:** nightly `pg_dump` to Pi's SSD + rsync to an external drive or cloud (Backblaze B2, ~$0.005/GB/mo).
- **Monitoring:** at minimum, an uptime check from a third-party like UptimeRobot hitting `/health` every 5 min.
- **Log rotation:** journald sizes, Postgres logs, Mosquitto logs — cap at reasonable sizes.

---

## 11. Risk Register

| # | Risk | Impact | Mitigation |
| :- | :--- | :--- | :--- |
| R1 | Home internet outage | Full downtime for cloud-mode controllers + mobile | Firmware falls back to standalone schedule; mobile shows offline banner. No fix without redundant WAN. |
| R2 | Home power outage | Same as R1 | Small UPS ($60) keeps Pi + router alive for ~30-60 min. |
| R3 | Public IP change | Services unreachable until DDNS catches up | 5-min DDNS interval + short DNS TTL (60s) keeps drift under ~6 min. |
| R4 | SD/SSD failure | Full data loss if no backups | P7 backups; SSDs are more reliable than SD. Restore from `pg_dump` + repo clone. |
| R5 | Pi hardware failure | Days of downtime | Keep a spare 8GB Pi 5 + spare SSD on hand ($100). SD image of the OS on external drive for quick restore. |
| R6 | ISP moves us to CGNAT | Port-forward stops working | Migrate to Cloudflare Tunnel; ~1 day of firmware work to add WSS-MQTT support. Called out in [architectural choice](#2-architectural-choice-port-forward-vs-cloudflare-tunnel). |
| R7 | DDoS or scanning | Bandwidth or CPU exhaustion | UFW + fail2ban + Cloudflare in front of `app.` at minimum. Consider adding Cloudflare Tunnel later as DDoS shield without changing the port-forward on 8883. |
| R8 | Let's Encrypt rate limit | Cert renewal fails | 90-day certs, renew at 60. `certbot` handles automatically; alert on renewal failure. |
| R9 | Mosquitto TLS misconfig locks out firmware | Fleet-wide bricking risk | Test cutover on 1 controller first (P6.3). Keep old broker running in parallel during cutover so rollback is a firmware flag flip. |

---

## 12. Cost Summary

| Item | One-time | Monthly |
| :--- | ---: | ---: |
| Pi 5 8GB + PSU + case + SSD + cable | ~$180 | — |
| UPS (optional) | ~$60 | — |
| Cloudflare | — | $0 (free) |
| `azul-devices.com` renewal | — | ~$1 (amortized) |
| Backblaze B2 backups (< 5GB) | — | ~$0.03 |
| **Total** | **~$180-240** | **~$1** |

Compare to Fly.io / Railway / equivalent: $10-30/month. Pi wins economics until real customer load.

---

## 13. Related Documents

- Progress tracker: [`poc/hosting/dashboard.md`](../../poc/hosting/dashboard.md)
- Cloud API architecture: [`cloud-api-architecture.md`](cloud-api-architecture.md)
- OTA update architecture: [`ota-firmware-update-architecture.md`](ota-firmware-update-architecture.md) — firmware-side MQTT config change happens here in P6
- Domains: [`project_domains_branding`](../../.claude/... ) memory (subdomain plan pre-approved)
