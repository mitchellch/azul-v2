# Web Application Architecture

**Status:** Design — not yet implemented  
**Related:** [cloud-api-architecture.md](cloud-api-architecture.md)

---

## 1. Purpose

The Azul web app gives users browser-based access to everything the mobile app provides, plus additional capabilities suited to larger screens and landscaper workflows. A homeowner can manage their system from a laptop; a landscaper can monitor and manage all client properties from a single dashboard.

The web app is a **pure client** — it has no direct connection to controllers. All operations go through the backend API, which communicates with controllers over MQTT.

---

## 2. Technology Stack

| Concern | Choice | Rationale |
|---|---|---|
| Framework | Next.js (App Router) | TypeScript-native, SSR for auth, API routes for BFF pattern |
| Hosting | Vercel | Zero-config Next.js deployment, preview URLs per PR |
| Auth | Auth0 (`@auth0/nextjs-auth0`) | Same tenant as mobile app, session management built in |
| Styling | Tailwind CSS | Utility-first, consistent with rapid iteration |
| State | React Query (TanStack Query) | Server state, cache invalidation, background refetch |
| Realtime | WebSocket or Server-Sent Events | Live zone status, controller heartbeat |
| Shared types | `@azul/shared` package (already scaffolded) | Single source of truth for Schedule, Zone, etc. |

---

## 3. User Personas and Views

### 3.1. Homeowner

Sees only their own controllers. Primary views:

- **Dashboard** — controller list with live status (zones running, last seen, schedule active/paused)
- **Controller detail** — zone control, schedule management, settings, logs
- **Zone control** — same 2×4 grid as mobile, run/stop individual zones
- **Schedules** — CRUD, activate/deactivate, visual calendar view of upcoming runs
- **Activity log** — filterable audit history
- **Settings** — controller name, WiFi update, timezone/GPS sync (via backend, not BLE)

### 3.2. Landscaper

Everything the homeowner sees, plus:

- **Client list** — all customers in their org with controller status at a glance
- **Client detail** — navigate into any customer's controllers as if it were their own
- **Bulk actions** — pause/resume all schedules across multiple controllers (e.g. before/after rain)
- **Alerts** — controllers that haven't checked in, zones that ran unusually long

### 3.3. Customer (managed by landscaper)

Reduced view:
- See their own controller status (read-only or limited write based on landscaper settings)
- View schedule history
- Cannot modify schedules unless landscaper grants write access

---

## 4. Architecture

### 4.1. Communication Flow

```
Browser ──HTTPS──▶ Next.js (Vercel)
                       │
                       ├──API routes (BFF)──▶ Backend API ──MQTT──▶ Controller
                       │
                       └──WebSocket/SSE──▶ Backend ──MQTT subscribe──▶ live updates
```

The Next.js app uses a **Backend-for-Frontend (BFF)** pattern — API routes in Next.js proxy requests to the backend, attaching the Auth0 session token. This keeps credentials server-side and simplifies CORS.

### 4.2. Realtime Updates

Controller status (zones running, heartbeat) needs to update without polling. Two options:

- **Server-Sent Events (SSE)** — simpler, one-way, works through Vercel's edge network. Preferred.
- **WebSocket** — bidirectional, needed if the browser needs to push updates back in realtime (not required — commands go through REST).

The backend maintains an SSE endpoint per user that pushes controller status updates as the MQTT broker delivers them.

### 4.3. Auth Flow

```
User visits app
  → Next.js checks Auth0 session cookie
  → If none: redirect to Auth0 Universal Login
  → Auth0 redirects back with code
  → Next.js exchanges for tokens, sets encrypted session cookie
  → All API route calls attach access token to backend requests
```

Auth0 handles MFA, social login, and org membership automatically.

---

## 5. Key Differences from Mobile App

| Capability | Mobile | Web |
|---|---|---|
| Zone control | BLE (direct, fast) | MQTT via backend (~1-2s latency) |
| Adopt controller | BLE (PIN confirmation) | Not supported — adoption is physical-proximity only |
| WiFi config | BLE `set_wifi` command | Not supported — requires BLE proximity |
| GPS sync | Phone GPS via expo-location | Not applicable |
| Offline | Works over BLE when no internet | Requires internet |
| Multi-controller | One at a time (per connection) | All controllers on one dashboard |

**Adoption is mobile-only by design.** The physical PIN confirmation is a security feature — you must be next to the device to claim it.

---

## 6. Shared Types

The `@azul/shared` package (already scaffolded in `shared/`) should export:

```typescript
// Types used by both backend API responses and frontend consumption
export type Controller = { id, mac, name, firmware, lastSeen, online }
export type Zone       = { id, zoneNumber, name, status, runtimeSeconds }
export type Schedule   = { id, uuid, name, startDate, endDate, runs }
export type ScheduleRun = { zoneId, dayMask, hour, minute, durationSeconds, intervalDays }
export type AuditEntry  = { ts, zoneId, zoneName, durationSeconds, source }
export type OrgRole     = 'admin' | 'member'
export type AccountType = 'owner' | 'landscaper' | 'customer'
```

The backend API uses these in its response types. The web app imports the same types. The mobile app already has local equivalents — they should be migrated to consume from `@azul/shared` once the package is built out.

---

## 7. Landscaper-Specific Features

### 7.1. Client Portal

Each landscaper org gets a branded subdomain: `{org-slug}.azul.app` (future). For now, a single app with org switching via a dropdown.

### 7.2. Bulk Schedule Management

A landscaper managing 50 residential clients needs to quickly pause all schedules before a rain event. UI: select all (or filtered subset) → Pause Schedules → confirm. Backend: N MQTT publishes, one per controller.

### 7.3. Controller Health Dashboard

Table view of all controllers in the org:

| Controller | Owner | Status | Last seen | Active schedule | Alert |
|---|---|---|---|---|---|
| Smith - Front | J. Smith | Online | 2m ago | Spring | — |
| Jones - Back | M. Jones | Offline | 3h ago | — | ⚠ |

Clicking a row navigates into that controller's detail view.

---

## 8. Implementation Order

1. **Next.js project setup** — Auth0, Tailwind, React Query, TypeScript config
2. **Auth flow** — login/logout, session, org switching
3. **Dashboard** — controller list with live status (SSE)
4. **Controller detail + zone control** — mirrors mobile Manual screen
5. **Schedules** — CRUD via backend API
6. **Activity log**
7. **Landscaper views** — client list, bulk actions, health dashboard
8. **`@azul/shared` migration** — consolidate types used by backend + web + mobile
