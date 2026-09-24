# Home Server Hosting — Progress Tracker

**Objective:** Bring the Azul server stack up on a home-hosted server (`azul-server`) so mobile + firmware work from anywhere without USB tethering.

**Plan:** [home-server-hosting-plan.md](../../docs/design/home-server-hosting-plan.md)

**Cloud-parity superset:** [cloud-parity-checklist.md](cloud-parity-checklist.md) — the phases here are the *foundation* (get the box safely serving on the public internet); the cloud-parity checklist layers backups/monitoring/CI/HA-posture on top to make azul-server indistinguishable from a cloud VM.

> **Security ordering principle (2026-09-10):** Never expose a service to the WAN before the host firewall + service auth are in place. The perimeter is opened **late** — UFW baseline goes up first (P3), services come up **LAN-bound** (P5), certs issue via DNS-01 with **no inbound needed** (P6), and the router port-forwards are the **last** perimeter step, into an already-hardened box (P7). Data-durability + observability hardening (backups, monitoring, log caps) is a separate concern and runs **after** cutover (P9).

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
| **P1** | Hardware + OS bring-up | ✅ | — |
| **P2** | DNS migration to Cloudflare | ✅ | — (can start anytime) |
| **P3** | Host firewall baseline (UFW default-deny, SSH LAN-only) | ✅ | P1 |
| **P4** | DDNS (Cloudflare A records track WAN IP — opens nothing) | ✅ | P2 |
| **P5** | Server stack (Postgres, Mosquitto, Node) — **LAN/localhost-bound** | ✅ | P1, P3 |
| **P6** | TLS certs via Let's Encrypt DNS-01 (**no inbound required**) | ✅ | P2, P5 |
| **P7** | Perimeter open: UFW allow 443/8883 + fail2ban + MQTT auth, **then** router port-forwards | ◐ harden done 2026-09-22; forwards parked | P3, P5, P6 |
| **P8** | Cutover mobile + firmware | ⚪ | P7 |
| **P9** | Durability + observability (backups, monitoring, log rotation) | ⚪ | P8 |

> **Reorder note (2026-09-10):** phases were resequenced so hardening precedes exposure. The old plan opened WAN ports in "P3" and deferred all hardening to a final "P7", leaving a days-long window where the box was internet-reachable with no firewall. Old P4→now P5 (stack), old P5→now P6 (TLS), old P6→now P8 (cutover); old P7 "Hardening" split into **P3** (firewall baseline) + **P7** (perimeter open/auth) + **P9** (durability/observability). DDNS pulled out of old-P3 into its own **P4** since it exposes nothing.

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

