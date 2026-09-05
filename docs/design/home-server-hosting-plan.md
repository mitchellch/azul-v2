# Home Server Hosting — Implementation Plan

**Scope:** Move Azul's server stack (Node API, Mosquitto, Postgres) from the dev laptop onto a home-hosted server so mobile + firmware can reach the services from anywhere — without depending on `adb reverse` USB tethering. First step toward eventual cloud deployment; the same code and topology moves to a cloud host later without further changes.

The home server is generic x86_64 hardware — the current box is a fanless Beelink Mini S running Ubuntu Server 24.04 LTS. Nothing in this plan assumes a specific vendor; any small always-on Linux machine works.

**What's excluded from this plan** (deferred to later work):

- Public cloud deployment (Fly.io, AWS, Railway, etc.)
- High availability, redundancy, or automated failover
- Managed Postgres / hosted MQTT broker
- CDN or edge-cached assets
- Formal monitoring / alerting / on-call rotation

The home server is the intermediate host that unlocks remote mobile access and remote firmware operation, without incurring cloud-provider costs before we need them.

---

## 1. Objective

Bring up a home server (`azul-server`, `192.168.1.219`) that serves:

- **`api.azul-devices.com`** — Node/Express API (currently on laptop `localhost:3000`)
- **`mqtt.azul-devices.com`** — Mosquitto broker for firmware ↔ server ↔ web MQTT (currently on laptop `localhost:1883`)
- **Postgres** — internal only, listens on the server's loopback interface, no public exposure

Reachable from:
- Mobile app on cellular, corporate WiFi (Zscaler), or any external network
- Firmware controllers deployed anywhere with internet
- Web app served from any host

**Success criteria:**

1. Mobile app configured with `EXPO_PUBLIC_API_URL=https://api.azul-devices.com/api` connects successfully with no adb tunneling.
2. Firmware on a controller configured to `mqtts://mqtt.azul-devices.com:8883` connects, publishes heartbeat, receives commands.
3. Server survives a reboot without manual intervention (systemd + docker restart policies).
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
| **P1** | Hardware + OS bring-up | Server boots off internal SSD, has static LAN IP, SSH access |
| **P2** | DNS migration | `azul-devices.com` nameservers → Cloudflare; API token minted |
| **P3** | Router configuration | Port forwards `443` and `8883` → server; DDNS running |
| **P4** | Server stack install | Postgres, Mosquitto, Node API running as Docker + systemd services |
| **P5** | TLS certs | Let's Encrypt certs for `api.` and `mqtt.` via DNS-01, auto-renew |
| **P6** | Cutover | Mobile + firmware repointed at public hostnames; laptop server retired |
| **P7** | Hardening | UFW, fail2ban, MQTT auth, backups |

Sequential — each phase depends on the previous. P6 is the visible "moved off laptop" milestone; P7 is the "safe to leave running" milestone.

---

## 4. P1 — Hardware + OS

**Bill of materials:**

| Item | Notes |
| :--- | :--- |
| Fanless x86_64 mini-PC | Current box: Beelink Mini S. Any small always-on Linux machine works; 8GB+ RAM gives Postgres + Node headroom |
| Internal NVMe/SATA SSD | 256GB+; internal storage is reliable under sustained Postgres write load |
| Ethernet cable | Wired > WiFi for a server role |

*(The Beelink Mini S ships with its own PSU and enclosure, so there are no separate PSU/case line items.)*

**Steps:**

1. Install Ubuntu Server 24.04 LTS to the internal SSD. (The current box is already provisioned this way.)
2. During install: set hostname `azul-server`, enable OpenSSH server, create the admin user, wire Ethernet as primary.
3. Boot, confirm it comes up headless and is reachable over SSH.
4. On router: assign static DHCP lease to the server's MAC → `192.168.1.219` (its current reserved IP).
5. SSH in as `mitchellch@192.168.1.219`, `sudo apt update && sudo apt full-upgrade -y`, reboot.
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
6. In Cloudflare, mint an API token scoped to **DNS:Edit** for `azul-devices.com`. Save to the server at `/etc/cloudflare.token` (chmod 600).

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
| 443 | `192.168.1.219` (server) | TCP | 443 |
| 8883 | `192.168.1.219` (server) | TCP | 8883 |

**DDNS** (on the server):

Write a small script that:
1. Queries `curl -4 ifconfig.io` for current WAN IPv4.
2. Compares against cached value.
3. If changed, POSTs new IP to Cloudflare's DNS API for `api.` and `mqtt.` A records.

Run every 5 minutes via cron or systemd timer. No third-party DDNS service needed since we control DNS at Cloudflare directly.

---

## 7. P4 — Server Stack

Because the server is x86_64 and Docker-capable, Postgres and Mosquitto run as containers via the existing `server/docker-compose.yml` — no native apt install needed. The Node API and web app run as native systemd services.

**Postgres + Mosquitto (Docker):**

