import { useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { Ctx } from '@/context/ControllerConnection';
import {
  startZone, stopZone, stopAllZones,
  getPrograms, createProgram, updateProgram,
  deleteProgram, activateProgram, deactivateProgram,
  updateZoneName,
} from '@/services/cloudApi';
import type { ProgramPayload } from '@/services/cloudApi';
import { useControllerStore } from '@/store/controllers';
import { controllerStore } from '@/lib/controllerStore';
import { cloudManager, markOptimistic } from '@/lib/cloudManager';

import type { ZoneData, StatusData } from '@/context/ControllerConnection';

type Props = { mac: string; ownerSub: string; children: ReactNode };

export function CloudControllerConnectionProvider({ mac, ownerSub, children }: Props) {
  // Ensure cloud connection is active — reload if not yet connected
  useEffect(() => {
    const state = cloudManager.getState(mac);
    if (!state.connected && !state.connecting) cloudManager.reload(mac);
    else if (state.connected) cloudManager.start(mac);
  }, [mac]);

  // Subscribe to connection state with auto-retry on failure
  const [cloudState, setCloudState] = useState(() => cloudManager.getState(mac));
  useEffect(() => cloudManager.subscribeState(mac, setCloudState), [mac]);
  const retried = useRef(false);
  useEffect(() => {
    if (!cloudState.connected && !cloudState.connecting && !retried.current) {
      retried.current = true;
      const t = setTimeout(() => cloudManager.reload(mac), 2_000);
      return () => clearTimeout(t);
    }
    if (cloudState.connected) retried.current = false;
  }, [cloudState.connected, cloudState.connecting, mac]);

  // Subscribe to status notifications — merge partial updates so fields set
  // by one event source (e.g. latestAvailableFirmware from snapshot) survive
  // events from another source (e.g. firmware version from status).
  const [status, setStatus] = useState<StatusData>({});
  useEffect(() => cloudManager.subscribeStatus(mac, (s) =>
    setStatus(prev => ({ ...prev, ...s }))
  ), [mac]);

  // Subscribe to zone state from the global store
  const [zones, setZonesLocal] = useState<ZoneData[]>(() => controllerStore.get(mac));
  useEffect(() => controllerStore.subscribe(mac, setZonesLocal), [mac]);

  const setZones: React.Dispatch<React.SetStateAction<ZoneData[]>> = (action) => {
    const prev = controllerStore.get(mac);
    const next = typeof action === 'function' ? action(prev) : action;
    controllerStore.setZones(mac, next);
  };

  async function execCommand(cmd: string, data?: object): Promise<unknown> {
    if (!cloudState.connected) throw new Error('Not connected to cloud');
    switch (cmd) {
      case 'start_zone': {
        const d = data as any;
        markOptimistic(mac, d.id);
        await startZone(mac, d.id, d.duration);
        return { ok: true };
      }
      case 'stop_zone': {
        const d = data as any;
        await stopZone(mac, d.id);
        return { ok: true };
      }
      case 'stop_all':
        await stopAllZones(mac);
        return { ok: true };
      case 'get_programs':
        return getPrograms(mac);
      case 'create_program':
        return createProgram(mac, data as ProgramPayload);
      case 'update_program': {
        const d = data as ProgramPayload & { id: string };
        return updateProgram(mac, d.id, d);
      }
      case 'delete_program': {
        const d = data as { id: string };
        await deleteProgram(mac, d.id);
        return { ok: true };
      }
      case 'activate_program': {
        const d = data as { id: string };
        return activateProgram(mac, d.id);
      }
      case 'deactivate_program': {
        const d = data as { id: string };
        return deactivateProgram(mac, d.id);
      }
      case 'update_zone': {
        const d = data as any;
        await updateZoneName(mac, d.id, d.name);
        controllerStore.setZoneName(mac, d.id, d.name);
        return { ok: true };
      }
      default:
        throw new Error(`Command '${cmd}' not supported in cloud mode`);
    }
  }

  return (
    <Ctx.Provider value={{
      connecting: cloudState.connecting,
      connected:  cloudState.connected,
      reconnect:  () => cloudManager.reload(mac),
      zones, status, ownerSub,
      storeKey: mac,
      execCommand, setZones,
    }}>
      {children}
    </Ctx.Provider>
  );
}
