import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ConnectionMode = 'ble' | 'cloud';

export type Controller = {
  id: string;          // UUID generated at adoption time
  deviceId: string;    // BLE device ID (MAC on Android, UUID on iOS)
  name: string;        // display name, defaults to BLE device name
  ownerSub: string;    // Auth0 sub — used as auth_token in BLE commands
  claimedAt: number;   // Unix timestamp ms
  lastSeen?: number;   // Unix timestamp ms of last successful connection
  paused?: boolean;
  pausedScheduleUuid?: string;
  cloudId?: string;    // Backend Device.id after registering with cloud
  mac?: string;        // Device MAC address (from BLE deviceId on Android)
  connectionMode?: ConnectionMode; // defaults to 'ble' if not set
};

type ControllerStore = {
  controllers: Controller[];
  addController: (c: Controller) => void;
  updateController: (deviceId: string, patch: Partial<Controller>) => void;
  removeController: (deviceId: string) => void;
  getController: (deviceId: string) => Controller | undefined;
};

export const useControllerStore = create<ControllerStore>()(
  persist(
    (set, get) => ({
      controllers: [],

      addController: (c) =>
        set((s) => ({ controllers: [...s.controllers, c] })),

      updateController: (deviceId, patch) =>
        set((s) => ({
          controllers: s.controllers.map((c) =>
            c.deviceId === deviceId ? { ...c, ...patch } : c
          ),
        })),

      removeController: (deviceId) =>
        set((s) => ({
          controllers: s.controllers.filter((c) => c.deviceId !== deviceId),
        })),

      getController: (deviceId) =>
        get().controllers.find((c) => c.deviceId === deviceId),
    }),
    {
      name: 'azul-controllers',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