- From the repo's `server/` directory: `docker compose up -d`.
- Postgres publishes `5432` and Mosquitto `1883`/`9001` to the host's loopback; the API reaches them at `localhost`. Both containers carry `restart: unless-stopped` so they return after a reboot.
- Create the `azul` role + `azul` database (the compose file seeds these) matching current dev credentials. Change the default password before public exposure (see P7).
- Apply the schema via `npx prisma migrate deploy` from the repo checked out on the server.
- For the public MQTTS listener on `8883`, add a Mosquitto listener bound to `0.0.0.0` with `require_certificate false`, username/password auth, and `cafile`/`certfile`/`keyfile` pointing at Let's Encrypt paths (populated in P5). Create MQTT users with `mosquitto_passwd` — one per firmware fleet + one for the server.

**Node API:**

- Clone `azul-v2` repo to `/home/mitchellch/azul`.
- Install Node 22 from NodeSource so `/usr/bin/node` exists (nvm paths don't resolve inside a non-login systemd unit).
- `cd server && npm install && npx prisma generate && npm run build`.
- Install the systemd unit from `deploy/azul-server.service`:
  - `ExecStart=/usr/bin/node dist/index.js`
  - `Restart=always`, `WorkingDirectory=/home/mitchellch/azul/server`
  - `EnvironmentFile=/home/mitchellch/azul/server/.env`
- Enable + start: `sudo systemctl enable --now azul-server`.

**Web (Next.js):**

- The web app is a Next.js **SSR** app with server-side Auth0 — it must run via `next start` as a service, **not** a static export.
- `cd web && npm install && npm run build`, then install `deploy/azul-web.service` (`ExecStart=/usr/bin/npm run start`, port 3001) and `sudo systemctl enable --now azul-web`.

`.env` on the server:
- `DATABASE_URL=postgresql://azul:...@localhost:5432/azul`
- `MQTT_URL=mqtt://localhost:1883` (server → local plaintext listener)
- `SERVER_PUBLIC_URL=http://192.168.1.219:3000` (firmware builds its OTA download URL from this)
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

1. Bring the server to running state — API + MQTT reachable from public internet at their real hostnames. Verify with `curl https://api.azul-devices.com/health` from external network.
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
- **Backups:** nightly `pg_dump` to the server's SSD + rsync to an external drive or cloud (Backblaze B2, ~$0.005/GB/mo).
- **Monitoring:** at minimum, an uptime check from a third-party like UptimeRobot hitting `/health` every 5 min.
- **Log rotation:** journald sizes, Postgres logs, Mosquitto logs — cap at reasonable sizes.

---

## 11. Risk Register

| # | Risk | Impact | Mitigation |
| :- | :--- | :--- | :--- |
| R1 | Home internet outage | Full downtime for cloud-mode controllers + mobile | Firmware falls back to standalone schedule; mobile shows offline banner. No fix without redundant WAN. |
| R2 | Home power outage | Same as R1 | Small UPS ($60) keeps the server + router alive for ~30-60 min. |
| R3 | Public IP change | Services unreachable until DDNS catches up | 5-min DDNS interval + short DNS TTL (60s) keeps drift under ~6 min. |
| R4 | SSD failure | Full data loss if no backups | P7 backups; restore from `pg_dump` + repo clone. |
| R5 | Server hardware failure | Days of downtime | Keep a spare mini-PC + spare SSD on hand (~$150). OS image on external drive for quick restore. |
| R6 | ISP moves us to CGNAT | Port-forward stops working | Migrate to Cloudflare Tunnel; ~1 day of firmware work to add WSS-MQTT support. Called out in [architectural choice](#2-architectural-choice-port-forward-vs-cloudflare-tunnel). |
| R7 | DDoS or scanning | Bandwidth or CPU exhaustion | UFW + fail2ban + Cloudflare in front of `app.` at minimum. Consider adding Cloudflare Tunnel later as DDoS shield without changing the port-forward on 8883. |
| R8 | Let's Encrypt rate limit | Cert renewal fails | 90-day certs, renew at 60. `certbot` handles automatically; alert on renewal failure. |
| R9 | Mosquitto TLS misconfig locks out firmware | Fleet-wide bricking risk | Test cutover on 1 controller first (P6.3). Keep old broker running in parallel during cutover so rollback is a firmware flag flip. |

---

## 12. Cost Summary

| Item | One-time | Monthly |
| :--- | ---: | ---: |
| Fanless x86 mini-PC (Beelink Mini S) w/ SSD | ~$150 | — |
| UPS (optional) | ~$60 | — |
| Cloudflare | — | $0 (free) |
| `azul-devices.com` renewal | — | ~$1 (amortized) |
| Backblaze B2 backups (< 5GB) | — | ~$0.03 |
| **Total** | **~$150-210** | **~$1** |

Compare to Fly.io / Railway / equivalent: $10-30/month. Self-hosting wins economics until real customer load.

---

## 13. Related Documents

- Progress tracker: [`poc/hosting/dashboard.md`](../../poc/hosting/dashboard.md)
- Cloud API architecture: [`cloud-api-architecture.md`](cloud-api-architecture.md)
- OTA update architecture: [`ota-firmware-update-architecture.md`](ota-firmware-update-architecture.md) — firmware-side MQTT config change happens here in P6
- Domains: [`project_domains_branding`](../../.claude/... ) memory (subdomain plan pre-approved)
