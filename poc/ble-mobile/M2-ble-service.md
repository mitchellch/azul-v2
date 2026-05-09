# M2 — BLE Service Layer

**Status:** ⚪ Not started  
**Depends on:** M1  
**Unlocks:** M4, M5, M7 and all subsequent mobile phases

## Goal

A clean TypeScript abstraction over `react-native-ble-plx` that hides all BLE complexity from the rest of the app. All screens interact with this service — none import from `react-native-ble-plx` directly.

## File

Create `mobile/services/ble.ts`

## UUID Constants

```ts
export const BLE_SERVICE_UUID     = '12345678-1234-1234-1234-1234567890ab';
export const BLE_CHAR_STATUS      = '12345678-1234-1234-1234-1234567890b1';
export const BLE_CHAR_COMMAND     = '12345678-1234-1234-1234-1234567890b2';
export const BLE_CHAR_ZONE_DATA   = '12345678-1234-1234-1234-1234567890b3';
export const BLE_CHAR_RESPONSE    = '12345678-1234-1234-1234-1234567890b4';
export const BLE_CHAR_PROVISION   = '12345678-1234-1234-1234-1234567890b5';
```

## Public API

```ts
// Permissions
requestPermissions(): Promise<boolean>

// Scanning
scanForControllers(
  onFound: (device: Device) => void,
  timeoutMs?: number           // default 10000
): void
stopScan(): void

// Connection
connect(deviceId: string): Promise<Device>
disconnect(device: Device): Promise<void>

// Commands
sendCommand(
  device: Device,
  cmd: string,
  data?: object,
  authToken?: string
): Promise<unknown>

// Provisioning helpers
readPin(device: Device): Promise<string>

// Status notifications
subscribeToStatus(
  device: Device,
  onStatus: (status: object) => void
): Subscription   // call .remove() to unsubscribe
```

## sendCommand Implementation

```
1. If a command is already in flight, enqueue this one (FIFO queue, Promise-based)
2. Generate requestId = uuid()
3. Subscribe to notifications on BLE_CHAR_RESPONSE (if not already subscribed)
4. Encode request: JSON.stringify({id: requestId, cmd, data, auth_token: authToken})
5. Write encoded string to BLE_CHAR_COMMAND (writeWithResponse)
6. Start timeout timer (10s default, 15s for get_schedules / create_schedule / update_schedule)
7. On each notification:
   a. Base64-decode the value
   b. Parse the chunk envelope: {id, seq, done, d}
   c. If id != requestId: discard (stale response from a previous command)
   d. Append d to chunks array
   e. If done: concatenate chunks, parse as JSON, resolve promise, clear timer
8. On timeout: reject promise with TimeoutError
```

## Chunk Reassembly State

```ts
type PendingRequest = {
  id: string;
  chunks: string[];
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

const pending = new Map<string, PendingRequest>();
```

## Reconnect Handling

After every successful `connect()`:
1. Call `device.discoverAllServicesAndCharacteristics()`
2. Re-subscribe to `BLE_CHAR_RESPONSE` notifications (store subscription in module state)
3. Re-subscribe to `BLE_CHAR_STATUS` notifications if a status callback is registered

## Permissions Helper

```ts
import { Platform, PermissionsAndroid } from 'react-native';

async function requestPermissions(): Promise<boolean> {
  if (Platform.OS === 'android') {
    if (Platform.Version >= 31) {
      const results = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      ]);
      return Object.values(results).every(r => r === 'granted');
    } else {
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
      );
      return result === 'granted';
    }
  }
  return true; // iOS handled by system prompt on first use
}
```

## BleManager Singleton

```ts
import { BleManager } from 'react-native-ble-plx';
const manager = new BleManager();
```

Instantiate once at module load. Do not create multiple instances.

## Done When

- [ ] `requestPermissions()` returns true on Android device
- [ ] `scanForControllers()` finds the controller (filter by service UUID)
- [ ] `connect()` connects and discovers characteristics
- [ ] `readPin()` returns the 6-digit PIN string
- [ ] `sendCommand('get_device_info')` returns firmware info
- [ ] `sendCommand('get_schedules', ...)` reassembles chunked response correctly
- [ ] Disconnecting and reconnecting re-subscribes to notifications correctly
- [ ] Command queue serializes concurrent calls correctly