- ✅ Acquire fanless x86 mini-PC (Beelink Mini S) + internal SSD + Ethernet cable (~$150)
- ✅ Install Ubuntu Server 26.04 LTS (codename `resolute`) to the internal SSD
- ✅ Install options: hostname `azul-server`, OpenSSH enabled, admin user created, Ethernet primary
- ✅ Router: reserve static DHCP lease for the server's MAC → `192.168.1.219`
- ✅ SSH in as `mitchellch@192.168.1.219`; box is headless
- ✅ `apt update && apt full-upgrade` (2026-09-07; 0 pkgs upgraded, no reboot needed. `libaudit1`/`libaudit-common` held by phasing — normal, arrive later)
- ✅ Confirm IPv6 works: `curl -6 ifconfig.io` → `2607:9b00:7000:a00::783` (public IPv6)
- ✅ Install baseline: `git curl vim ufw fail2ban unattended-upgrades` (2026-09-07; most already present, `fail2ban` + deps added, service enabled)
- ✅ Configure unattended-upgrades for security patches (2026-09-07; timers on via `dpkg-reconfigure`, drop-in `52unattended-upgrades-azul` adds Automatic-Reboot @ 03:30 + Remove-Unused-Kernel/Deps. Auto-reboot safe **contingent on reboot drill passing**)
- ✅ SSH key-based login working; password login disabled (2026-09-09; ed25519 key confirmed working, drop-in `00-azul-hardening.conf` sets `PasswordAuthentication no` overriding cloud-init's `50-` yes. Verified: fresh key login OK + password rejected `Permission denied (publickey)`). **Key management + laptop-swap procedure:** [runbook-ssh-access.md](runbook-ssh-access.md)

## P2 — DNS to Cloudflare

**Target:** 1 hour (mostly waiting for propagation)

- ✅ Cloudflare account created (personal Gmail), `azul-devices.com` added on Free plan (2026-09-09)
- ✅ Cloudflare DNS scan reviewed (2026-09-09): only 2 A records (apex + `www` → `208.91.197.27`, Network Solutions parking page). **No MX/SPF/TXT/DKIM/DMARC — no email to preserve.** Parking A records since replaced by the Cloudflare Workers landing site (apex + `www`).
- ✅ Two Cloudflare nameservers copied: `daniella.ns.cloudflare.com` + `karl.ns.cloudflare.com`. Replacing `ns99.worldnic.com` + `ns100.worldnic.com`.
- ✅ Network Solutions → azul-devices.com → nameservers set to `daniella.ns.cloudflare.com` + `karl.ns.cloudflare.com` (2026-09-09). DNSSEC confirmed **Disabled** at registrar (no DS mismatch risk). worldnic entries removed. ("Custom Nameservers" note is NS boilerplate for branded glue records — did not apply.)
- ✅ Cloudflare confirms **zone ACTIVE** (2026-09-09; verification email received — propagation took <1 hr). Nameservers `daniella`/`karl` live.
- ✅ Cloudflare account secured: **2FA (TOTP) active** + backup codes generated (2026-09-09). Store token+codes in personal 1Password.
- ✅ API token minted, scope `DNS:Edit` on `azul-devices.com` only (2026-09-09; verified `"status":"active"` via /user/tokens/verify from azul-server). ⚠️ Token value appeared in shell history + chat transcript — **roll it after P4/P6 verified** (Cloudflare → API Tokens → Roll).
- ✅ Token stored securely (`/etc/cloudflare.token` on azul-server, `chmod 600` root-only — verified 2026-09-09)
- ✅ Static "coming soon" landing site live at `azul-devices.com` + `www` (Cloudflare Workers static assets, 2026-09-09). Source: [`landing/index.html`](../../landing/index.html). Swapped/repointed when the real web app ships at `app.` (P8+).

## P3 — Host firewall baseline

**Target:** 15 min — **do this before anything binds a socket or a port is forwarded**

- ✅ `ufw default deny incoming` / `ufw default allow outgoing` (2026-09-10)
- ✅ `ufw allow from 192.168.1.0/24 to any port 22 proto tcp` (SSH from LAN only — WAN never sees 22)
- ⚪ (If out-of-band admin is wanted) allow SSH from the Tailscale/WireGuard interface too — see Security tooling below
- ✅ `ufw enable` (2026-09-10; session survived). `ufw status verbose` → `Default: deny (incoming), allow (outgoing), deny (routed)`; single rule `22/tcp ALLOW IN 192.168.1.0/24`
- ✅ Box is now default-closed to the WAN. 443/8883 are **not** opened here — that's P7, gated on the stack being up + hardened.
- ⚠️ **Side effect (2026-09-10):** this now also blocks LAN access to the running backend's dev ports (`3000` API / `3001` web) — UFW default-deny drops them for LAN clients too, since only 22 is allowed. `localhost` curls on the box are unaffected. If mobile/web dev needs azul-server over LAN *before* Caddy/TLS lands (P6/P7), add a temporary `ufw allow from 192.168.1.0/24 to any port 3000,3001 proto tcp` and remove it once the API is fronted on 443. **Docker caveat:** if the compose file publishes those ports to `0.0.0.0`, Docker's own DNAT rules bypass UFW and they may still be LAN-reachable regardless — verify at P7.

## P4 — DDNS (safe to run anytime; exposes nothing)

**Target:** 15 min

DDNS only makes `api.`/`mqtt.` *resolve* to the current WAN IP; with no port-forward (P7) nothing is reachable. Files version-controlled under [`ddns/`](ddns/) — see [`ddns/README.md`](ddns/README.md).

- ✅ DDNS script written (`cf-ddns.sh`) — polls WAN IP, idempotent create-or-update of Cloudflare A records, DNS-only (`proxied:false`)
- ✅ systemd oneshot service + 5-min timer written (`cf-ddns.service`, `cf-ddns.timer`)
- ✅ Installed on azul-server (2026-09-10; files `scp`'d to `/tmp`, `jq` already present, `install` to `/usr/local/bin` + `/etc/systemd/system`, `daemon-reload`)
- ✅ First `systemctl start cf-ddns.service` → journalctl: `created api.azul-devices.com -> 168.100.191.58` + `created mqtt.azul-devices.com -> 168.100.191.58`
- ✅ `systemctl enable --now cf-ddns.timer` (2026-09-10; next fire +5min, `OnUnitActiveSec=5min`). `dig +short api./mqtt.azul-devices.com @1.1.1.1` → `168.100.191.58` from both
- ✅ Initial A records `api.` + `mqtt.` created (`proxied:false`, TTL 60s)
- ⚪ (P8) add `app.azul-devices.com`; if fronted by Cloudflare proxy, set `proxied:true` for that name

## P5 — Server Stack (LAN/localhost-bound only)

**Target:** 1 day — nothing here is WAN-reachable; the port-forward is P7

- ✅ Postgres + Mosquitto up via `docker compose up -d` in `server/` (both containers running, verified 2026-09-11)
- ✅ Postgres reachable at `localhost:5432` from the server only; **not** published to LAN/WAN — bound `127.0.0.1:5432` (2026-09-11; was `0.0.0.0`+`[::]`, i.e. LAN + **public IPv6**, bypassing UFW via Docker DNAT). Mosquitto `1883`/`9001` likewise re-bound to `127.0.0.1` (plaintext broker never leaves the box; only the local API consumes it — verified via mosquitto logs: sole client is the API's `mqttjs_*` from the Docker gateway, zero controllers). `docker-compose.yml.bak` left on box.
- ✅ `azul` role + `azul` database created; **dev-default password rotated** (2026-09-11 via `ALTER USER azul WITH PASSWORD` — compose env is ignored on an existing volume). Verified enforced: real client path (host→gateway `172.18.0.1`→container) hits `host all all all scram-sha-256`; old pw `azul` → `password authentication failed`. The `trust` lines in pg_hba are loopback/`local` only (in-container), not a real exposure. New pw in `.env` (`DATABASE_URL` + `POSTGRES_PASSWORD`).
- ✅ Repo cloned to `/home/mitchellch/azul` (build + `.env` live here)
- ✅ `npx prisma migrate deploy` — schema up to date (2026-09-11; `prisma migrate status` → 8 migrations found, "Database schema is up to date!")
- ⚪ **(P6 deliverable — tracked here for continuity)** Mosquitto `8883` listener added with cert paths (populated in P6). Bound on the box but **not forwarded** until P7.
- ✅ MQTT user created via `mosquitto_passwd` (2026-09-11; `azul-api` for the backend. Per-device fleet creds deferred to cutover — no controllers on this broker yet). Passwd hashed, `chown 1883` `chmod 600`, mounted read-only.
- ✅ **Mosquitto ACL file** (2026-09-11; `azul-api` → `readwrite azul/#`. Per-device `pattern readwrite azul/%u/#` templated/commented for cutover — needs each device's MQTT username == its MAC). ACL owned by uid 1883 to satisfy mosquitto's future owner check.
- ✅ Anonymous MQTT access disabled (2026-09-11; `allow_anonymous false`. Verified: unauth `mosquitto_sub` → `Connection Refused: not authorised`, exit 5. API connects authenticated as `u'azul-api'`). Creds live in `.env` (`MQTT_USERNAME`/`MQTT_PASSWORD`), passed as connect options — **not** in `MQTT_URL`, so they never hit the `[MQTT] Connected to …` log line.
- ✅ Node 22 installed from NodeSource (2026-09-11; `node -v` → `v22.22.1`)
- ✅ Server `.env` populated (DATABASE_URL, MQTT_URL, SERVER_PUBLIC_URL, Auth0 creds, no DEBUG_MODE) + `MQTT_USERNAME`/`MQTT_PASSWORD` + `POSTGRES_PASSWORD`; **`chmod 600`, owned by `mitchellch`** (2026-09-11; `-rw------- 764B`). `web/.env` likewise `-rw------- 395B`.
- ✅ `npm run build` in `server/` produces `dist/` (2026-09-11; clean build)
- ✅ systemd units `azul-server.service` + `azul-web.service` installed (from `deploy/`), enabled, started (`systemctl is-active` → `active`/`active`, 2026-09-11)
- ✅ `systemctl status azul-server` → active; `curl http://localhost:3000/health` from azul-server → `{"ok":true}` (2026-09-11)
- ⚠️ Web (`next start`, SSR) runs on `3001` and answers on **localhost**, but is **intentionally NOT LAN-reachable right now**: P3's UFW default-deny blocks `192.168.1.219:3001` from the LAN (see line 90 side-effect). It unblocks when Caddy fronts it on 443 in P6 — until then, LAN/mobile access needs the temporary `ufw allow …3000,3001` rule. Not a regression; expected consequence of hardening-before-exposure.

## P6 — TLS Certs

**Target:** ½ day — DNS-01 needs no inbound; can complete before any port is forwarded

**Progress is chunked A–G (see `Chunk` tags) so it can be done in fits-and-spurts — each chunk leaves the box working, WAN still closed.**

- ✅ **(Chunk A)** certbot + `python3-certbot-dns-cloudflare` + Caddy installed (2026-09-12; certbot 4.0.0, `dns-cloudflare` plugin registered, Caddy v2.11.4). Caddy pkg auto-started a default welcome-page service on :80 — not LAN/WAN-reachable (UFW), replaced in Chunk D.
- ✅ **(Chunk B)** `/etc/letsencrypt/cloudflare.ini` built from the existing DDNS token (reused `/etc/cloudflare.token`, `DNS:Edit` scope), `chmod 600` root-only (2026-09-12; 53-char token, `grep -c` = 1).
- ✅ **(Chunk C)** Cert `azul` issued via DNS-01 (2026-09-12; **ECDSA P-256**, SANs `api.` + `mqtt.`, VALID 89d → expires 2026-12-11). Files at `/etc/letsencrypt/live/azul/{fullchain,privkey,cert,chain}.pem` (both Caddy + Mosquitto consume this one cert; single renewal). Certbot **auto-installed the renewal systemd timer** — Chunk F just adds a deploy-hook. ⚠️ cosmetic: `python3-cloudflare` 2.20.x prints a `PendingDeprecationWarning` wall — harmless, run succeeds.
- ✅ **(Chunk D)** Caddy terminates TLS on 443 for `api.azul-devices.com` → `reverse_proxy localhost:3000`, explicit `tls` directive → LE cert (verified: Caddy logs "skipping automatic certificate management…", so no self-ACME). Verified via `curl --resolve api.azul-devices.com:443:127.0.0.1 …/health` → `{"ok":true}`, no TLS warning (2026-09-12). Cert readable by the `caddy` user via POSIX ACL `setfacl -R -m u:caddy:rX -m d:u:caddy:rX /etc/letsencrypt/{live,archive}` (default ACL → survives renewal). `/etc/caddy/Caddyfile` is the config. **`app.` → `:3001` deferred to P8** (cert has no `app.` SAN, no `app.` DNS record yet). Auto HTTP→HTTPS redirect on for free.
- ✅ **(Chunk E)** Mosquitto `8883` TLS listener up (2026-09-12; broker 2.1.2, `Opening ipv4/ipv6 listen socket on port 8883`). Cert-in-container gotcha solved by **copying** `fullchain.pem`+`privkey.pem` to `/etc/mosquitto-certs` (host, outside repo), `chown 1883:1883`, mounted `:ro` at `/mosquitto/certs` (NOT the ACL trick — broker is uid 1883 in-container, host-user ACL doesn't map). `certfile`/`keyfile` per-listener; auth is global (`per_listener_settings` false) so 8883 inherits `allow_anonymous false` + passwd + acl. **Bound `127.0.0.1:8883` for now** (Docker bypasses UFW, so localhost-bind is what keeps it off the LAN until P7; flip to `8883:8883` at P7). Verified via localhost: anon over TLS → `not authorised` (exit 5); authed `azul-api` publish over TLS → exit 0; chain validates to ISRG root via system store. ⚠️ carried-over cosmetic: `acl` file not owned by uid 1883 → mosquitto warns (fix: `sudo chown 1883:1883 mosquitto/acl`).
- ✅ **(Chunk F)** Renewal automated + tested (2026-09-12). Deploy hook `/etc/letsencrypt/renewal-hooks/deploy/azul-cert-deploy.sh` (runs as root post-renewal): re-copies cert to `/etc/mosquitto-certs` + `chown 1883` + restarts broker (Mosquitto reads a COPY, so this is mandatory), re-asserts Caddy ACL, reloads Caddy (reads live cert directly). Hardened PATH for the systemd-timer context. Verified: manual hook run → exit 0, broker back with TLS+auth (anon→exit 5); `certbot renew --cert-name azul --dry-run` → "all simulated renewals succeeded". Cert expires 2026-12-11; certbot pkg's systemd timer drives `renew`.
- ✅ **(Chunk G)** P6 sign-off (2026-09-12): `certbot.timer` scheduled + active (`ACTIVATES certbot.service`, ~twice-daily), and `curl --resolve api.azul-devices.com:443:127.0.0.1 https://api.azul-devices.com/health` → `{"ok":true}`. External verification is P7, once forwarded.

## P7 — Perimeter open (harden, then forward)

**Target:** ½ day — this is the only phase that makes the box WAN-reachable. Do the hardening **before** the forwards.

**Harden first:** — ✅ **DONE 2026-09-22** (no WAN exposure; forwards still parked)
- ✅ `ufw allow 443/tcp` + `ufw allow 8883/tcp` (v4+v6, from anywhere). `22/tcp` stays LAN-only (`192.168.1.0/24`); default still `deny (incoming)` / `deny (routed)` — rules are staged, nothing reachable until the router forwards. Undo: `sudo ufw delete allow 443/tcp` (+8883).
- ✅ fail2ban `sshd` jail active (journal-backed: `_SYSTEMD_UNIT=ssh.service + _COMM=sshd`, 0 failed / 0 banned). No `sshd.local` needed — Ubuntu `defaults-debian.conf` enables it.
- ⚪ **`mosquitto` jail — DEFERRED to forward step** (2026-09-22): broker is bound `127.0.0.1:8883` only until the port-forward, so no external client can hit it yet; mosquitto's IP↔auth-failure log correlation is also unreliable for fail2ban. Set up when flipping the bind to `8883:8883`.
- ✅ MQTT anonymous auth disabled + ACLs enforced (from P5) — no-cred probe on `127.0.0.1:1883` → `Connection Refused: not authorised` (exit 5).
- ✅ Reverse-proxy request-size limit in place — Caddy `request_body { max_size 32MB }` added to `api.azul-devices.com` block (Caddy has NO default body cap; 32MB = DoS guard with OTA-firmware-upload headroom). `caddy validate` clean, graceful reload, `/health` 200. Backup at `/etc/caddy/Caddyfile.bak`.
- ✅ **API rate-limiting (app layer) — DONE 2026-09-22:** `express-rate-limit` v8 added to the Node API. Global 600/min per-IP cap on `/api` (before JWT verification, so invalid-token floods are throttled too) + tight 20/hr cap on the M2M firmware-upload POST. `app.set('trust proxy', 1)` so `req.ip` is the real client behind Caddy (bump `TRUST_PROXY_HOPS=2` in `.env` at Cloudflare cutover). Env-tunable (`RATE_LIMIT_MAX`, etc.). In-memory store (fine for single instance). Verified: 429 past cap, standard `RateLimit-*` headers. `/health`, `/firmware` downloads, `/uploads` intentionally unthrottled.
- ⚪ **WAF / edge rate-limiting — Cloudflare proxy** (decided 2026-09-22), executed at forward step: orange-cloud `api.azul-devices.com` (WAF + DDoS + edge rate-limit + hides WAN IP), then lock UFW origin-443 to Cloudflare IP ranges + Full(strict) origin cert. Resolves the standing "proxy `api.` through Cloudflare?" open question below. The app-layer limiter above is the defense-in-depth backstop that survives an origin bypass.
- ℹ️ **Docker-bypasses-UFW caveat (flagged at P5) — NON-issue:** `docker ps` confirms postgres + mosquitto publish to `127.0.0.1` only; Docker's DNAT is not exposing them to LAN/WAN.

**Then open the WAN:** — ⚪ **parked** (this is the only step that makes the box WAN-reachable)
- ⚪ Confirm UPnP is off on the router (no auto-added rules)
- ⚪ Port forward: WAN 443 → `192.168.1.219:443` (TCP)
- ⚪ Port forward: WAN 8883 → `192.168.1.219:8883` (TCP)
- ⚪ (Optional but recommended) proxy `api.` through Cloudflare + restrict origin 443 in UFW to Cloudflare IP ranges — see Security tooling
- ⚪ External verification (phone on cellular): `curl https://api.azul-devices.com/health` → 200; `mosquitto_sub -h mqtt.azul-devices.com -p 8883 --cafile …` → subscribes
- ⚪ Momentary reachability sanity check (optional): `python3 -m http.server 443` on azul-server, hit from cellular, **kill immediately after** — never leave an unauth'd server on an open port

## P8 — Cutover

**Target:** ½ day, careful

- ⚪ New firmware build with MQTT host = `mqtt.azul-devices.com`, port 8883, TLS on, ISRG Root X1 baked in
- ⚪ Test firmware push to controller #1 (26:7B:8C or similar) via existing OTA path
- ⚪ Controller #1 reconnects to azul-server broker → verify heartbeat in mosquitto logs
- ⚪ Firmware pushed to remaining controllers, one at a time, each verified before next
- ⚪ `mobile/.env` updated: `EXPO_PUBLIC_API_URL=https://api.azul-devices.com/api`
- ⚪ Mobile rebuilt via `expo run:android` + installed on device
- ⚪ Mobile smoke test: tap controller → programs load, zone start/stop work over cellular (not just WiFi)
- ⚪ Web `.env` updated similarly, web smoke test
- ⚪ (If adopting) `app.azul-devices.com` proxied through Cloudflare, added to DDNS `RECORDS` with `proxied:true`; landing site repointed
- ⚪ Laptop server retired: kill `npm run dev`, `[HTTP]` logger removed from `server/src/index.ts` (commit 35c2ba4)
- ⚪ Old laptop `mosquitto` service stopped
- ⚪ Old `.env.local` LAN IP cleared to avoid future confusion ([[mobile-env-local-lan-ip]])

## P9 — Durability + observability

**Target:** ½ day — runs after cutover; not a perimeter concern

**Backups — pulled forward + dev-scoped (2026-09-12).** Decided to stand up backups *before* P7 rather than after cutover. Right-sized for the current reality (dev work, no customers, no live data, no PII): the only failure mode worth guarding is SSD death / fat-fingered dev DB — **not** fire/theft/ransomware, which is why we chose a **local encrypted restic repo on a USB thumb drive** and *skipped* the offsite (B2/GDrive) + air-gap ceremony. The value protected is less the dev data than the sunk P1–P6 setup (compose, migrations, mosquitto auth/ACL, LE certs, Caddy, deploy hook, `.env` secrets). **Off-site + immutability + restore-drill discipline is a genuine pre-launch concern — revisit when real controllers hold real customer schedules, not before.** This does **not** gate P7. Chunked K1–K5:

- ✅ **(K1)** USB backup drive prepped (2026-09-12; Lexar 32 GB `/dev/sdb`, factory vfat wiped → GPT + single ext4 partition LABEL `azul-backup`, UUID `4f87a7d0-…`). Mounted at `/mnt/azul-backup` via UUID `fstab` entry with `nofail` + `x-systemd.device-timeout=10` (survives reboot; pulling the stick never blocks boot). `df` → 29 GB, 1% used. Stays permanently plugged (always-mounted is fine for dev — the fire/theft/ransomware caveat doesn't apply). Second identical stick kept as a cold spare.
- ✅ **(K2)** `restic` 0.18.1 installed + encrypted repo `422c719c` init'd on `/mnt/azul-backup` (2026-09-12). Repo password (alphanumeric, generated in 1Password) stored at `/etc/azul-backup/restic-password` (root `600`) for unattended runs. **Verified the on-box file == the 1Password copy via `sha256sum` compare** *before* init — so the repo is provably recoverable from the 1Password value if the SSD dies. (restic's interactive password prompt gave false `wrong password` failures — paste artifact; the hash-compare sidesteps it and is the authoritative check. First init used a symbol-laden password that mismatched → wiped empty repo + re-did with alphanumeric.)
- ✅ **(K3)** Nightly job live (2026-09-12). Script `/usr/local/sbin/azul-backup.sh` (root `750`): `pg_dump` the `azul` DB via `docker compose exec -T postgres` (in-container local socket = `trust`, so no DB pw on the cmdline) → staged plaintext dump deleted after via `trap` (no lingering unencrypted copy; restic dedups repo-side regardless) → one `restic backup --tag azul` of the dump + `.env`×2 + mosquitto `conf`/`passwd`/`acl` + `docker-compose.yml` + `/etc/letsencrypt` + `/etc/mosquitto-certs` + Caddyfile + 4 systemd units + `/etc/cloudflare.token`. Driven by `azul-backup.timer` (`OnCalendar=02:30`, `Persistent=true`, `RandomizedDelaySec=300`) → `azul-backup.service` (`Type=oneshot`). Manual run verified: snapshot `56e69c11`, 31 files; DB dump confirmed real (31 KB, valid `pg_dump` 16.15 header + full Azul schema). NEXT fire Sun 2026-09-13 02:33 UTC.
- ✅ **(K4)** Retention folded into the nightly script: `restic forget --tag azul --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune`. *(TODO: add a weekly `restic check` for integrity — not yet wired.)*
- ✅ **(K5)** Restore drill passed (2026-09-12): restored `latest` into a throwaway `postgres:16-alpine` container (live DB untouched) → **19 relations recovered, including the partitioned `event_log` + monthly children** (`event_log_2026_09/_10/_11`) — confirms partitions survive dump/restore ([[project_event_log_partitions]]). Full pipeline (USB repo → restic → psql) verified. Recovery runbook (DB-only + bare-metal + password-verify): [runbook-backup-restore.md](runbook-backup-restore.md).
- ⚪ *(deferred to real-customer launch)* Encrypted off-site backup + immutability (restic → B2 append-only / Object Lock — survives a box compromise) + rotated/air-gapped copy for true 3-2-1
- ⚪ UptimeRobot (or equivalent) hitting `/health` every 5 min, email alert on 2 consecutive failures
- ⚪ journald size cap set, Postgres log rotation configured
- ⚪ (Optional) roll the Cloudflare API token now that P4/P6 are done (it was exposed in transcript/shell history); overwrite `/etc/cloudflare.token` + `/etc/letsencrypt/cloudflare.ini`

---

## Security tooling — candidates

Beyond what's already baked into the phases (UFW, fail2ban, unattended-upgrades, key-only SSH, MQTT auth, Let's Encrypt TLS), evaluated for a home-hosted box exposing API (443) + MQTT (8883):

**Adopt (high value / low effort):**
- **Cloudflare proxy (orange-cloud) for `api.` and future `app.`** — free WAF, DDoS shield, rate-limiting, bot filtering, **and it hides the home WAN IP** (offsets the privacy cost of DDNS publishing it). Then lock UFW origin-443 to [Cloudflare's published IP ranges](https://www.cloudflare.com/ips/) so the origin only accepts proxied traffic. `mqtt.`/8883 **cannot** be proxied (not HTTP) — it stays DNS-only + direct-forward.
- **Tailscale (or WireGuard)** for out-of-band admin — SSH over the mesh VPN from anywhere without ever opening 22 to the WAN. UFW then allows 22 from LAN + the Tailscale interface only.
- **Mosquitto ACLs** — per-fleet/per-device topic scoping so a leaked credential can't touch another device's topics (folded into P5).
- **Encrypted off-site backups (restic → B2)** instead of plain rsync (folded into P9).

**Consider:**
- **CrowdSec** — modern fail2ban alternative with crowd-sourced IP reputation + a Cloudflare/nginx bouncer; heavier, worth it if the box takes real abuse.
- **API rate-limiting** at the app layer (`express-rate-limit`) if not proxying through Cloudflare.
- **Cloudflare "Full (strict)" TLS** with an origin cert if `api.` is proxied.

**Skip for the PoC (revisit at scale):**
- MQTT per-device client certs (already a tracked open question — start with user/pass + ACLs).
- `auditd`, PAM TOTP on SSH (key-only is sufficient), host IDS.

**Not a security tool:** DDNS. It's availability plumbing (keeps the name pointed at a rotating IP); its only security-adjacent effect is *publishing the home IP*, which the Cloudflare proxy above mitigates for the HTTP side.

---

## Open Questions / Decisions Pending

- **UPS or no UPS?** ~$60 keeps the server + router up through short blackouts. Worth it once controllers are on server-hosted MQTT.
- **Firmware TLS trust store**: bake ISRG Root X1 (Let's Encrypt) only, or also include a fallback cert? Only-ISRG is simplest; fallback means firmware ships knowing how to reach a backup broker.
- **MQTT auth model**: username+password per fleet, or per-device client certs? Certs are more secure but way more provisioning complexity. Start with u/p + ACLs, migrate later if needed.
- **Proxy `api.` through Cloudflare?** Recommended (WAF + hides origin IP), but adds an origin-cert + Full(strict) step and couples the API to Cloudflare's edge. Decide before P7 opens 443.
- **Web app TLS fronting**: expose `next start` (3001) directly on the LAN for now, or put Caddy in front terminating TLS on 443 once P6 lands? Static export / Cloudflare Pages is ruled out — the web app is SSR with server-side Auth0 and needs a running Node server.

---

## Notes

- Cutover **must** keep laptop server running until at least one controller is confirmed on azul-server. Rollback = firmware config flip back to laptop broker. Do NOT retire laptop until fleet is fully migrated.
- Deleted `mobile/.env.local` LAN IP override was the source of a full session of "why can't I connect" — see [[mobile-env-local-lan-ip]]. On azul-server, `.env` is the sole config file.
- **Zscaler/NRD gotcha (2026-09-10):** the work laptop's Zscaler VPN blocks newly-registered personal domains at both the DNS layer (resolver times out) and the connection layer (TLS reset even when forcing the edge IP). `azul-devices.com`/`api.`/`app.` will be unreachable *on the MDM laptop* for days until the domain ages out of the NRD filter — the sites are healthy globally. Test from cellular or a non-corp network. Doing personal-infra work on the corp machine will keep tripping this.
