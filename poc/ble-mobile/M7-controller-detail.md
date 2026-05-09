# M7 — Controller Detail Screen

**Status:** ⚪ Not started  
**Depends on:** M2, M6  
**Unlocks:** M8, M9, M10, M11, Integration milestones I2, I3

## Goal

The primary screen for a connected controller. Shows live status, zone cards, quick controls, and navigation to all sub-screens.

## File

Create `mobile/app/(app)/controller/[id].tsx`

## On Mount

1. Load `Controller` from store by `id` param.
2. Connect to device via `connect(controller.deviceId)`.
3. Subscribe to `b1` status notifications → update zone running state live.
4. Send `get_status` → populate firmware version and uptime in header.
5. Send `get_zones` → render zone cards.
6. Update `lastSeen` in store on successful connect.

## Layout

```
[ Controller Name ]          [ firmware v0.x.x ]

Zones
┌─────────────────────────────────────────────┐
│ Zone 1 — Front Lawn          IDLE    [▶ Run] │
│ Zone 2 — Back Lawn         RUNNING  10s  [■] │
│ ...                                          │
└─────────────────────────────────────────────┘

[ Stop All ]

─────────────────────────────────────────────
  ⚙ Settings     📅 Schedules    📋 Logs
─────────────────────────────────────────────
```

## Zone Card

- Shows zone name, status (IDLE / RUNNING), remaining runtime if running.
- Run button: prompts for duration (default 5 min, adjustable via a simple stepper or input), then calls `sendCommand('start_zone', {id, duration}, ownerSub)`.
- Stop button (visible when running): calls `sendCommand('stop_zone', {id}, ownerSub)`.

## Quick Controls

- **Stop All** button: calls `sendCommand('stop_all', {}, ownerSub)`. Confirm dialog before sending.

## Navigation Footer

Three nav items: Settings, Schedules, Logs. Each navigates to the corresponding sub-screen passing `id`.

## Connection State

- Show a "Connecting..." overlay on mount until the first `get_status` response arrives.
- Show a "Disconnected" banner if the BLE connection drops. Offer a "Reconnect" button.

## Done When

- [ ] Screen loads and connects to controller
- [ ] Zone cards show correct names and idle/running status
- [ ] Status notifications update running zone in real time
- [ ] Run button starts a zone (visible on controller hardware)
- [ ] Stop button stops a running zone
- [ ] Stop All works
- [ ] Disconnection banner appears if BLE drops
- [ ] Navigation to Settings, Schedules, Logs works
