'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';

type Zone     = { id: string; number: number; name: string };
type Schedule = { uuid: string; name: string; start_date: string; end_date: string | null; active: boolean; runs: unknown[] };
type LogEntry = { id: string; zoneNumber: number; startedAt: string; durationSeconds: number; source: string };

const ZONE_COLORS: Record<number, string> = {
  1: '#e5e7eb', 2: '#ef4444', 3: '#f97316', 4: '#eab308',
  5: '#22c55e', 6: '#3b82f6', 7: '#6366f1', 8: '#a855f7',
};

const TABS = ['Zones', 'Schedules', 'Logs'] as const;
type Tab = typeof TABS[number];

export default function ControllerPage() {
  const { mac }   = useParams<{ mac: string }>();
  const [tab, setTab]             = useState<Tab>('Zones');
  const [zones, setZones]         = useState<Zone[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [logs, setLogs]           = useState<LogEntry[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');

  const apiFetch = useCallback(async (path: string) => {
    const res = await fetch(`/api/proxy${path}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`API error ${res.status}`);
    return res.json();
  }, []);

  useEffect(() => {
    Promise.all([
      apiFetch(`/devices/${mac}/zones`),
      apiFetch(`/devices/${mac}/schedules`),
    ]).then(([z, s]) => { setZones(z); setSchedules(s); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [mac, apiFetch]);

  async function startZone(number: number) {
    await fetch(`/api/proxy/devices/${mac}/zones/${number}/start`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ duration: 60 }),
    });
  }

  async function stopZone(number: number) {
    await fetch(`/api/proxy/devices/${mac}/zones/${number}/stop`, { method: 'POST' });
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

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="w-6 h-6 border-2 border-[#1a56db] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (error) return <div className="text-red-500 text-center py-10">{error}</div>;

  return (
    <div>
      <div className="flex gap-1 mb-6 bg-gray-200 rounded-lg p-1 w-fit">
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

      {tab === 'Zones' && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {zones.map(z => (
            <div key={z.id} className="bg-white rounded-xl shadow-sm p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-3 h-3 rounded-full border border-gray-200 flex-shrink-0"
                  style={{ backgroundColor: ZONE_COLORS[z.number] }} />
                <span className="font-semibold text-sm text-gray-900 truncate">
                  {z.name || `Zone ${z.number}`}
                </span>
              </div>
              <div className="flex gap-2">
                <button onClick={() => startZone(z.number)}
                  className="flex-1 bg-blue-50 text-[#1a56db] text-xs font-semibold py-1.5 rounded hover:bg-blue-100 transition-colors">
                  Run
                </button>
                <button onClick={() => stopZone(z.number)}
                  className="flex-1 bg-red-50 text-red-600 text-xs font-semibold py-1.5 rounded hover:bg-red-100 transition-colors">
                  Stop
                </button>
              </div>
            </div>
          ))}
        </div>
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
                  {s.start_date} → {s.end_date ?? 'open-ended'} · {s.runs.length} zone{s.runs.length !== 1 ? 's' : ''}
                </p>
              </div>
              <button onClick={() => toggleSchedule(s.uuid, s.active)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
                  s.active ? 'bg-blue-100 text-[#1a56db] hover:bg-blue-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
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
              <p className="text-sm text-gray-400 text-right">
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
