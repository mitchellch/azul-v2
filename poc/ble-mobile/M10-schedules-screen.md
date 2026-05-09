# M10 — Schedules Screen

**Status:** ⚪ Not started  
**Depends on:** M7, F3  
**Unlocks:** Integration milestone I4

## Goal

Full schedule management — list, create, edit, delete, activate, deactivate — all over BLE.

## File

Create `mobile/app/(app)/controller/[id]/schedules.tsx`  
(May need a sub-screen for schedule edit: `mobile/app/(app)/controller/[id]/schedule-edit.tsx`)

## Flow

### List View

1. On mount: `sendCommand('get_schedules', {}, ownerSub)` — show list of schedules.
2. Each row: schedule name, date range, active indicator.
3. Active schedule shown with a highlighted badge.
4. Swipe-to-delete: `delete_schedule`. Confirm before sending.
5. Tap to edit: navigate to edit screen.
6. Activate/deactivate toggle: `activate_schedule` / `deactivate_schedule`.
7. "+" button: navigate to edit screen with no schedule (create mode).

### Edit / Create View

Fields matching the `Schedule` struct:
- Name (text input)
- Start date / End date (date pickers; "open-ended" toggle for no end date)
- Runs list:
  - Zone selector (1–8)
  - Day-of-week checkboxes (Su Mo Tu We Th Fr Sa)
  - Time picker (hour + minute)
  - Duration (mm:ss input or stepper)
  - Add / remove run buttons

Save: `create_schedule` (POST) or `update_schedule` (PUT).

## Notes

- Schedule JSON can be large (24 runs × 5 schedules). Use 15s timeout for `get_schedules`.
- The day mask is a bitmask: bit 0 = Sunday, bit 6 = Saturday. Build it from the checkbox state.
- Show a "days" preview string (e.g. "Mo We Fr") below the checkboxes as the user selects.

## Done When

- [ ] Schedule list loads and displays correctly
- [ ] Active schedule highlighted
- [ ] Create a new schedule and verify it appears in the list
- [ ] Edit an existing schedule and verify changes persist
- [ ] Delete a schedule
- [ ] Activate and deactivate a schedule
- [ ] Created schedule fires at the correct time on the controller (integration check)
