# M4 — Scan Screen

**Status:** ⚪ Not started  
**Depends on:** M2  
**Unlocks:** M5

## Goal

Screen that discovers nearby Azul controllers over BLE and lets the user select one to adopt.

## File

Create `mobile/app/(app)/scan.tsx`

## Flow

1. On mount: call `requestPermissions()`. If denied, show explanation and a "Open Settings" button.
2. If permissions granted: immediately start `scanForControllers()`.
3. Show a "Scanning..." indicator while scan is running.
4. Discovered devices appear in a list as they are found. Show device name and RSSI signal strength.
5. Stop scan automatically after 15s (or when user taps a device).
6. Tapping a device navigates to `adopt.tsx` passing the `device` via router params (or a module-level ref in the BLE service).
7. "Scan Again" button restarts the scan if the list is empty or the user wants to refresh.

## State

```ts
const [scanning, setScanning] = useState(false);
const [devices, setDevices] = useState<Device[]>([]);
const [permissionDenied, setPermissionDenied] = useState(false);
```

## Navigation

Reached from the "+" button on the home screen header. Navigated away from automatically on device tap.

## Done When

- [ ] Permission denied state shows helpful message
- [ ] Scan finds the Azul controller by name and service UUID
- [ ] List updates live as devices are found
- [ ] Tapping a device navigates to adopt screen
- [ ] Scan stops cleanly when screen unmounts
