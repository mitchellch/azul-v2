# @azul/shared

Shared TypeScript types and constants used by `mobile/` and `server/`.

## Structure

```
src/
  types/
    controller.ts   Controller, ControllerType, ControllerStatus
    zone.ts         Zone, ZoneStatus
    schedule.ts     Schedule, ScheduleRun, DayOfWeek, ScheduleFrequency
  index.ts          Re-exports all types
```

## Usage

From `mobile/` or `server/`, reference this package as `@azul/shared`. Wire it up via
a path alias in `tsconfig.json` or as a local workspace dependency.
