# Azul Server

Backend API for the Azul irrigation system. Connects Auth0-authenticated mobile/web clients to irrigation controllers via MQTT.

## Architecture

```
Mobile / Web  ──HTTPS + JWT──▶  Express API  ──MQTT──▶  Controller
                                     │
                               PostgreSQL (Prisma)
```

See [cloud-api-architecture.md](../docs/design/cloud-api-architecture.md) for full design.

## Prerequisites

- Node.js 18+
- Docker Desktop (for local Postgres + Mosquitto)
- Auth0 tenant (shared with mobile app)

## Quick Start

```bash
# 1. Start Docker services (Postgres + MQTT broker)
docker compose up -d

# 2. Copy env file and configure
cp .env.example .env
# .env.example already has correct local dev values — no changes needed for local dev

# 3. Run database migrations
npm run db:migrate

# 4. Start dev server (hot reload)
npm run dev
```

Server listens on **http://localhost:3000**.

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `DATABASE_URL` | Postgres connection string | `postgresql://azul:azul@localhost:5432/azul` |
| `MQTT_URL` | MQTT broker URL | `mqtt://localhost:1883` |
| `PORT` | HTTP port | `3000` |
| `AUTH0_DOMAIN` | Auth0 tenant domain | `dev-cgrr5v7lsr3wbpcj.us.auth0.com` |
| `AUTH0_AUDIENCE` | Auth0 API audience | `https://api.azul` |

## API Endpoints

All `/api/*` endpoints require a valid Auth0 JWT: `Authorization: Bearer <token>`

### Devices
```
GET    /api/devices                           List authenticated user's controllers
POST   /api/devices/claim                     Register device after BLE adoption
GET    /api/devices/:mac                      Get device with zones + schedules
PATCH  /api/devices/:mac                      Update device name
DELETE /api/devices/:mac                      Unclaim device
GET    /api/devices/:mac/stream               SSE real-time status stream
PUT    /api/devices/:mac/org                  Assign device to landscaper org
DELETE /api/devices/:mac/org                  Remove device from org
```

### Zones
```
GET    /api/devices/:mac/zones                List zones (numbers + names)
PUT    /api/devices/:mac/zones/:n             Rename zone
POST   /api/devices/:mac/zones/:n/start       Start zone via MQTT  { duration: seconds }
POST   /api/devices/:mac/zones/:n/stop        Stop zone via MQTT
POST   /api/devices/:mac/zones/stop-all       Stop all zones via MQTT
```

### Schedules
```
GET    /api/devices/:mac/schedules            List all schedules
POST   /api/devices/:mac/schedules            Create schedule + push to device via MQTT
GET    /api/devices/:mac/schedules/active     Get currently active schedule
GET    /api/devices/:mac/schedules/:uuid      Get single schedule
PUT    /api/devices/:mac/schedules/:uuid      Update schedule + push to device
DELETE /api/devices/:mac/schedules/:uuid      Delete schedule + push to device
POST   /api/devices/:mac/schedules/:uuid/activate  Activate schedule via MQTT
DELETE /api/devices/:mac/schedules/active     Deactivate active schedule via MQTT
```

### Audit Log
```
GET    /api/devices/:mac/log?limit=50&offset=0   Zone run history (newest first)
```

### Organizations (Landscaper/Multi-tenant)
```
GET    /api/orgs                              List orgs the user belongs to
POST   /api/orgs                              Create a new org  { name, slug }
GET    /api/orgs/:orgId                       Org detail + member list
POST   /api/orgs/:orgId/members               Invite member by userId + role
DELETE /api/orgs/:orgId/members/:userId       Remove member
```

### Health
```
GET    /health                                Server health check (no auth required)
```

## Device Claiming Flow

After a controller is adopted via BLE in the mobile app, the app calls:

```bash
POST /api/devices/claim
Authorization: Bearer <token>
{ "mac": "E8:F6:0A:85:4C:90", "name": "Front Yard" }
```

This associates the Auth0 user with the device MAC and auto-creates 8 zone records.
If the controller has already sent MQTT status messages, it's promoted from `pending_devices` to `devices` atomically.

## MQTT Protocol

| Direction | Topic | Payload |
|---|---|---|
| Controller → Cloud | `azul/{mac}/status` | Status JSON (60s heartbeat) |
| Controller → Cloud | `azul/{mac}/events` | `{ type, zone, duration, source, ts }` |
| Cloud → Controller | `azul/{mac}/cmd/zone/start` | `{ zone, duration }` |
| Cloud → Controller | `azul/{mac}/cmd/zone/stop` | `{ zone }` |
| Cloud → Controller | `azul/{mac}/cmd/zone/stop-all` | `{}` |
| Cloud → Controller | `azul/{mac}/cmd/schedule/set` | Full schedule JSON |
| Cloud → Controller | `azul/{mac}/cmd/schedule/activate` | `{ uuid }` |
| Cloud → Controller | `azul/{mac}/cmd/schedule/deactivate` | `{}` |
| Cloud → Controller | `azul/{mac}/cmd/schedule/delete` | `{ uuid }` |
| Cloud → Controller | `azul/{mac}/cmd/time/set` | `{ tz_offset, tz_name }` |

## Database Commands

```bash
npm run db:migrate    # Apply pending migrations (requires Docker running)
npm run db:studio     # Open Prisma Studio — visual database browser
npm run db:generate   # Regenerate Prisma client after schema changes
```

## Testing the API

Create a **Machine to Machine** application in the Auth0 dashboard, authorize it for `https://api.azul`, then:

```bash
# Get a token
TOKEN=$(curl -s -X POST https://dev-cgrr5v7lsr3wbpcj.us.auth0.com/oauth/token \
  -H 'content-type: application/json' \
  -d '{"client_id":"<M2M_CLIENT_ID>","client_secret":"<M2M_SECRET>","audience":"https://api.azul","grant_type":"client_credentials"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# List devices
curl http://localhost:3000/api/devices -H "Authorization: Bearer $TOKEN"

# Claim a device
curl -X POST http://localhost:3000/api/devices/claim \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"mac":"E8:F6:0A:85:4C:90","name":"Front Yard"}'

# Stream live status (SSE)
curl -H "Authorization: Bearer $TOKEN" \
     -H "Accept: text/event-stream" \
     http://localhost:3000/api/devices/E8:F6:0A:85:4C:90/stream
```
