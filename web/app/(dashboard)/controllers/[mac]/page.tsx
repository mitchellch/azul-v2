'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';

type Zone      = { id: string; number: number; name: string };
type ZoneLive  = Zone & { status: 'idle' | 'running' | 'pending'; runtimeSeconds: number };
type Schedule  = { uuid: string; name: string; start_date: string; end_date: string | null; active: boolean; runs: unknown[] };
type LogEntry  = { id: string; zoneNumber: number; startedAt: string; durationSeconds: number; source: string };
type DeviceStatus = { firmware?: string; uptime_seconds?: number; zones_running?: boolean };

const ZONE_COLORS: Record<number, string> = {
  1: '#e5e7eb', 2: '#ef4444', 3: '#f97316', 4: '#eab308',
  5: '#22c55e', 6: '#3b82f6', 7: '#6366f1', 8: '#a855f7',
};

const DURATION_OPTIONS = [
  { label: '15s', value: 15 },
  { label: '30s', value: 30 },
  { label: '1m',  value: 60 },
  { label: '5m',  value: 300 },
  { label: '10m', value: 600 },
  { label: '30m', value: 1800 },
];

const TABS = ['Zones', 'Schedules', 'Logs'] as const;
type Tab = typeof TABS[number];

function formatRuntime(secs: number): string {
  const m = Math.floor(secs / 60), s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function formatUptime(secs: number): string {
  const d = Math.floor(secs / 86400), h = Math.floor((secs % 86400) / 3600), m = Math.floor((secs % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function ControllerPage() {
  const { mac } = useParams<{ mac: string }>();
  const [tab, setTab]             = useState<Tab>('Zones');
  const [zones, setZones]         = useState<ZoneLive[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [logs, setLogs]           = useState<LogEntry[]>([]);
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus>({});
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [duration, setDuration]   = useState(60);
  const [pendingZone, setPendingZone] = useState<number | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const apiFetch = useCallback(async (path: string, opts?: RequestInit) => {
    const res = await fetch(`/api/proxy${path}`, { cache: 'no-store', ...opts });
    if (!res.ok) throw new Error(`API error ${res.status}`);
    return res.json();
  }, []);

  // Load initial data
  useEffect(() => {
    Promise.all([
      apiFetch(`/devices/${mac}/zones`),
      apiFetch(`/devices/${mac}/schedules`),
    ]).then(([z, s]) => {
      setZones(z.map((zone: Zone) => ({ ...zone, status: 'idle' as const, runtimeSeconds: 0 })));
      setSchedules(s);
    }).catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [mac, apiFetch]);

  // SSE for live zone status
  useEffect(() => {
    const es = new EventSource(`/api/stream/${mac}`);
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'snapshot' && data.device) {
          setDeviceStatus({ firmware: data.device.firmware, uptime_seconds: data.device.uptime_seconds });
        }
        if (data.type === 'status') {
          if (data.uptime_seconds) setDeviceStatus(prev => ({ ...prev, ...data }));
        }
      } catch {}
    };
    es.onerror = () => es.close();
    return () => es.close();
  }, [mac]);

  // 1s countdown for running zones
  useEffect(() => {
    tickRef.current = setInterval(() => {
      setZones(prev => prev.map(z =>
        z.status === 'running' && z.runtimeSeconds > 0
          ? { ...z, runtimeSeconds: z.runtimeSeconds - 1 }
          : z
      ));
    }, 1000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, []);

  async function startZone(number: number) {
    setPendingZone(number);
    setZones(prev => prev.map(z => z.number === number ? { ...z, status: 'pending', runtimeSeconds: duration } : z));
    await fetch(`/api/proxy/devices/${mac}/zones/${number}/start`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ duration }),
    });
    setTimeout(async () => {
      const updated = await apiFetch(`/devices/${mac}/zones`);
      setZones(updated.map((z: Zone & { status?: string; runtimeSeconds?: number }) => ({
        ...z, status: z.status ?? 'idle', runtimeSeconds: z.runtimeSeconds ?? 0,
      })));
      setPendingZone(null);
    }, 2000);
  }

  async function stopZone(number: number) {
    setZones(prev => prev.map(z => z.number === number ? { ...z, status: 'idle', runtimeSeconds: 0 } : z));
    await fetch(`/api/proxy/devices/${mac}/zones/${number}/stop`, { method: 'POST' });
  }

  async function stopAll() {
    setZones(prev => prev.map(z => ({ ...z, status: 'idle' as const, runtimeSeconds: 0 })));
    await fetch(`/api/proxy/devices/${mac}/zones/stop-all`, { method: 'POST' });
  }

  async function toggleSchedule(uuid: string, active: boolean) {
    if (active) {
      await fetch(`/api/proxy/devices/${mac}/schedules/active`, { method: 'DELETE' });
    } else {
      await fetch(`/api/proxy/devices/${mac}/schedules/${uuid}/activate`, { method: 'POST' });
    }
    const updated = await apiFetch(`/devices/${mac}/schedules`);
    setSchedules(updated);
  }

  async function loadLogs() {
    const data = await apiFetch(`/devices/${mac}/log?limit=50`);
    setLogs(data);
  }

  const anyRunning = zones.some(z => z.status === 'running' || z.status === 'pending');

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="w-6 h-6 border-2 border-[#1a56db] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (error) return <div className="text-red-500 text-center py-10">{error}</div>;

  return (
    <div>
      {/* Device status bar */}
      {deviceStatus.firmware && (
        <div className="flex items-center gap-4 mb-5 text-sm text-gray-400">
          <span>v{deviceStatus.firmware}</span>
          {deviceStatus.uptime_seconds && <span>Up {formatUptime(deviceStatus.uptime_seconds)}</span>}
          {anyRunning && <span className="text-green-600 font-medium">● Zones running</span>}
        </div>
      )}

      {/* Tabs + Stop All */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex gap-1 bg-gray-200 rounded-lg p-1">
          {TABS.map(t => (
            <button key={t}
              onClick={() => { setTab(t); if (t === 'Logs') loadLogs(); }}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                tab === t ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {t}
            </button>
          ))}
        </div>
        {tab === 'Zones' && anyRunning && (
          <button onClick={stopAll}
            className="px-4 py-2 bg-red-50 text-red-600 text-sm font-semibold rounded-lg hover:bg-red-100 transition-colors border border-red-200">
            ■ Stop All
          </button>
        )}
      </div>

      {tab === 'Zones' && (
        <>
          {/* Duration picker */}
          <div className="flex items-center gap-2 mb-4">
            <span className="text-sm text-gray-500 font-medium">Duration:</span>
            {DURATION_OPTIONS.map(opt => (
              <button key={opt.value} onClick={() => setDuration(opt.value)}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                  duration === opt.value
                    ? 'bg-[#1a56db] text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}>
                {opt.label}
              </button>
            ))}
          </div>

          {/* Zone grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {zones.map(z => {
              const isRunning = z.status === 'running';
              const isPending = z.status === 'pending';
              const isActive  = isRunning || isPending;
              return (
                <div key={z.id}
                  className={`bg-white rounded-xl shadow-sm p-4 transition-all ${
                    isRunning ? 'ring-2 ring-green-400' : isPending ? 'ring-2 ring-amber-400' : ''
                  }`}>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-3 h-3 rounded-full border border-gray-200 flex-shrink-0"
                      style={{ backgroundColor: ZONE_COLORS[z.number] }} />
                    <span className="font-semibold text-sm text-gray-900 truncate">
                      {z.name || `Zone ${z.number}`}
                    </span>
                  </div>
                  <p className={`text-xs mb-3 h-4 ${
                    isRunning ? 'text-green-600 font-medium' :
                    isPending ? 'text-amber-500 font-medium' : 'text-gray-400'
                  }`}>
                    {isRunning ? `▶ ${formatRuntime(z.runtimeSeconds)}` : isPending ? '… Pending' : 'Tap to run'}
                  </p>
                  {isActive ? (
                    <button onClick={() => stopZone(z.number)}
                      className="w-full bg-red-50 text-red-600 text-xs font-semibold py-1.5 rounded hover:bg-red-100 transition-colors">
                      ■ Stop
                    </button>
                  ) : (
                    <button onClick={() => startZone(z.number)}
                      className="w-full bg-blue-50 text-[#1a56db] text-xs font-semibold py-1.5 rounded hover:bg-blue-100 transition-colors">
                      ▶ Run
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {tab === 'Schedules' && (
        <div className="space-y-3">
          {schedules.length === 0 && (
            <div className="bg-white rounded-xl shadow-sm p-10 text-center">
              <p className="text-gray-400">No schedules. Create one from the mobile app.</p>
            </div>
          )}
          {schedules.map(s => (
            <div key={s.uuid} className="bg-white rounded-xl shadow-sm p-4 flex items-center justify-between">
              <div>
                <p className="font-semibold text-gray-900">{s.name}</p>
                <p className="text-sm text-gray-400">
                  {s.start_date} → {s.end_date ?? 'open-ended'} · {(s.runs as unknown[]).length} zone{(s.runs as unknown[]).length !== 1 ? 's' : ''}
                </p>
              </div>
              <button onClick={() => toggleSchedule(s.uuid, s.active)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
                  s.active
                    ? 'bg-blue-100 text-[#1a56db] hover:bg-blue-200'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}>
                {s.active ? '● Active' : 'Activate'}
              </button>
            </div>
          ))}
        </div>
      )}

      {tab === 'Logs' && (
        <div className="space-y-2">
          {logs.length === 0 && (
            <div className="bg-white rounded-xl shadow-sm p-10 text-center">
              <p className="text-gray-400">No activity recorded yet.</p>
            </div>
          )}
          {logs.map((e, i) => (
            <div key={i} className="bg-white rounded-xl shadow-sm p-4 flex justify-between items-center">
              <div>
                <p className="font-medium text-gray-900">Zone {e.zoneNumber}</p>
                <p className="text-sm text-gray-400">
                  {Math.floor(e.durationSeconds / 60)}m {e.durationSeconds % 60}s · {e.source}
                </p>
              </div>
              <p className="text-sm text-gray-400">
                {new Date(e.startedAt).toLocaleString(undefined, {
                  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                })}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
