# Azul Backend Server

Node.js/TypeScript backend for the Azul irrigation system.

## Status (May 2026)

v0.1.0 skeleton implemented and running locally:
- Express + TypeScript REST API
- Prisma ORM with PostgreSQL
- MQTT client (subscribes to device status, publishes commands)
- Docker Compose for zero-cost local development (Postgres + Mosquitto)
- Auth0 JWT validation (wired up, not yet enforced in dev)

See [Cloud API Architecture](../docs/design/cloud-api-architecture.md) for full design details.

---

## Directory Structure

```
server/
  src/
    index.ts              Entry point — Express app + MQTT startup
    router.ts             Route registration
    db/
      client.ts           Prisma client singleton
    handlers/
      devices.ts          GET/POST /api/devices, zone start/stop
      zones.ts            GET/PUT /api/devices/:mac/zones
      logs.ts             GET /api/devices/:mac/log
    mqtt/
      client.ts           MQTT connection, subscribe, publish
      handlers.ts         Incoming message handlers (device status upsert)
  prisma/
    schema.prisma         Database schema (users, devices, zones, audit_log)
    migrations/           Generated Prisma migrations
  infra/                  Terraform (future — cloud deployment)
  docker-compose.yml      Local Postgres + Mosquitto
  mosquitto.conf          Mosquitto config (anonymous, ports 1883 + 9001)
  .env.example            Template — copy to .env.local
  package.json
  tsconfig.json
```

---

## Local Development Setup

### Prerequisites

| Tool | Install |
|---|---|
| Node.js 20+ | Already installed (`node --version`) |
| Docker Desktop | [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/) |

### First-Time Setup

**1. Install Docker Desktop**

Download and install Docker Desktop for Mac (Apple Silicon). Launch it and wait for the whale icon to appear in the menu bar — it takes ~30 seconds to start.

**2. Clone/navigate to the server directory**
```bash
cd /Users/mitch.christensen/personal/dev/azul/server
```

**3. Copy the environment file**
```bash
cp .env.example .env.local
```
The defaults in `.env.local` work out of the box for local development — no edits needed.

**4. Start the database and MQTT broker**
```bash
docker-compose up -d
```
This starts two containers:
- **PostgreSQL** on port `5432` — the database
- **Mosquitto** on port `1883` (MQTT) and `9001` (WebSocket)

Wait a few seconds for Postgres to be ready, then verify:
```bash
docker-compose ps
```
Both should show `healthy` or `running`.

**5. Install Node dependencies**
```bash
npm install
```

**6. Run database migrations**
```bash
npm run db:migrate
```
This creates all tables. Prisma will ask for a migration name — just press Enter to accept the default.

**7. Generate Prisma client**
```bash
npm run db:generate
```

**8. Start the API server**
```bash
npm run dev
```
The server starts at `http://localhost:3000` with hot-reload via `tsx watch`.

**9. Verify everything is working**
```bash
# Health check
curl http://localhost:3000/health
# → {"ok":true,"uptime":0.123}

# List devices (empty on first run)
curl http://localhost:3000/api/devices
# → []
```

---

## Day-to-Day Development

### Starting a session

```bash
# 1. Start Docker services (if not already running)
docker-compose up -d

# 2. Start the API server
npm run dev
```

### Stopping a session

```bash
# Stop the API server
Ctrl+C

# Stop Docker services (data is preserved)
docker-compose down
```

### Wiping all data (fresh start)

```bash
docker-compose down -v    # removes volumes (wipes database)
docker-compose up -d
npm run db:migrate
```

---

## Database Management

### Browse data visually

```bash
npm run db:studio
```
Opens Prisma Studio at `http://localhost:5555` — a web UI to browse and edit all tables.

### Create a new migration after schema changes

```bash
# Edit prisma/schema.prisma, then:
npm run db:migrate
npm run db:generate
```

### Connect directly with psql

```bash
docker exec -it $(docker-compose ps -q postgres) psql -U azul -d azul
```

---

## MQTT

### Broker details

| Setting | Value |
|---|---|
| Host | `localhost` |
| Port | `1883` (MQTT) / `9001` (WebSocket) |
| Auth | None (anonymous, local dev only) |

### Monitor all messages

```bash
# Install mosquitto-clients if needed: brew install mosquitto
mosquitto_sub -h localhost -t "azul/#" -v
```

