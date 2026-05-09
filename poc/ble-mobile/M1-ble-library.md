# M1 — Install BLE Library

**Status:** ⚪ Not started  
**Depends on:** Nothing  
**Unlocks:** M2

## Goal

Add `react-native-ble-plx` to the mobile project and configure all required permissions for iOS and Android. After this phase the app builds successfully with BLE capability and no longer runs in Expo Go (requires a development build).

## Steps

### 1. Install

```bash
cd mobile
npx expo install react-native-ble-plx
```

### 2. Configure app.json

Add the plugin entry:

```json
{
  "expo": {
    "plugins": [
      ["react-native-ble-plx", {
        "isBackgroundEnabled": false,
        "modes": ["central"],
        "bluetoothAlwaysPermission": "Allow Azul to connect to your irrigation controller"
      }]
    ]
  }
}
```

### 3. Rebuild

```bash
npx expo run:android
```

The native layer needs a full rebuild after adding a native module — `expo start` alone is not sufficient.

## Permission Notes

The `react-native-ble-plx` plugin handles permission manifest injection automatically via `app.json`. Runtime permission requests are handled in M2 (`services/ble.ts`).

- **iOS:** `NSBluetoothAlwaysUsageDescription` injected by plugin.
- **Android API < 31:** `ACCESS_FINE_LOCATION` required for BLE scan.
- **Android API 31+:** `BLUETOOTH_SCAN` + `BLUETOOTH_CONNECT`. No location required.

## Done When

- [ ] `react-native-ble-plx` in `package.json` dependencies
- [ ] Plugin entry in `app.json`
- [ ] `npx expo run:android` builds without BLE-related native errors
- [ ] App launches on device without crash
