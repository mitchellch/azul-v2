import { useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { Ctx } from '@/context/ControllerConnection';
import { getDeviceZones, getDeviceStatus, startZone, stopZone, stopAllZones } from '@/services/cloudApi';

import type { ZoneData, StatusData } from '@/context/ControllerConnection';

type Props = { mac: string; ownerSub: string; children: ReactNode };

const POLL_INTERVAL_MS = 5_000;

export function CloudControllerConnectionProvider({ mac, ownerSub, children }: Props) {
  const [connecting, setConnecting] = useState(true);
  const [connected,  setConnected]  = useState(false);
  const [zones,      setZones]      = useState<ZoneData[]>([]);
  const [status,     setStatus]     = useState<StatusData>({});

  const unmounted = useRef(false);
  const tickRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef   = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    load();
    return () => {
      unmounted.current = true;
      if (tickRef.current)  clearInterval(tickRef.current);
      if (pollRef.current)  clearInterval(pollRef.current);
    };
  }, []);

  async function load() {
    if (unmounted.current) return;
    setConnecting(true);
    try {
      const [zonesData, deviceData] = await Promise.all([
        getDeviceZones(mac),
        getDeviceStatus(mac),
      ]);
      if (unmounted.current) return;

      const d = deviceData as any;
      setStatus({ firmware: d.firmware, uptime_seconds: d.uptime_seconds, zones_running: d.zones_running });

      const mapped = (zonesData as any[]).map(z => ({
        id:             z.number,
        name:           z.name ?? `Zone ${z.number}`,
        status:         'idle' as const,
        runtime_seconds: 0,
      }));
      setZones(mapped);
      setConnected(true);

      // Start 1s countdown tick
      tickRef.current = setInterval(() => {
        setZones(prev => prev.map(z =>
          z.status === 'running' && z.runtime_seconds > 0
            ? { ...z, runtime_seconds: z.runtime_seconds - 1 }
            : z
        ));
      }, 1000);

      // Poll zone status every 5s via SSE-less backend
      pollRef.current = setInterval(() => pollStatus(), POLL_INTERVAL_MS);

    } catch {
      if (!unmounted.current) setConnected(false);
    } finally {
      if (!unmounted.current) setConnecting(false);
    }
  }

  async function pollStatus() {
    if (unmounted.current) return;
    try {
      const deviceData = await getDeviceStatus(mac);
      if (unmounted.current) return;
      const d = deviceData as any;
      setStatus({ firmware: d.firmware, uptime_seconds: d.uptime_seconds, zones_running: d.zones_running });
      // Update zone statuses from SSE-less snapshot if zones embedded
      if (Array.isArray(d.zones)) {
        setZones(prev => prev.map(z => {
          const u = (d.zones as any[]).find((x: any) => x.number === z.id);
          if (!u) return z;
          if (z.status === 'pending' && u.status === 'idle') return z;
          return { ...z, status: u.status ?? 'idle', runtime_seconds: u.runtime_seconds ?? 0 };
        }));
      }
    } catch { /* silently — we'll retry next poll */ }
  }

  async function execCommand(cmd: string, data?: object): Promise<unknown> {
    if (!connected) throw new Error('Not connected to cloud');
    switch (cmd) {
      case 'start_zone': {
        const d = data as any;
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
      default:
        throw new Error(`Command '${cmd}' not supported in cloud mode`);
    }
  }

  return (
    <Ctx.Provider value={{
      connecting, connected, reconnect: load,
      zones, status, ownerSub,
      execCommand, setZones,
    }}>
      {children}
    </Ctx.Provider>
  );
}
