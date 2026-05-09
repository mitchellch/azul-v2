# @azul/shared

Shared TypeScript types consumed by `mobile/`, `server/`, and any future web client.

## Structure

```
src/
  types/
    device.ts    AccountType, DeviceSummary
    zone.ts      Zone, ZoneStatus, ZoneLiveState
    schedule.ts  Schedule, ScheduleRun
    audit.ts     AuditSource, AuditEntry
    user.ts      User
  index.ts       Re-exports all types
```

## Usage

Install as a local workspace dependency or reference via a `tsconfig.json` path alias.

```json
// tsconfig.json
{
  "paths": {
    "@azul/shared": ["../shared/src/index.ts"]
  }
}
```

## Build

```bash
npm install
npm run build   # outputs to dist/
```
