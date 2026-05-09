# M3 — Controller Store

**Status:** ⚪ Not started  
**Depends on:** Nothing (independent)  
**Unlocks:** M5, M6

## Goal

Zustand store that persists the list of adopted controllers across app sessions using `AsyncStorage`.

## File

Create `mobile/store/controllers.ts`

## Types

```ts
export type Controller = {
  id: string;          // UUID generated at adoption time
  deviceId: string;    // BLE device ID (MAC on Android, UUID on iOS)
  name: string;        // user-facing name, defaults to BLE device name
  ownerSub: string;    // Auth0 sub — used as auth_token in BLE commands
  claimedAt: number;   // Unix timestamp ms
  lastSeen?: number;   // Unix timestamp ms of last successful connection
};
```

## Store Shape

```ts
type ControllerStore = {
  controllers: Controller[];
  addController: (c: Controller) => void;
  updateController: (deviceId: string, patch: Partial<Controller>) => void;
  removeController: (deviceId: string) => void;
  getController: (deviceId: string) => Controller | undefined;
};
```

## Persistence

Use Zustand `persist` middleware with `AsyncStorage`:

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { persist, createJSONStorage } from 'zustand/middleware';

export const useControllerStore = create<ControllerStore>()(
  persist(
    (set, get) => ({ ... }),
    {
      name: 'azul-controllers',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
```

## Done When

- [ ] `addController` persists a controller and it survives app restart
- [ ] `removeController` removes from storage
- [ ] `updateController` patches `lastSeen` without losing other fields
- [ ] Store is importable from adoption and home screens
