# Azul Product Roadmap

## Priority Legend

- **P0** — Blocking launch
- **P1** — Required for paid tiers
- **P2** — Important but can ship without
- **P3** — Nice to have / future

---

## In Progress

| Item | Priority | Notes |
|------|----------|-------|
| Longevity testing (2 controllers, 2–4 weeks) | P0 | Ordering hardware. QA audit script ready. |

## Up Next

| Item | Priority | Notes |
|------|----------|-------|
| Auth0: enable email/password registration | P0 | Enable "Username-Password-Authentication" DB connection in tenant. No code changes. |
| Auth0: enable Apple sign-in | P0 | Required for iOS App Store if Google is offered (guideline 4.8). Add Social Connection in Auth0 + Apple Developer config. |
| Landscaper device-share flow | P1 | Homeowner invites landscaper by email → landscaper sees device in Pro dashboard. Design schema (`DeviceShare`), API, mobile/web UI. |
| Landscaper access-request flow | P1 | Landscaper requests access by homeowner email/MAC → homeowner approves in-app. Builds on DeviceShare model. |

## Backlog

### Platform / Auth

| Item | Priority | Notes |
|------|----------|-------|
| Passwordless (email magic link) | P2 | Low-friction onboarding for invited landscapers |
| Multi-org support (landscaper manages teams) | P2 | Org model exists in schema but unused |
| Role-based permissions (operator vs viewer) | P1 | Viewer can see status/logs but not activate zones |
| **Customer scoping (User → Customer → Controller)** | **P1** | **Required for landscape business owner target — max ~10 active controllers per customer, hundreds of customers per user. Server: `Customer` model + FK on `Device`, backfilled "My Home" default customer per user, `?customerId=` scope on `/api/devices*` + `/api/devices/stream`. Mobile: `useActiveCustomerStore`, customer picker + persistent indicator, `cloudManager.setActiveCustomer()`. See engram memory #213 and [[bug-real-fix-for-azul-mobile-tapping]].** |

### Mobile

| Item | Priority | Notes |
|------|----------|-------|
| iOS build + TestFlight | P0 | Blocked on Apple sign-in |
| Push notifications (rain skip, errors, schedule complete) | P1 | FCM + APNs via Expo Notifications |
| 401 redirect bug (expired session doesn't force login) | P2 | Partially wired, needs debugging. See memory note. |
| Seasonal adjust (% duration multiplier) | P2 | UI slider, firmware support needed |

### Web

| Item | Priority | Notes |
|------|----------|-------|
| Landscaper dashboard (multi-client view) | P1 | Requires DeviceShare model |
| Event log viewer (beyond activity log) | P2 | Show schedule/config/error events, not just zone runs |
| Weather integration display | P3 | Show forecast on controller page |

### Firmware

| Item | Priority | Notes |
|------|----------|-------|
| Offline event queue (upload missed events on reconnect) | P2 | Covers runs that happened during server outage |
| Daylight saving transition handling | P1 | Test during longevity; fix if broken |
| OTA firmware updates | P1 | ESP32 native OTA via HTTPS |
| Flow sensor support | P2 | Detect stuck valves, measure actual water usage |
| Rain sensor input (skip scheduled runs) | P1 | GPIO interrupt, notify cloud |

### Server / Infrastructure

| Item | Priority | Notes |
|------|----------|-------|
| Production deployment (AWS/Terraform) | P0 | Dev is localhost; need Lambda + RDS + MQTT broker |
| Rate limiting | P1 | Prevent abuse of free tier |
| Webhook notifications (IFTTT, Home Assistant) | P3 | POST to user-configured URL on events |
| Stripe integration (subscriptions) | P1 | Required for paid tiers |

### Hardware

| Item | Priority | Notes |
|------|----------|-------|
| Order 2x ESP32-S3 + SSRs for longevity test | P0 | In progress |
| PCB design (production board) | P2 | Replace breadboard/devkit with integrated board |
| Enclosure design (outdoor rated) | P2 | IP65 minimum for outdoor install |
| 16-zone expansion module | P3 | I2C GPIO expander + additional SSR bank |

---

## Completed (Recent)

| Item | Date | Notes |
|------|------|-------|
| Cloud connection mode (SSE + polling) | 2026-05-11 | Mobile + web |
| Zone photos (upload, badge background, reveal) | 2026-05-19 | Mobile + web |
| Optimistic UI with grace period | 2026-05-19 | 5s window prevents poll override |
| Event log (partitioned, with S3 archival) | 2026-05-21 | All events captured |
| QA schedule audit script | 2026-05-21 | `npm run qa:audit` |
| Web: drag-to-reorder controllers | 2026-05-21 | Persisted in localStorage |
| Web: schedule toggle switch | 2026-05-21 | Matches mobile behavior |
| Pricing model | 2026-05-21 | Free / Home $49 / Pro $199 / Enterprise $999 |
