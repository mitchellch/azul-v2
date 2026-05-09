# M8 — Zone Settings Screen

**Status:** ⚪ Not started  
**Depends on:** M7, F4  
**Unlocks:** Integration milestone I5

## Goal

Allow the user to rename each zone. Names must persist across controller reboots (requires F4).

## File

Create `mobile/app/(app)/controller/[id]/zones.tsx`

## Flow

1. On mount: send `get_zones` — populate the list with current names.
2. Each zone row has an editable text field showing the current name.
3. Save button (per row or a single "Save All" at the bottom).
4. On save: send `sendCommand('update_zone', {id: zoneId, name}, ownerSub)` for each changed zone.
5. Show success/failure feedback per zone.

## Done When

- [ ] Current zone names loaded from controller
- [ ] Name edits sent via `update_zone` command
- [ ] Renamed zones show the new name on the controller detail screen immediately
- [ ] Renamed zones still show the new name after controller reboot (requires F4)
