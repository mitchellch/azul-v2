# Azul Backend Server

Node.js/TypeScript backend for the Azul irrigation system. Not yet implemented.

## Status (May 2026)

Architecture designed, infrastructure strategy defined. Ready to build when firmware and mobile app foundations are stable.

See [Cloud API Architecture](../docs/design/cloud-api-architecture.md) for full design details.

---

## Technology Stack

| Concern | Development | Production |
|---|---|---|
| Language | TypeScript | TypeScript |
| Runtime | Node.js | Node.js |
| Framework | Express.js | Express.js |
| API | AWS Lambda + API Gateway | AWS Lambda + API Gateway |
| Database | Neon (serverless Postgres, free) | AWS RDS PostgreSQL |
| ORM | Prisma | Prisma |
| MQTT Broker | HiveMQ Cloud (free tier) | AWS IoT Core |
| Auth | Auth0 (existing tenant) | Auth0 |
| IaC | Terraform | Terraform |

---

## Infrastructure Strategy

All infrastructure is managed with Terraform. Spin up for a session, tear down to avoid costs.

### Prerequisites

- AWS CLI configured (`aws configure`)
- Terraform installed (`brew install terraform`)
- Neon account (free) — [neon.tech](https://neon.tech)
- HiveMQ Cloud account (free) — [hivemq.com/cloud](https://www.hivemq.com/cloud/)
- Auth0 tenant already exists: `dev-cgrr5v7lsr3wbpcj.us.auth0.com`

### Planned Directory Structure

```
server/
  infra/
    main.tf           Provider config, shared locals
    lambda.tf         Lambda functions + API Gateway
    database.tf       Neon (dev) or RDS (prod)
    mqtt.tf           HiveMQ (dev) or AWS IoT Core (prod)
    auth.tf           Auth0 Terraform provider
    variables.tf      env = "dev" | "prod"
    outputs.tf        API URL, MQTT endpoint, DB connection string
  src/
    handlers/         Lambda function handlers
    db/               Prisma schema and migrations
    mqtt/             MQTT client and message handlers
  package.json
  tsconfig.json
```

### Usage (when implemented)

```bash
cd server/infra

# Dev stack — Neon + HiveMQ + Lambda (zero cost)
terraform apply -var="env=dev"

# Tear down when done
terraform destroy

# Production stack — RDS + IoT Core
terraform apply -var="env=prod"
```

---

## MQTT Device Protocol

The ESP32 Main Controller communicates with the backend via MQTT.

**Device topic namespace:** `azul/{device_mac}/`

### Device → Cloud

| Topic | Description |
|---|---|
| `azul/{mac}/status` | Full status JSON, published every 60s and on state change |
| `azul/{mac}/events` | Zone start/stop, schedule changes, boot events |
| `azul/{mac}/log` | Audit log entries |

### Cloud → Device

| Topic | Payload | Description |
|---|---|---|
| `azul/{mac}/cmd/zone/start` | `{"zone":1,"duration":60}` | Start a zone |
| `azul/{mac}/cmd/zone/stop` | `{"zone":1}` | Stop a zone |
| `azul/{mac}/cmd/zone/stop-all` | `{}` | Stop all zones |
| `azul/{mac}/cmd/schedule/set` | Schedule JSON | Push schedule to device |
| `azul/{mac}/cmd/schedule/activate` | `{"uuid":"..."}` | Activate a schedule |
| `azul/{mac}/cmd/time/set` | `{"tz_offset":-25200,"tz_name":"..."}` | Set timezone |
| `azul/{mac}/cmd/reboot` | `{}` | Reboot device |

The `{device_mac}` is the ESP32's WiFi MAC address (e.g. `AC:A7:04:26:60:D0`), available via `GET /api/status` on the device.

---

## REST API (planned)

Backend endpoints for mobile and web clients. All require Auth0 JWT.

| Method | Path | Description |
|---|---|---|
| GET | `/api/devices` | List user's controllers |
| GET | `/api/devices/:id` | Device status |
| POST | `/api/devices/:id/zones/:zoneId/start` | Start a zone remotely |
| POST | `/api/devices/:id/zones/stop-all` | Stop all zones |
| GET | `/api/devices/:id/schedules` | List schedules |
| POST | `/api/devices/:id/schedules` | Create and push schedule |
| PUT | `/api/devices/:id/schedules/:id/activate` | Activate a schedule |
| GET | `/api/devices/:id/log` | Audit log |

---

## Implementation Order

1. Terraform dev stack (Neon + HiveMQ + Lambda skeleton)
2. Device registration and status persistence
3. Zone control via MQTT
4. Schedule sync (push to device on connect)
5. Auth0 JWT validation for mobile app calls
6. Audit log aggregation
7. Switch to prod stack when approaching launch

---

## Cost Profile

| Service | Dev | Production (est.) |
|---|---|---|
| Lambda + API Gateway | ~$0 | ~$5-20/mo |
| Database | $0 (Neon free) | ~$15-30/mo (RDS t3.micro) |
| MQTT Broker | $0 (HiveMQ free) | ~$5-15/mo (IoT Core) |
| Auth0 | $0 (free tier) | $0-23/mo |
| **Total** | **$0** | **~$25-70/mo** |
