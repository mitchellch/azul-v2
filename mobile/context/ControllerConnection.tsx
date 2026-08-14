import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useControllerStore } from '@/store/controllers';
import { controllerStore } from '@/lib/controllerStore';
import { bleManager } from '@/lib/bleManager';

export type ZoneData = {
  id: number;
  name: string;
  status: 'idle' | 'running' | 'pending';
  runtime_seconds: number;
  source?: 'scheduler' | 'manual';  // only present when running; absent = manual
  photoUrl?: string | null;
};

export type LatestAvailableFirmware = {
  version:      string;
  sha256:       string;
  size:         number;
  releaseNotes: string | null;
  createdAt:    string;
};

export type StatusData = {
  firmware?: string;
  uptime_seconds?: number;
  zones_running?: boolean;
  latestAvailableFirmware?: LatestAvailableFirmware | null;
};

type ControllerConnectionContext = {
  connecting: boolean;
  connected:  boolean;
  reconnect:  () => void;
  zones:      ZoneData[];
  status:     StatusData;
  ownerSub:   string;
  storeKey:   string;  // always mac — same key for both BLE and cloud
  execCommand: (cmd: string, data?: object) => Promise<unknown>;
  setZones:    React.Dispatch<React.SetStateAction<ZoneData[]>>;
};

export const Ctx = createContext<ControllerConnectionContext | null>(null);

export function useControllerConnection() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useControllerConnection must be used inside ControllerConnectionProvider');
  return ctx;
}

type Props = { controllerId: string; ownerSub: string; children: ReactNode };

export function ControllerConnectionProvider({ controllerId, ownerSub, children }: Props) {
  const ctrl = useControllerStore(s => s.controllers.find(c => c.id === controllerId));
  const mac  = ctrl?.mac ?? ctrl?.deviceId ?? '';

  useEffect(() => {
    if (!mac) return;
    bleManager.start(mac, ctrl!.deviceId, ownerSub);
  }, [mac, ownerSub]);

  const [bleState, setBleState] = useState(() => bleManager.getState(mac));
  useEffect(() => bleManager.subscribeState(mac, setBleState), [mac]);

  const [status, setStatus] = useState<StatusData>({});
  useEffect(() => bleManager.subscribeStatus(mac, setStatus), [mac]);

  const [zones, setZonesLocal] = useState<ZoneData[]>(() => controllerStore.get(mac));
  useEffect(() => controllerStore.subscribe(mac, setZonesLocal), [mac]);

  const setZones: React.Dispatch<React.SetStateAction<ZoneData[]>> = (action) => {
    const prev = controllerStore.get(mac);
    const next = typeof action === 'function' ? action(prev) : action;
    controllerStore.setZones(mac, next);
  };

  return (
    <Ctx.Provider value={{
      connecting: bleState.connecting,
      connected:  bleState.connected,
      reconnect:  () => bleManager.reconnect(mac),
      zones, status, ownerSub,
      storeKey:   mac,
      execCommand: (cmd, data) => bleManager.execCommand(mac, cmd, data),
      setZones,
    }}>
      {children}
    </Ctx.Provider>
  );
}
