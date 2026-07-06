# Longevity Test Plan

## Objective

Validate that Azul controllers operate reliably over extended periods (2–4 weeks) without intervention. Specifically:

1. Schedules execute on time, every time
2. No memory leaks or crashes (uptime matches wall-clock time)
3. WiFi/MQTT reconnects gracefully after transient outages
4. Cloud event logging captures all events without gaps
5. Web and mobile dashboards reflect ground truth

## Test Hardware

| Unit | MAC | Location | Zones | Purpose |
|------|-----|----------|-------|---------|
| Controller A | TBD | Indoor bench | 8 (LEDs, no valves) | Schedule accuracy, memory stability |
| Controller B | TBD | Outdoor (garage) | 4 (AC solenoids) | Real-world conditions, thermal cycling |

## Test Schedule Configuration

Each controller gets a schedule that exercises:
- Multiple zones per day
- Different days of the week (day_mask variety)
- Short runs (1 min) and long runs (15 min)
- Overlap/sequencing (Zone 2 starts when Zone 1 finishes)

### Controller A — "Stress Schedule"

| Zone | Time | Duration | Days | Notes |
|------|------|----------|------|-------|
| 1 | 06:00 | 5m | Daily | Morning run |
| 2 | 06:05 | 3m | Daily | Queued behind Zone 1 |
| 3 | 12:00 | 1m | Mon, Wed, Fri | Midday quick run |
| 4 | 18:00 | 10m | Tue, Thu | Evening long run |
| 5 | 18:10 | 5m | Tue, Thu | Queued behind Zone 4 |
| 6 | 00:00 | 2m | Daily | Midnight (timezone edge case) |
| 7 | 23:58 | 3m | Daily | Crosses midnight boundary |
| 8 | 06:00 | 5m | Sat, Sun | Same time as Zone 1 (queue test) |

### Controller B — "Production-like"

| Zone | Time | Duration | Days | Notes |
|------|------|----------|------|-------|
| 1 | 05:30 | 15m | Mon, Wed, Fri, Sun | Front lawn |
| 2 | 05:45 | 10m | Mon, Wed, Fri, Sun | Back lawn |
| 3 | 06:00 | 8m | Tue, Thu, Sat | Garden beds |
| 4 | 06:08 | 5m | Tue, Thu, Sat | Drip line |

## Success Criteria

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Schedule compliance | 100% over 14 days | `npm run qa:audit -- <mac> 14` |
| Uptime | No resets (uptime ≥ 14 days) | `GET /api/devices/:mac` → `uptime_seconds` |
| Memory stability | Free RAM within ±5% of boot value | CLI `status` → `ram_free` daily |
| MQTT reconnects | All transient disconnects recover <60s | Connection monitor logs |
| Event log completeness | Zero gaps (every scheduled start has a matching event) | QA audit script |
| Temperature stability | Operating temp <70°C sustained | CLI `status` → `temperature_c` |

## Test Procedure

### Setup (Day 0)

1. Flash both controllers with latest firmware
2. Configure WiFi (`wifi-set`)
3. Register with cloud (`POST /api/devices/claim`)
4. Create and activate test schedule via mobile app
5. Verify first scheduled run fires correctly
6. Record baseline: uptime, RAM, temperature

### Daily Checks (automated)

```bash
# Add to crontab:
# Run audit at 07:00 daily
0 7 * * * cd /path/to/server && npm run qa:audit -- <MAC_A> 1 >> /tmp/azul-qa-A.log 2>&1
0 7 * * * cd /path/to/server && npm run qa:audit -- <MAC_B> 1 >> /tmp/azul-qa-B.log 2>&1
```

### Weekly Checks (manual)

- [ ] Run full 7-day audit: `npm run qa:audit -- <mac> 7`
- [ ] Check device uptime hasn't reset (firmware page or CLI `status`)
- [ ] Compare current RAM to baseline (should be stable)
- [ ] Review connection monitor for any offline periods
- [ ] Spot-check one scheduled run against physical valve state (Controller B)

### Chaos Tests (Week 2)

Introduce controlled failures and verify recovery:

| Test | Method | Expected Result |
|------|--------|-----------------|
| WiFi outage (5 min) | Unplug router | Reconnects, resumes schedule, no missed runs after reconnect |
| WiFi outage (1 hour) | Unplug router | Reconnects, runs scheduled during outage are skipped (not queued retroactively) |
| Server restart | `docker restart azul-server` | SSE reconnects, no data loss |
| Power cycle | Unplug controller | Reboots, NTP syncs, next scheduled run fires on time |
| Clock drift | Disable NTP, wait 24h | Runs drift with clock; re-enable NTP, runs snap back |

### End of Test (Day 14 or 28)

- [ ] Run full-period audit: `npm run qa:audit -- <mac> 14`
- [ ] Export event log for archival: `npm run archive:events`
- [ ] Document any issues found in `docs/qa/results/`
- [ ] File bugs for any compliance < 100%

## Known Risks

| Risk | Mitigation |
|------|-----------|
| NTP sync failure causes schedule drift | TimeManager retries every 15 min; alert if drift >30s |
| ESP32 memory fragmentation over time | Monitor free heap daily; investigate if <50% of boot value |
| MQTT broker quota (HiveMQ free tier) | Free tier = 100 connections, 10GB/month. Two devices well within limits |
| Daylight saving transition | Not yet implemented — document behavior, fix if broken |
| Power brownout corrupts NVS | NVS integrity check on boot; factory-reset if corrupt |

## Results Archive

After each test round, save results to `docs/qa/results/`:

```
docs/qa/results/
  2026-05-round1/
    controller-a-audit.txt
    controller-b-audit.txt
    issues.md
```
