import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { Device, Subscription } from 'react-native-ble-plx';
import { connect, disconnect, sendCommand, subscribeToStatus, subscribeToZoneData } from '@/services/ble';
import { useControllerStore } from '@/store/controllers';

export type ZoneData = {
  id: number;
  name: string;
  status: 'idle' | 'running' | 'pending';
  runtime_seconds: number;
};

export type StatusData = {
  firmware?: string;
  uptime_seconds?: number;
  zones_running?: boolean;
};

type ControllerConnectionContext = {
  connecting: boolean;
  connected: boolean;
  reconnect: () => void;
  zones: ZoneData[];
  status: StatusData;
  ownerSub: string;
  execCommand: (cmd: string, data?: object) => Promise<unknown>;
  setZones: React.Dispatch<React.SetStateAction<ZoneData[]>>;
};

const Ctx = createContext<ControllerConnectionContext | null>(null);

export function useControllerConnection() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useControllerConnection must be used inside ControllerConnectionProvider');
  return ctx;
}

type Props = { controllerId: string; ownerSub: string; children: ReactNode };

const MAX_RETRIES    = 5;
const RETRY_DELAY_MS = 3000;

export function ControllerConnectionProvider({ controllerId, ownerSub, children }: Props) {
  const { updateController } = useControllerStore();
  const ctrl = useControllerStore(s => s.controllers.find(c => c.id === controllerId));

  const [connecting, setConnecting] = useState(true);
  const [connected,  setConnected]  = useState(false);
  const [zones, setZones]           = useState<ZoneData[]>([]);
  const [status, setStatus]         = useState<StatusData>({});

  const deviceRef    = useRef<Device | null>(null);
  const connectedRef = useRef(false);          // always-fresh mirror of connected state
  const statusSub    = useRef<Subscription | null>(null);
  const zoneDataSub  = useRef<Subscription | null>(null);
  const tickRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCount   = useRef(0);
  const unmounted    = useRef(false);

  useEffect(() => {
    if (!ctrl) return;
    doConnect();
    return () => {
      unmounted.current = true;
      cleanup();
    };
  }, []);

  function cleanup() {
    statusSub.current?.remove();
    zoneDataSub.current?.remove();
    if (tickRef.current)  clearInterval(tickRef.current);
    if (retryRef.current) clearTimeout(retryRef.current);
    deviceRef.current && disconnect(deviceRef.current).catch(() => {});
    deviceRef.current = null;
  }

  function scheduleRetry() {
    if (unmounted.current) return;
    if (retryCount.current >= MAX_RETRIES) return;
    retryCount.current++;
    retryRef.current = setTimeout(() => {
      if (!unmounted.current) doConnect();
    }, RETRY_DELAY_MS);
  }

  async function doConnect() {
    if (!ctrl || unmounted.current) return;
    // Clean up any previous connection attempt
    statusSub.current?.remove();
    zoneDataSub.current?.remove();
    if (retryRef.current) clearTimeout(retryRef.current);

    try {
      setConnecting(true);
      connectedRef.current = false; setConnected(false);

      const device = await connect(ctrl.deviceId);
      if (unmounted.current) { disconnect(device).catch(() => {}); return; }

      deviceRef.current = device;
      retryCount.current = 0;
      updateController(ctrl.deviceId, { lastSeen: Date.now() });

      statusSub.current = subscribeToStatus(device, (s: any) => {
        if (!unmounted.current) setStatus(s);
      });

      zoneDataSub.current = subscribeToZoneData(device, (zoneArr: any[]) => {
        if (unmounted.current) return;
        connectedRef.current = true; setConnected(true);
        setZones(prev => prev.map(z => {
          const update = zoneArr.find((u: any) => u.id === z.id);
          if (!update) return z;
          if (z.status === 'pending' && update.status === 'idle') return z;
          return { ...z, status: update.status, runtime_seconds: update.runtime_seconds };
        }));
      });

      const [statusData, zonesData] = await Promise.all([
        sendCommand(device, 'get_status', undefined, ownerSub),
        sendCommand(device, 'get_zones',  undefined, ownerSub),
      ]);
      if (unmounted.current) return;
      // Mark connected as soon as commands succeed — don't wait for next b3 notify
      connectedRef.current = true; setConnected(true);
      setStatus(statusData as StatusData);
      setZones(zonesData as ZoneData[]);

      device.onDisconnected(() => {
        if (unmounted.current) return;
        connectedRef.current = false; setConnected(false);
        scheduleRetry();
      });

      if (tickRef.current) clearInterval(tickRef.current);
      tickRef.current = setInterval(() => {
        setZones(prev => prev.map(z =>
          z.status === 'running' && z.runtime_seconds > 0
            ? { ...z, runtime_seconds: z.runtime_seconds - 1 }
            : z
        ));
      }, 1000);

      setConnecting(false);
      connectedRef.current = true; setConnected(true);
    } catch {
      if (unmounted.current) return;
      setConnecting(false);
      connectedRef.current = false; setConnected(false);
      scheduleRetry();
    }
  }

  async function execCommand(cmd: string, data?: object): Promise<unknown> {
    // If not connected, trigger an immediate reconnect and wait up to 12s
    if (!connectedRef.current) {
      console.log(`[BLE ctx] execCommand(${cmd}) — not connected, triggering reconnect`);
      retryCount.current = 0; // reset cap so doConnect is allowed
      doConnect();             // kick off reconnect immediately (fire-and-forget)
      await new Promise<void>((resolve, reject) => {
        const start = Date.now();
        const check = setInterval(() => {
          console.log(`[BLE ctx] waiting for connection... connectedRef=${connectedRef.current} elapsed=${Date.now()-start}ms`);
          if (connectedRef.current) {
            clearInterval(check);
            console.log(`[BLE ctx] connected, proceeding with ${cmd}`);
            resolve();
          } else if (Date.now() - start > 12_000) {
            clearInterval(check);
            reject(new Error('Could not connect to controller. Please try again.'));
          }
        }, 250);
      });
    }
    if (!deviceRef.current) throw new Error('Controller is not connected.');
    try {
      return await sendCommand(deviceRef.current, cmd, data, ownerSub);
    } catch (e: any) {
      const msg: string = e?.message ?? '';
      if (msg.includes('write failed') || msg.includes('not connected') || msg.includes('disconnect')) {
        throw new Error('Lost connection to controller. Reconnecting…');
      }
      throw e;
    }
  }

  return (
    <Ctx.Provider value={{
      connecting, connected, reconnect: doConnect,
      zones, status, ownerSub,
      execCommand, setZones,
    }}>
      {children}
    </Ctx.Provider>
  );
}