### Send a test command to a device

```bash
# Start zone 1 for 30 seconds on device with MAC AC:A7:04:26:60:D0
mosquitto_pub -h localhost -t "azul/AC:A7:04:26:60:D0/cmd/zone/start" \
  -m '{"zone":1,"duration":30}'
```

---

## REST API

Base URL: `http://localhost:3000/api`

> Auth0 JWT validation is wired up but **not enforced in dev mode**. All endpoints are open locally.

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Server health check |
| GET | `/api/devices` | List all registered devices |
| GET | `/api/devices/:mac` | Get device by MAC address |
| POST | `/api/devices` | Register a device |
| POST | `/api/devices/:mac/zones/:zoneId/start` | Start a zone via MQTT |
| POST | `/api/devices/:mac/zones/stop-all` | Stop all zones via MQTT |
| GET | `/api/devices/:mac/zones` | List zones for a device |
| PUT | `/api/devices/:mac/zones/:zoneId` | Rename a zone |
| GET | `/api/devices/:mac/log` | Audit log (`?limit=50`) |

### Example: register a device

```bash
curl -s -X POST http://localhost:3000/api/devices \
  -H "Content-Type: application/json" \
  -d '{"mac":"AC:A7:04:26:60:D0","name":"Backyard Controller"}' \
  | python3 -m json.tool
```

### Example: start zone 2 for 60 seconds

```bash
curl -s -X POST http://localhost:3000/api/devices/AC:A7:04:26:60:D0/zones/2/start \
  -H "Content-Type: application/json" \
  -d '{"duration":60}'
```

---

## Connecting the ESP32

Once the backend is running, configure the ESP32 firmware to connect to the local MQTT broker.

The broker address will be your Mac's local IP (not `localhost` — the ESP32 is a different device):

```bash
# Find your Mac's local IP
ipconfig getifaddr en0
# e.g. 192.168.1.100
```

Then on the ESP32 CLI:
```
mqtt-set 192.168.1.100 1883
```
*(MQTT CLI command to be added to firmware)*

Once connected, the device will automatically appear in `GET /api/devices` after publishing its first status message.

---

## MQTT Device Protocol

**Topic namespace:** `azul/{device_mac}/`

### Device → Backend (subscribe)

| Topic | Payload | Description |
|---|---|---|
| `azul/{mac}/status` | JSON status object | Published every 60s and on state change |
| `azul/{mac}/events` | JSON event | Zone start/stop, boot |
| `azul/{mac}/log` | JSON audit entry | Zone activation records |

### Backend → Device (publish)

| Topic | Payload | Description |
|---|---|---|
| `azul/{mac}/cmd/zone/start` | `{"zone":1,"duration":60}` | Start a zone |
| `azul/{mac}/cmd/zone/stop` | `{"zone":1}` | Stop a zone |
| `azul/{mac}/cmd/zone/stop-all` | `{}` | Stop all zones |
| `azul/{mac}/cmd/schedule/set` | Schedule JSON | Push schedule to device |
| `azul/{mac}/cmd/schedule/activate` | `{"uuid":"..."}` | Activate a schedule |
| `azul/{mac}/cmd/time/set` | `{"tz_offset":-25200,"tz_name":"..."}` | Set timezone |
| `azul/{mac}/cmd/reboot` | `{}` | Reboot device |

---

## Implementation Order

1. ✅ Express + Prisma + MQTT skeleton
2. ✅ Device auto-registration from MQTT status
3. ✅ Zone control via MQTT publish
4. ⬜ Add MQTT to ESP32 firmware
5. ⬜ Auth0 JWT enforcement
6. ⬜ Schedule sync (push schedules to device on connect)
7. ⬜ Audit log aggregation from device MQTT
8. ⬜ Mobile app controllers screen
9. ⬜ Terraform cloud deployment (when approaching production)

---

## Cost Profile

| Service | Local dev | Cloud production (est.) |
|---|---|---|
| Postgres | $0 (Docker) | ~$15-30/mo (RDS t3.micro) |
| MQTT | $0 (Docker) | ~$5-15/mo (IoT Core) |
| API | $0 (local) | ~$5-20/mo (Lambda) |
| Auth0 | $0 (free tier) | $0-23/mo |
| **Total** | **$0** | **~$25-70/mo** |
