'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';

type Device = {
  id: string; mac: string; name: string;
  firmware: string | null; online: boolean; lastSeenAt: string | null;
  hasActiveSchedule?: boolean; activeScheduleUuid?: string | null;
};

type ConnectionGrade = 'good' | 'degraded' | 'poor' | 'offline';

type ConnectionStatus = {
  grade: ConnectionGrade;
  lastSeen: number | null;
  reason: string;
};

type DeviceWithStatus = Device & { connectionStatus?: ConnectionStatus };

const GRADE_STYLES: Record<ConnectionGrade, { dot: string }> = {
  good:     { dot: 'bg-green-500' },
  degraded: { dot: 'bg-yellow-400' },
  poor:     { dot: 'bg-orange-500' },
  offline:  { dot: 'bg-gray-300' },
};

const WEB_DEBUG = process.env.NEXT_PUBLIC_DEBUG_MODE === 'true';
const ORDER_KEY = 'azul_controller_order';

function formatLastSeen(ts: string | null): string {
  if (!ts) return 'Never connected';
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60_000)    return 'Just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function loadOrder(): string[] {
  try { return JSON.parse(localStorage.getItem(ORDER_KEY) ?? '[]'); } catch { return []; }
}
function saveOrder(macs: string[]) {
  localStorage.setItem(ORDER_KEY, JSON.stringify(macs));
}

function applyOrder(devices: DeviceWithStatus[]): DeviceWithStatus[] {
  const order = loadOrder();
  if (order.length === 0) return devices;
  const map = new Map(devices.map(d => [d.mac, d]));
  const ordered: DeviceWithStatus[] = [];
  for (const mac of order) {
    const d = map.get(mac);
    if (d) { ordered.push(d); map.delete(mac); }
  }
  for (const d of map.values()) ordered.push(d);
  return ordered;
}

export default function DashboardPage() {
  const [devices, setDevices] = useState<DeviceWithStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [togglingMac, setTogglingMac] = useState<string | null>(null);

  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  const fetchDevices = useCallback(async () => {
    try {
      const res = await fetch('/api/proxy/devices');
      if (res.status === 401) { window.location.href = '/login'; return; }
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const devs: Device[] = await res.json();

      const statuses = await Promise.allSettled(
        devs.map(d => fetch(`/api/proxy/devices/${d.mac}/connection-status`).then(r => r.json()))
      );

      const withStatus = devs.map((d, i) => ({
        ...d,
        connectionStatus: statuses[i].status === 'fulfilled' ? statuses[i].value : undefined,
      }));

      setDevices(applyOrder(withStatus));
    } catch (e: any) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDevices();
    const interval = setInterval(fetchDevices, 30_000);
    return () => clearInterval(interval);
  }, [fetchDevices]);

  async function toggleSchedule(d: DeviceWithStatus) {
    setTogglingMac(d.mac);
    try {
      if (d.hasActiveSchedule && d.activeScheduleUuid) {
        await fetch(`/api/proxy/devices/${d.mac}/schedules/deactivate`, { method: 'POST' });
        setDevices(prev => prev.map(x => x.mac === d.mac ? { ...x, hasActiveSchedule: false, activeScheduleUuid: null } : x));
      } else {
        const schedRes = await fetch(`/api/proxy/devices/${d.mac}/schedules`);
        if (!schedRes.ok) return;
        const schedules = await schedRes.json();
        if (schedules.length === 0) return;
        const target = schedules[0];
        await fetch(`/api/proxy/devices/${d.mac}/schedules/${target.uuid}/activate`, { method: 'POST' });
        setDevices(prev => prev.map(x => x.mac === d.mac ? { ...x, hasActiveSchedule: true, activeScheduleUuid: target.uuid } : x));
      }
    } catch { /* ignore */ }
    finally { setTogglingMac(null); }
  }

  function handleDragStart(idx: number) {
    dragItem.current = idx;
  }
  function handleDragEnter(idx: number) {
    dragOverItem.current = idx;
  }
  function handleDragEnd() {
    if (dragItem.current === null || dragOverItem.current === null) return;
    const from = dragItem.current;
    const to = dragOverItem.current;
    if (from === to) { dragItem.current = null; dragOverItem.current = null; return; }
    setDevices(prev => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      saveOrder(next.map(d => d.mac));
      return next;
    });
    dragItem.current = null;
    dragOverItem.current = null;
  }

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="w-6 h-6 border-2 border-[#1a56db] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (error) return <div className="text-red-500 text-center py-10">{error}</div>;

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Controllers</h2>
      {devices.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-12 text-center">
          <p className="text-gray-500 font-medium text-lg">No controllers yet.</p>
          <p className="text-gray-400 text-sm mt-2">Register one from the Azul mobile app → Settings → Register with Cloud.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {devices.map((d, i) => {
            const grade = d.connectionStatus?.grade ?? (d.online ? 'good' : 'offline');
            const style = GRADE_STYLES[grade];
            const isOffline = grade === 'offline';
            return (
              <div
                key={d.mac}
                draggable
                onDragStart={() => handleDragStart(i)}
                onDragEnter={() => handleDragEnter(i)}
                onDragEnd={handleDragEnd}
                onDragOver={e => e.preventDefault()}
                className="bg-white rounded-xl shadow-sm p-5 flex items-center justify-between hover:shadow-md transition-shadow cursor-grab active:cursor-grabbing"
              >
                <Link href={`/controllers/${d.mac}`} className="flex items-center gap-3 flex-1 min-w-0">
                  <div className={`w-3 h-3 rounded-full flex-shrink-0 ${style.dot}`} />
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{d.name}</p>
                    <p className="text-sm text-gray-400 truncate">{d.mac} · {formatLastSeen(d.lastSeenAt)}</p>
                  </div>
                </Link>
                <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                  {d.firmware && <span className="text-xs text-gray-400 hidden sm:inline">{d.firmware}</span>}
                  {togglingMac === d.mac ? (
                    <div className="w-5 h-5 border-2 border-[#1a56db] border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleSchedule(d); }}
                      disabled={isOffline}
                      className={`relative w-11 h-6 rounded-full transition-colors ${
                        d.hasActiveSchedule ? 'bg-[#1a56db]' : 'bg-gray-300'
                      } ${isOffline ? 'opacity-35 cursor-default' : 'cursor-pointer'}`}
                      title={d.hasActiveSchedule ? 'Schedule active — click to pause' : 'Schedule paused — click to resume'}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                        d.hasActiveSchedule ? 'translate-x-5' : 'translate-x-0'
                      }`} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {(devices[0]?.firmware || WEB_DEBUG) && (
        <div className="mt-8 pt-4 border-t border-gray-200 flex items-center gap-4 text-xs text-gray-400">
          {devices[0]?.firmware && <span>Firmware: {devices[0].firmware}</span>}
          {WEB_DEBUG && (
            <span className="ml-auto bg-red-600 text-white text-[10px] font-bold tracking-wide rounded px-1.5 py-0.5 opacity-85">DEBUG</span>
          )}
        </div>
      )}
    </div>
  );
}
