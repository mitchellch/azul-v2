# Open Issues

Lightweight backlog. One line per issue where possible. Move to GitHub Issues when a contributor joins or customers start reporting.

**Priority:** `P0` blocks shipping / demo / dev flow · `P1` should fix soon · `P2` nice to have · `P3` someday
**Area:** `firmware` · `server` · `web` · `mobile` · `hardware` · `docs` · `infra`

Format: `- [ ] [P#][area] one-line summary — optional link to details`

---

## Now (this week)

_Empty — the 2026-08-09 debug-session logs and the two uncommitted UI patches were cleaned up on 2026-08-10 (see Done)._

## Next

- [ ] [P2][firmware] OTA `http_failed` early-exit causes controller reboot — `OtaManager::run` just returns on error, but observed reboot (uptime 961→987s) when URL was malformed. Suspect task watchdog or HTTPClient side effect. Reproduce with a garbage URL; investigate before P2 server work.
- [ ] [P1][mobile][web] Zone activation confirmation timeout — UI stays "running" on optimistic update alone; needs pending state + revert on timeout if controller doesn't confirm. See memory: `project_zone_activation_confirmation_timeout.md`
- [ ] [P2][web][mobile] Programs vs Schedules tabs redundancy — decide whether to hide Schedules and auto-activate schedule on first program sync. Blocker: programs live in localStorage, not per-account
- [ ] [P2][infra] Cron `server/scripts/archive-events.ts` to run monthly — currently manual; missing partition kills all `logEvent()` writes with Postgres 23514. See memory: `project_event_log_partitions.md`
- [ ] [P2][mobile] Mobile 401 redirect on expired session — zone badge taps don't force login; partially wired, needs debugging. See memory: `project_mobile_401_redirect.md`

## Later

- [ ] [P2][firmware][server][web] OTA firmware updates (MVP scope) — see `poc/ota/dashboard.md` and `docs/design/ota-implementation-plan.md`
- [ ] [P3][firmware] Seasonal adjust — percentage multiplier to scale run durations by season (Rainbird-style dial). See memory: `project_seasonal_adjust.md`
- [ ] [P3][firmware] Bi-weekly schedule support in ScheduleRun — pending decision. See memory: `project_biweekly_schedule.md`
- [ ] [P3][mobile] Remove temporary colored zone-LED dots on Manual screen — testing-only, remove when asked. See memory: `feedback_zone_led_colors.md`

## Done

- 2026-08-10 [server][mobile] Removed diagnostic `[req]`/`[cloudApi]`/`[tap]` logs from 08-09 zone-start debug session
- 2026-08-10 [web] Committed collapsible Zones panel on controller Settings tab
- 2026-08-10 [mobile] Committed SSE snapshot name-sync in `CloudGradeMonitor.tsx`
- 2026-08-10 [firmware] OTA P1 — A/B partitions, HTTP+SHA-256, first-boot rollback verified on hardware (`f76c47c`)
- 2026-08-10 [server] OTA P2 — FirmwareRelease/DeviceOtaStatus, admin upload, /devices/:mac/ota trigger, MQTT event ingest. End-to-end verified on hardware (`521480a` … `ba6ff39`)

_Move items here with a completion date when closed. Prune to the last ~10 to keep this readable._

---

## Migration criteria

Move to GitHub Issues (or Linear) when any of these becomes true:

1. A second person is contributing code and needs assignment / discussion threads.
2. Customers start reporting bugs and need a way to file them.
3. This file grows past ~50 open items or you catch yourself grep-ing to find something.

Until then, keep it flat, keep it in git, review at start of each session.
