# Schedule Audit Script

## Purpose

Verifies that the firmware scheduler executes zone runs as defined in the active schedule. Compares actual `zone_start` events (recorded in the event log) against expected runs derived from the schedule definition.

This is the primary tool for answering: "Is my controller watering when it's supposed to?"

## Prerequisites

- Server running with event logging active
- At least one device with an active schedule
- Events accumulated over the audit period (events are logged on zone_start and zone_stop)

## Usage

```bash
cd server

# Audit last 7 days (default)
npm run qa:audit -- AC:15:18:D3:7A:BC

# Audit last 14 days
npm run qa:audit -- AC:15:18:D3:7A:BC 14

# Audit last 1 day (quick check)
npm run qa:audit -- AC:15:18:D3:7A:BC 1
```

## Output Sections

### 1. Active Schedule

Shows the schedule name, date range, and all expected runs:

```
Active Schedule: "Summer Lawn"
Date range: 2026-05-15 → 2026-09-30
Runs: 4

Expected runs:
  Zone 1 | 06:00 | 15m | Mon, Wed, Fri
  Zone 2 | 06:15 | 10m | Mon, Wed, Fri
  Zone 3 | 06:25 | 20m | Tue, Thu, Sat
  Zone 4 | 06:45 | 10m | Tue, Thu, Sat
```

### 2. Actual Zone Events

Lists all zone_start and zone_stop events grouped by day:

```
  Mon, May 19:
    ▶ 06:00 Zone 1 started 15m [scheduler]
    ■ 06:15 Zone 1 stopped  [scheduler]
    ▶ 06:15 Zone 2 started 10m [scheduler]
    ■ 06:25 Zone 2 stopped  [scheduler]
```

### 3. Schedule Compliance

Compares expected vs. actual:

```
  Expected runs:  12
  Matched:        11
  Missed:         1
  Manual runs:    2
  Compliance:     91.7%

  ❌ Missed runs:
    Zone 3 @ 06:25 on Thu, May 22

  ℹ️  Manual activations (not from schedule):
    Zone 1 @ 14:30 on Tue, May 20 [manual_rest]
    Zone 5 @ 09:00 on Wed, May 21 [manual_ble]
```

## How Matching Works

- A scheduled run is "matched" if a `zone_start` event exists for the same zone within **5 minutes** of the expected time
- Source must be `scheduler` (manual runs are reported separately)
- `interval_days` is respected (e.g., every-other-day schedules skip correctly)
- The audit window is clamped to the schedule's date range (won't report misses outside the active period)

## Common Results & What They Mean

| Result | Meaning | Action |
|--------|---------|--------|
| 100% compliance | Schedule running perfectly | None |
| Missed runs, device was online | Firmware scheduler bug or timing issue | Check device uptime, NTP sync |
| Missed runs, device was offline | WiFi/power outage | Check connection monitor logs |
| Unexpected manual runs | Someone activated zones manually | Informational only |
| 0 events | Event logging not working or device hasn't run | Verify server is receiving MQTT events |

## Limitations

- Only audits against the **currently active** schedule. If the schedule was changed mid-period, misses may be false positives for the old schedule's runs.
- Requires the server to have been running and receiving MQTT events. If the server was down, events are lost (firmware doesn't queue them).
- Timezone: events are stored in UTC. The schedule's hour/minute are interpreted in the device's configured timezone. The script compares in local server time — ensure server and device share the same timezone assumption.

## Integration with Longevity Testing

Run this script daily during longevity tests (via cron or manually):

```bash
# Cron: run audit every morning at 07:00, append to log
0 7 * * * cd /path/to/server && npm run qa:audit -- AC:15:18:D3:7A:BC 1 >> /tmp/azul-qa.log 2>&1
```

After a week of testing, run with `7` to get the full summary. Target: **100% compliance over 7 consecutive days** before shipping.
