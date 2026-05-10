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

// Piecewise slider: 0–25 = 5s–60s, 25–100 = 1m–60m
function sliderToSeconds(pos: number): number {
  if (pos <= 25) return (Math.round((pos / 25) * 11) + 1) * 5;
  return (Math.round(((pos - 25) / 75) * 59) + 1) * 60;
}
function secondsToSlider(secs: number): number {
  if (secs <= 60) return ((Math.round(secs / 5) - 1) / 11) * 25;
  return 25 + ((Math.round(secs / 60) - 1) / 59) * 75;
}
function formatDuration(secs: number): string {
  if (secs < 60)       return `${secs}s`;
  if (secs % 60 === 0) return `${secs / 60}m`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

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
  const [duration, setDuration] = useState(60);
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

  // SSE for device status + periodic zone poll
  useEffect(() => {
    const es = new EventSource(`/api/stream/${mac}`);
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'snapshot' && data.device) {
          setDeviceStatus({ firmware: data.device.firmware, uptime_seconds: data.device.uptime_seconds });
        }
        if (data.type === 'status') {
          if (data.uptime_seconds) setDeviceStatus(prev => ({ ...prev, uptime_seconds: data.uptime_seconds }));
          // Zone status from MQTT payload (firmware now includes per-zone data)
          if (Array.isArray(data.zones)) {
            setZones(prev => prev.map(z => {
              const u = (data.zones as any[]).find((x: any) => x.id === z.number);
              if (!u) return z;
              if (z.status === 'pending' && u.status === 'idle') return z; // wait for running
              return { ...z, status: u.status, runtimeSeconds: u.runtime ?? 0 };
            }));
          }
        }
      } catch {}
    };
    es.onerror = () => es.close();
    return () => es.close();
  }, [mac, apiFetch]);

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
    // Optimistic update — SSE will deliver the real state when controller responds
    setZones(prev => prev.map(z => z.number === number ? { ...z, status: 'pending', runtimeSeconds: duration } : z));
    await fetch(`/api/proxy/devices/${mac}/zones/${number}/start`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ duration }),
    });
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
          {/* Duration slider */}
          <div className="bg-white rounded-xl shadow-sm px-5 py-4 mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-500 font-medium">Duration</span>
              <span className="text-lg font-bold text-[#1a56db]">{formatDuration(duration)}</span>
            </div>
            <input type="range" min="0" max="100" step="1"
              value={secondsToSlider(duration)}
              onChange={e => setDuration(sliderToSeconds(Number(e.target.value)))}
              className="w-full accent-[#1a56db]"
            />
            <div className="relative text-xs text-gray-400 mt-1 h-4">
              <span className="absolute" style={{ left: '0%' }}>5s</span>
              <span className="absolute -translate-x-1/2" style={{ left: '12%' }}>30s</span>
              <span className="absolute -translate-x-1/2" style={{ left: '25%' }}>1m</span>
              <span className="absolute -translate-x-1/2" style={{ left: '50%' }}>15m</span>
              <span className="absolute -translate-x-1/2" style={{ left: '75%' }}>30m</span>
              <span className="absolute -translate-x-full" style={{ left: '100%' }}>60m</span>
            </div>
          </div>

          {/* Instruction */}
          <p className="text-sm text-gray-400 mb-3">
            {anyRunning ? 'Click a running zone to stop it.' : 'Click a zone to run it for the selected duration.'}
          </p>

          {/* Zone grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {zones.map(z => {
              const isRunning = z.status === 'running';
              const isPending = z.status === 'pending';
              return (
                <div key={z.id}
                  onClick={() => isRunning ? stopZone(z.number) : (!isPending && startZone(z.number))}
                  className={`bg-white rounded-xl shadow-sm p-4 transition-all select-none ${
                    isRunning ? 'ring-2 ring-green-400 cursor-pointer hover:ring-red-400' :
                    isPending ? 'ring-2 ring-amber-400 cursor-default' :
                    'cursor-pointer hover:shadow-md active:scale-95'
                  }`}>
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-3 h-3 rounded-full border border-gray-200 flex-shrink-0"
                      style={{ backgroundColor: ZONE_COLORS[z.number] }} />
                    <span className="font-semibold text-sm text-gray-900 truncate">
                      {z.name || `Zone ${z.number}`}
                    </span>
                  </div>
                  <p className={`text-xs h-4 ${
                    isRunning ? 'text-green-600 font-medium' :
                    isPending ? 'text-amber-500 font-medium' : 'text-transparent'
                  }`}>
                    {isRunning ? `▶ ${formatRuntime(z.runtimeSeconds)}` : isPending ? '…' : '.'}
                  </p>
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
