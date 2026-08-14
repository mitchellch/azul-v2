import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchDevices } from '@/services/cloudApi';

export type ConnectionGrade = 'good' | 'degraded' | 'poor' | 'offline';

type CloudGradeStore = {
  grades: Map<string, ConnectionGrade>; // keyed by controller id
  setGrade: (id: string, grade: ConnectionGrade) => void;
};

export const useCloudGradeStore = create<CloudGradeStore>()((set) => ({
  grades: new Map(),
  setGrade: (id, grade) =>
    set((s) => ({ grades: new Map(s.grades).set(id, grade) })),
}));

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
  skipStopAllConfirm?: boolean;        // user opted out of Stop All confirmation
  skipScheduleStopConfirm?: boolean;   // user opted out of scheduled-zone stop confirmation
};

type ControllerStore = {
  controllers: Controller[];
  addController: (c: Controller) => void;
  updateController: (deviceId: string, patch: Partial<Controller>) => void;
  removeController: (deviceId: string) => void;
  getController: (deviceId: string) => Controller | undefined;
  hydrateFromServer: (ownerSub: string) => Promise<{ added: number; existing: number }>;
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

      hydrateFromServer: async (ownerSub) => {
        const serverDevices = await fetchDevices();
        const localByMac = new Map(
          get().controllers.map((c) => [c.mac ?? c.deviceId, c])
        );
        const toAdd: Controller[] = [];
        for (const d of serverDevices) {
          if (localByMac.has(d.mac)) continue;
          toAdd.push({
            id: d.id,
            deviceId: d.mac, // MAC doubles as BLE deviceId on Android
            name: d.name ?? d.mac,
            ownerSub,
            claimedAt: new Date(d.createdAt).getTime(),
            lastSeen: d.lastSeenAt ? new Date(d.lastSeenAt).getTime() : undefined,
            cloudId: d.id,
            mac: d.mac,
            connectionMode: 'cloud',
          });
        }
        if (toAdd.length > 0) {
          set((s) => ({ controllers: [...s.controllers, ...toAdd] }));
        }
        return { added: toAdd.length, existing: serverDevices.length - toAdd.length };
      },
    }),
    {
      name: 'azul-controllers',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
