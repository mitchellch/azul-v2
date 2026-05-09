# M9 — Settings Screen

**Status:** ⚪ Not started  
**Depends on:** M7  
**Unlocks:** Nothing (leaf screen)

## Goal

Allow the user to sync the controller's clock and timezone from the mobile device.

## File

Create `mobile/app/(app)/controller/[id]/settings.tsx`

## Sections

### Time Sync

- Display the controller's current time and timezone (from `get_time` response).
- "Sync to Phone" button: reads the phone's current time and IANA timezone, sends `set_time`.

```ts
const tz = Intl.DateTimeFormat().resolvedOptions().timeZone; // e.g. "America/Los_Angeles"
const offset = -new Date().getTimezoneOffset() * 60;         // seconds, e.g. -25200
const epoch = Math.floor(Date.now() / 1000);

sendCommand(device, 'set_time', {
  epoch,
  tz_offset: offset,
  tz_dst: 0,
  tz_name: tz,
}, ownerSub);
```

### Device Info

Display-only section showing firmware version, build date, MAC address — from `get_device_info` response.

## Done When

- [ ] Current controller time and timezone displayed
- [ ] "Sync to Phone" sets correct time and timezone on controller
- [ ] Device info section populates correctly
