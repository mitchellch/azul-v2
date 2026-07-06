# QA & Testing

## Overview

This directory contains QA processes, test plans, and tooling documentation for validating that the Azul system works correctly end-to-end — from schedule definition through firmware execution to cloud event logging.

## Documents

| Document | Purpose |
|----------|---------|
| [schedule-audit.md](schedule-audit.md) | Automated schedule compliance verification |
| [longevity-test-plan.md](longevity-test-plan.md) | Multi-week unattended operation test plan |

## Scripts

All QA scripts live in `server/scripts/`:

| Script | Command | Purpose |
|--------|---------|---------|
| `qa-schedule-audit.ts` | `npm run qa:audit -- <mac> [days]` | Compare actual zone events against active schedule |
| `archive-events.ts` | `npm run archive:events` | Export old event partitions to S3 |

## Test Layers

| Layer | What | How |
|-------|------|-----|
| Firmware unit | Zone queue, scheduler logic, CLI parsing | PlatformIO native tests (`pio test`) |
| Firmware integration | REST API, BLE GATT, MQTT publish | Python pytest against live device |
| Server unit | Connection monitor, schedule serializer | Vitest (`npm test`) |
| Server integration | API endpoints, MQTT handlers | Vitest + test DB |
| Mobile | Navigation, connection, zone control | Manual (Expo on device) |
| Web | Dashboard, schedule editor, zone control | Manual (browser) |
| **End-to-end / QA** | **Schedule runs as intended over days/weeks** | **Event log audit scripts** |
