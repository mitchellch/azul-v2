# M11 — Logs Screen

**Status:** ⚪ Not started  
**Depends on:** M7  
**Unlocks:** Integration milestone I3

## Goal

Display the controller's audit log — which zones ran, when, for how long, and triggered by what.

## File

Create `mobile/app/(app)/controller/[id]/logs.tsx`

## Flow

1. On mount: `sendCommand('get_log', {n: 50}, ownerSub)`.
2. Display flat list of audit entries, most recent first.
3. Each entry: timestamp (local time), zone name, duration, source (Scheduler / REST / BLE / CLI).
4. Pull-to-refresh reloads the log.
5. Empty state: "No activity recorded yet."

## Entry Display

```
Zone 3 — Back Lawn             Thu May 8, 12:00 PM
Ran for 5:00  •  Triggered by Scheduler
```

## Notes

- `AuditEntry.source` is a uint8: 0=Scheduler, 1=REST, 2=BLE, 3=CLI. Map to human-readable strings.
- Timestamps from firmware are UTC epoch seconds. Convert to local time for display using `new Date(ts * 1000).toLocaleString()`.
- Zone names: look up from the last `get_zones` response (cached in component state or a lightweight store). Fall back to "Zone N" if name is unavailable.

## Done When

- [ ] Log entries load and display correctly
- [ ] Timestamps shown in local time
- [ ] Source labels are human-readable
- [ ] Pull-to-refresh works
- [ ] Empty state renders when log is empty
