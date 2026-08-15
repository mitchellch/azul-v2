'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ProgramEditor, Program, expandPrograms, DAY_NAMES, DAY_BITS, formatTime } from '@/components/ProgramEditor';
import { WeekGlance } from '@/components/WeekGlance';
import { ColorPicker } from '@/components/ColorPicker';
import { zoneStream, useZones, useOta, ZoneLive, OtaLive } from '@/lib/zoneStream';

type LogEntry    = { id: string; zoneNumber: number; startedAt: string; durationSeconds: number; source: string };
type DeviceStatus = { firmware?: string; uptime_seconds?: number; zones_running?: boolean; mac?: string; ip?: string };

const ZONE_COLORS: Record<number, string> = {
  1: '#6b7280', 2: '#ef4444', 3: '#f97316', 4: '#eab308',
  5: '#22c55e', 6: '#3b82f6', 7: '#6366f1', 8: '#a855f7',
  9: '#ff1493', 10: '#00ffff', 11: '#80ff00', 12: '#ff00ff',
};

const WEB_DEBUG = process.env.NEXT_PUBLIC_DEBUG_MODE === 'true';
const BACKEND_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api').replace(/\/api$/, '');

// Matches mobile: 0–25% = 1–5 min, 25–100% = 5–60 min, 1-minute granularity
function sliderToSeconds(pos: number): number {
  if (WEB_DEBUG) {
    if (pos <= 25) {
      const secs = 5 + (pos / 25) * 25;
      return Math.round(secs / 5) * 5;
    }
    const secs = 30 + ((pos - 25) / 75) * 270;
    return Math.round(secs / 5) * 5;
  }
  const p = Math.max(0, Math.min(pos, 100));
  if (p < 25) {
    return Math.round(1 + (p / 25) * 4) * 60;
  }
  return Math.round(5 + ((p - 25) / 75) * 55) * 60;
}
function secondsToSlider(secs: number): number {
  if (WEB_DEBUG) {
    const s = Math.max(5, Math.min(secs, 300));
    if (s <= 30) return ((s - 5) / 25) * 25;
    return 25 + ((s - 30) / 270) * 75;
  }
  const mins = Math.max(1, Math.min(Math.round(secs / 60), 60));
  if (mins <= 5) return ((mins - 1) / 4) * 25;
  return 25 + ((mins - 5) / 55) * 75;
}
function formatDuration(secs: number): string {
  if (secs < 60)       return `${secs}s`;
  if (secs % 60 === 0) return `${secs / 60}m`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

const ZONE_DUR_TICKS = WEB_DEBUG
  ? [
      { label: '5s',  secs: 5 },
      { label: '15s', secs: 15 },
      { label: '30s', secs: 30 },
      { label: '1m',  secs: 60 },
      { label: '3m',  secs: 180 },
      { label: '5m',  secs: 300 },
    ]
  : [
      { label: '1m',  secs: 60 },
      { label: '5m',  secs: 300 },
      { label: '15m', secs: 900 },
      { label: '30m', secs: 1800 },
      { label: '45m', secs: 2700 },
      { label: '60m', secs: 3600 },
    ];
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

const TABS = ['Programs', 'Zones', 'Settings'] as const;
type Tab = typeof TABS[number];

export default function ControllerPage() {
  const { mac: rawMac } = useParams<{ mac: string }>();
  const mac = decodeURIComponent(rawMac as string);
  const router  = useRouter();
  const search  = useSearchParams();

  const initialTab: Tab = (() => {
    const q = search?.get('tab')?.toLowerCase();
    const match = TABS.find(t => t.toLowerCase() === q);
    return match ?? 'Zones';
  })();

  const [tab, setTab]             = useState<Tab>(initialTab);
  const zones = useZones(mac as string);
  const ota   = useOta(mac as string);
  const [programs, setPrograms]   = useState<Program[]>([]);
  const [editingProgram, setEditingProgram] = useState<Program | null | 'new'>(null);
  const [waagOpen, setWaagOpen]   = useState(false);
  const [logs, setLogs]           = useState<LogEntry[]>([]);
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus>({});
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [duration, setDuration]   = useState(WEB_DEBUG ? 60 : 300);
  const [deviceName, setDeviceName] = useState('');

  const [zoneEdits, setZoneEdits]   = useState<Record<number, string>>({});
  const [savingZone, setSavingZone] = useState<number | null>(null);
  const [nameEdit, setNameEdit]     = useState('');
  const [savingName, setSavingName] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);
  const [zonesPanelOpen, setZonesPanelOpen] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);
  const fileInputRefs  = useRef<Record<number, HTMLInputElement | null>>({});
  const [editingZone, setEditingZone]   = useState<number | null>(null);
  const [editingName, setEditingName]   = useState('');
  const [editingColor, setEditingColor] = useState<string | null>(null);
  const [zoneColors, setZoneColors]     = useState<Record<number, string | null>>({});
  const [confirmStop, setConfirmStop]   = useState<{ number: number; name: string; scheduleName: string } | null>(null);

  const apiFetch = useCallback(async (path: string, opts?: RequestInit) => {
    const res = await fetch(`/api/proxy${path}`, { cache: 'no-store', ...opts });
    if (res.status === 401) { window.location.href = '/login'; return; }
    if (!res.ok) throw new Error(`Error ${res.status}`);
    return res.json();
  }, []);

  useEffect(() => { zoneStream.open(); }, []);

  type ServerProgramZone = { zoneNumber: number; durationSeconds: number; order: number };
  type ServerProgram = {
    id: string; name: string; dayMask: number; intervalDays: number;
    startDate: string; endDate: string | null; active: boolean;
    startTimes: { hour: number; minute: number }[];
    zones: ServerProgramZone[];
  };
  const fromServer = (p: ServerProgram): Program => ({
    id: p.id, name: p.name, dayMask: p.dayMask,
    intervalDays: p.intervalDays > 1 ? p.intervalDays : undefined,
    startDate: p.startDate, endDate: p.endDate, active: p.active,
    startTimes: p.startTimes,
    zones: p.zones.map(z => ({ zoneId: z.zoneNumber, durationSeconds: z.durationSeconds, order: z.order })),
  });
  const toServerBody = (p: Program) => ({
    name: p.name,
    dayMask: p.dayMask,
    intervalDays: p.intervalDays && p.intervalDays > 1 ? p.intervalDays : 1,
    startDate: p.startDate ?? new Date().toISOString().slice(0, 10),
    endDate: p.endDate ?? null,
    active: p.active ?? false,
    startTimes: p.startTimes.map(s => ({ hour: s.hour, minute: s.minute })),
    zones: p.zones.map(z => ({ zoneNumber: z.zoneId, durationSeconds: z.durationSeconds, order: z.order })),
  });

  async function reloadPrograms() {
    const list = (await apiFetch(`/devices/${mac}/programs`)) as ServerProgram[];
    setPrograms(list.map(fromServer));
  }

  async function savePrograms(p: Program) {
    const isNew = !programs.some(x => x.id === p.id);
    const url = isNew
      ? `/api/proxy/devices/${mac}/programs`
      : `/api/proxy/devices/${mac}/programs/${p.id}`;
    const res = await fetch(url, {
      method: isNew ? 'POST' : 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(toServerBody(p)),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error ?? `Save failed (${res.status})`);
    }
    await reloadPrograms();
  }

  async function deleteProgram(id: string) {
    const res = await fetch(`/api/proxy/devices/${mac}/programs/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`Delete failed (${res.status})`);
    await reloadPrograms();
  }

  async function toggleProgramActive(p: Program) {
    const path = p.active ? 'deactivate' : 'activate';
    const res = await fetch(`/api/proxy/devices/${mac}/programs/${p.id}/${path}`, { method: 'POST' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error ?? `Toggle failed (${res.status})`);
      return;
    }
    await reloadPrograms();
  }

  // Load device metadata and programs (not zone state — that comes from zoneStream)
  useEffect(() => {
    Promise.all([
      apiFetch(`/devices/${mac}`),
      apiFetch(`/devices/${mac}/programs`),
    ]).then(([device, p]) => {
      // Seed from server response if the stream hasn't received data yet
      if (Array.isArray(device.zones)) {
        zoneStream.seed(mac as string, device.zones.map((z: any) => ({
          id:            z.id,
          number:        z.number,
          name:          z.name ?? `Zone ${z.number}`,
          status:        (z.status ?? 'idle') as ZoneLive['status'],
          runtimeSeconds: z.runtime_seconds ?? 0,
          photoUrl:      z.photoUrl ?? null,
        })));
      }
      setZoneEdits(Object.fromEntries(
        (device.zones ?? []).map((z: any) => [z.number, z.name ?? ''])
      ));
      setZoneColors(Object.fromEntries(
        (device.zones ?? []).map((z: any) => [z.number, z.color ?? null])
      ));
      setPrograms((p as ServerProgram[]).map(fromServer));
      setDeviceName(device.name ?? '');
      setNameEdit(device.name ?? '');
      setDeviceStatus({
        firmware:       device.firmware,
        uptime_seconds: device.uptime_seconds,
        mac:            device.mac,
        ip:             device.ipAddress,
      });
    }).catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [mac, apiFetch]);

  async function startZone(number: number) {
    zoneStream.patch(mac as string, number, 'pending', duration);
    try {
      const res = await fetch(`/api/proxy/devices/${mac}/zones/${number}/start`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ duration }),
      });
      if (!res.ok) {
        zoneStream.patch(mac as string, number, 'idle', 0);
        return;
      }
      // Only promote to running if no other zone is already running — otherwise this
      // zone is queued on the controller and will flip to running via SSE when its turn comes.
      const otherRunning = zoneStream.getZones(mac as string)
        .some(z => z.number !== number && z.status === 'running');
      if (!otherRunning) zoneStream.patch(mac as string, number, 'running', duration);
    } catch {
      zoneStream.patch(mac as string, number, 'idle', 0);
    }
  }

  function stopZone(number: number) {
    const zone = zones.find(z => z.number === number);
    if (zone?.source === 'scheduler') {
      const prog = programs.find(pr => pr.active && pr.zones.some(z => z.zoneId === number));
      const scheduleName = prog?.name ?? 'a program';
      setConfirmStop({ number, name: zone.name || `Zone ${number}`, scheduleName });
      return;
    }
    doStopZone(number);
  }

  function doStopZone(number: number) {
    zoneStream.patch(mac as string, number, 'idle', 0);
    fetch(`/api/proxy/devices/${mac}/zones/${number}/stop`, { method: 'POST' });
  }

  async function stopAll() {
    zones.forEach(z => zoneStream.patch(mac as string, z.number, 'idle', 0));
    await fetch(`/api/proxy/devices/${mac}/zones/stop-all`, { method: 'POST' });
  }

  async function loadLogs() {
    const data = await apiFetch(`/devices/${mac}/log?limit=50`);
    setLogs(data);
  }

  async function saveDeviceName() {
    const name = nameEdit.trim();
    if (!name || name === deviceName) return;
    setSavingName(true);
    try {
      await fetch(`/api/proxy/devices/${mac}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      setDeviceName(name);
      setNameEdit(name);
    } finally {
      setSavingName(false);
    }
  }

  async function saveZoneName(number: number) {
    const name = (zoneEdits[number] ?? '').trim() || `Zone ${number}`;
    setSavingZone(number);
    try {
      await fetch(`/api/proxy/devices/${mac}/zones/${number}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      zoneStream.setZoneName(mac as string, number, name);
      setZoneEdits(prev => ({ ...prev, [number]: name }));
    } finally {
      setSavingZone(null);
    }
  }

  async function uploadWebPhoto(zoneNumber: number, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('photo', file);
    try {
      const res = await fetch(`/api/proxy/devices/${mac}/zones/${zoneNumber}/photo`, {
        method: 'PUT',
        body: formData,
      });
      if (!res.ok) throw new Error('Upload failed');
      const zone = await res.json();
      zoneStream.setZonePhoto(mac as string, zoneNumber, zone.photoUrl);
    } catch (err: any) {
      alert(err.message ?? 'Photo upload failed');
    }
    e.target.value = '';
  }

  function programInWindow(p: Program): boolean {
    const today = new Date().toISOString().slice(0, 10);
    const startOk = !p.startDate || today >= p.startDate;
    const endOk   = !p.endDate   || today <= p.endDate;
    return startOk && endOk;
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
      {/* Back nav + controller name */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.push('/dashboard')}
          className="text-[#1a56db] hover:text-blue-800 font-medium text-sm flex items-center gap-1"
        >
          ← Controllers
        </button>
        <span className="text-gray-300">/</span>
        <h2 className="text-xl font-bold text-gray-900">{deviceName}</h2>
      </div>

      {/* Tabs + Stop All */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex gap-1 bg-gray-200 rounded-lg p-1">
          {TABS.map(t => (
            <button key={t}
              onClick={() => { setTab(t); if (t === 'Settings') loadLogs(); }}
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

      {/* ── Programs tab ── */}
      {tab === 'Programs' && (
        <div>
          {editingProgram !== null ? (
            <ProgramEditor
              program={editingProgram === 'new' ? undefined : editingProgram}
              zoneNames={Object.fromEntries(zones.map(z => [z.number, z.name || `Zone ${z.number}`]))}
              onSave={async (p) => {
                try {
                  await savePrograms(p);
                  setEditingProgram(null);
                } catch (e: any) {
                  alert(e.message ?? 'Save failed');
                }
              }}
              onCancel={() => setEditingProgram(null)}
            />
          ) : (
            <>
              <div className="flex justify-end mb-4">
                <button
                  onClick={() => setEditingProgram('new')}
                  className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#1a56db] text-white hover:bg-blue-700 transition-colors"
                >
                  + New Program
                </button>
              </div>

              {programs.length === 0 ? (
                <div className="bg-white rounded-xl shadow-sm p-8 text-center">
                  <p className="text-gray-600 font-medium mb-1">No programs yet.</p>
                  <p className="text-gray-400 text-sm mb-4">
                    A program groups zones that run together at the same times and days.
                  </p>
                  <button onClick={() => setEditingProgram('new')}
                    className="text-[#1a56db] text-sm font-semibold hover:underline">
                    Create your first program →
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {programs.map(prog => {
                    const dayLabels = prog.intervalDays && prog.intervalDays > 1
                      ? `Every ${prog.intervalDays} days`
                      : DAY_NAMES.filter((_, i) => (prog.dayMask & DAY_BITS[i]) !== 0).join(', ');
                    const timeLabels = prog.startTimes.map(t => formatTime(t.hour, t.minute)).join(', ');
                    const inWindow = programInWindow(prog);
                    return (
                      <div key={prog.id}
                        onClick={() => setEditingProgram(prog)}
                        className="bg-white rounded-xl shadow-sm p-4 cursor-pointer hover:shadow-md transition-shadow"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0 mr-4">
                            <p className="font-semibold text-gray-900">{prog.name}</p>
                            <p className="text-sm text-gray-500 mt-0.5">
                              {prog.zones.length} zone{prog.zones.length !== 1 ? 's' : ''} · {timeLabels}
                            </p>
                            <p className="text-xs text-gray-400 mt-0.5">{dayLabels}</p>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <button
                              onClick={e => { e.stopPropagation(); toggleProgramActive(prog); }}
                              className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
                                prog.active && inWindow
                                  ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                  : prog.active
                                  ? 'bg-blue-50 text-blue-500 hover:bg-blue-100'
                                  : 'bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600'
                              }`}>
                              {prog.active && inWindow ? '● Running' : prog.active ? '● Enabled' : '○ Disabled'}
                            </button>
                            <button
                              onClick={async e => {
                                e.stopPropagation();
                                if (!confirm(`Delete program "${prog.name}"?`)) return;
                                try { await deleteProgram(prog.id); } catch (err: any) { alert(err.message ?? 'Delete failed'); }
                              }}
                              className="text-xs text-red-400 hover:text-red-600 px-2 py-1"
                            >🗑</button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {programs.some(p => p.active && programInWindow(p)) && (
                <div className="mt-4 bg-white rounded-xl shadow-sm p-4">
                  <button
                    onClick={() => setWaagOpen(!waagOpen)}
                    className="text-xs font-semibold text-gray-500 hover:text-gray-700 transition-colors">
                    {waagOpen ? '▾' : '▸'} Week at a Glance
                  </button>
                  {waagOpen && (
                    <div className="mt-2">
                      <WeekGlance
                        runs={expandPrograms(programs.filter(p => p.active && programInWindow(p)))}
                        zoneNames={Object.fromEntries(zones.map(z => [z.number, z.name || `Zone ${z.number}`]))}
                      />
                    </div>
                  )}
                </div>
              )}

              {programs.length > 0 && (
                <div className="mt-6 bg-blue-50 border border-blue-100 rounded-xl px-5 py-4 text-sm text-blue-900 space-y-1.5">
                  <p className="font-semibold">How Programs Work</p>
                  <p>Each program runs its zones sequentially at the specified start times on the selected days.</p>
                  <p>Enable a program to have the controller run it automatically. <strong>{expandPrograms(programs.filter(p => p.active)).length}</strong> of <strong>48</strong> run slots used across enabled programs.</p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Zones tab ── */}
      {tab === 'Zones' && (
        <>
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
              {ZONE_DUR_TICKS.map((t, i) => {
                const pos = secondsToSlider(t.secs);
                const isFirst = i === 0;
                const isLast = i === ZONE_DUR_TICKS.length - 1;
                return (
                  <span key={t.label}
                    className={`absolute cursor-pointer hover:text-[#1a56db] transition-colors ${isFirst ? '' : isLast ? '-translate-x-full' : '-translate-x-1/2'}`}
                    style={{ left: `${pos}%` }}
                    onClick={() => setDuration(t.secs)}
                  >{t.label}</span>
                );
              })}
            </div>
          </div>

          <p className="text-sm text-gray-400 mb-3">Click a zone to start · click again to stop or cancel.</p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {zones.map(z => {
              const isRunning = z.status === 'running';
              const isPending = z.status === 'pending';
              const color = zoneColors[z.number] ?? ZONE_COLORS[z.number] ?? '#9ca3af';
              const bg    = isRunning ? '#f0fdf4' : isPending ? '#fffbeb' : '#ffffff';
              const photoThumb = z.photoUrl ? `${BACKEND_URL}${z.photoUrl}` : null;

              return (
                <div key={z.number}
                  onClick={() => {
                    if (longPressFired.current) { longPressFired.current = false; return; }
                    if (isRunning || isPending) { stopZone(z.number); }
                    else { startZone(z.number); if (previewPhoto) setPreviewPhoto(null); }
                  }}
                  onMouseDown={() => {
                    longPressFired.current = false;
                    longPressTimer.current = setTimeout(() => {
                      longPressFired.current = true;
                      setEditingZone(z.number);
                      setEditingName(z.name || `Zone ${z.number}`);
                      setEditingColor(zoneColors[z.number] ?? ZONE_COLORS[z.number] ?? null);
                    }, 500);
                  }}
                  onMouseUp={() => { if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; } }}
                  onMouseLeave={() => { if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; } }}
                  onContextMenu={(e) => e.preventDefault()}
                  className="relative rounded-xl p-4 cursor-pointer select-none transition-all hover:shadow-md active:scale-95 overflow-hidden"
                  style={{ backgroundColor: bg, border: `2px solid ${color}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                  {photoThumb && (
                    <img src={photoThumb} alt="" className="absolute inset-0 w-full h-full object-cover rounded-[10px] opacity-20 pointer-events-none" />
                  )}
                  <div className="relative flex items-center justify-between mb-1">
                    <span className="font-semibold text-sm text-gray-900 truncate flex-1 mr-2">
                      {z.name || `Zone ${z.number}`}
                    </span>
                    {isRunning && <span className="animate-bounce text-base leading-none">💦</span>}
                    {isPending && <div className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />}
                  </div>
                  <div className="relative flex justify-between items-end">
                    <p className="text-xs h-4 font-medium"
                      style={{ color: isRunning ? '#16a34a' : 'transparent' }}>
                      {isRunning
                        ? z.source === 'scheduler'
                          ? `▶ ${formatRuntime(z.runtimeSeconds)} (Scheduled)`
                          : `▶ ${formatRuntime(z.runtimeSeconds)}`
                        : '.'}
                    </p>
                    {photoThumb && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setPreviewPhoto(previewPhoto === photoThumb ? null : photoThumb); }}
                        className="text-gray-700 text-xl font-bold leading-none px-2 hover:text-gray-900"
                        title="View photo"
                      >{previewPhoto === photoThumb ? '▴' : '▾'}</button>
                    )}
                  </div>
                  <input
                    ref={el => { fileInputRefs.current[z.number] = el; }}
                    type="file" accept="image/*" className="hidden"
                    onChange={e => uploadWebPhoto(z.number, e)}
                  />
                </div>
              );
            })}
          </div>

          {previewPhoto && (
            <div
              className="overflow-hidden rounded-xl mt-3 cursor-pointer"
              onClick={() => setPreviewPhoto(null)}
            >
              <img src={previewPhoto} alt="" className="w-full aspect-video object-cover rounded-xl" />
            </div>
          )}

          {confirmStop && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setConfirmStop(null)}>
              <div className="bg-white rounded-xl shadow-xl w-80 p-5" onClick={e => e.stopPropagation()}>
                <p className="text-sm font-medium text-gray-900 mb-1">Stop scheduled zone?</p>
                <p className="text-sm text-gray-500 mb-4">
                  <strong>{confirmStop.name}</strong> is running as part of the <strong>{confirmStop.scheduleName}</strong> schedule. Are you sure you want to stop it?
                </p>
                <div className="flex justify-end gap-2">
                  <button onClick={() => setConfirmStop(null)} className="text-sm text-gray-500 px-3 py-1.5 rounded-md hover:bg-gray-100">Cancel</button>
                  <button
                    onClick={() => { doStopZone(confirmStop.number); setConfirmStop(null); }}
                    className="text-sm font-semibold text-white bg-red-500 px-3 py-1.5 rounded-md hover:bg-red-600"
                  >Stop</button>
                </div>
              </div>
            </div>
          )}

          {editingZone !== null && (() => {
            const ez = zones.find(zz => zz.number === editingZone);
            const thumb = ez?.photoUrl ? `${BACKEND_URL}${ez.photoUrl}` : null;
            return (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setEditingZone(null)}>
                <div className="bg-white rounded-xl shadow-xl w-80 p-5" onClick={e => e.stopPropagation()}>
                  <div className="flex gap-4 mb-4">
                    <div className="flex-1">
                      <p className="text-xs text-gray-400 mb-1">Zone {editingZone}</p>
                      <input
                        type="text"
                        value={editingName}
                        onChange={e => setEditingName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            const name = editingName.trim() || `Zone ${editingZone}`;
                            setZoneEdits(prev => ({ ...prev, [editingZone!]: name }));
                            saveZoneName(editingZone!);
                            setEditingZone(null);
                          }
                        }}
                        maxLength={31}
                        autoFocus
                        className="w-full text-sm border border-gray-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a56db]"
                      />
                    </div>
                    <label className="flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden cursor-pointer border border-gray-200 hover:border-[#1a56db] transition-colors flex items-center justify-center bg-gray-50">
                      {thumb
                        ? <img src={thumb} alt="" className="w-full h-full object-cover" />
                        : <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-6 h-6 text-gray-400">
                            <path fillRule="evenodd" d="M1 5.25A2.25 2.25 0 0 1 3.25 3h13.5A2.25 2.25 0 0 1 19 5.25v9.5A2.25 2.25 0 0 1 16.75 17H3.25A2.25 2.25 0 0 1 1 14.75v-9.5Zm1.5 5.81v3.69c0 .414.336.75.75.75h13.5a.75.75 0 0 0 .75-.75v-2.69l-2.22-2.219a.75.75 0 0 0-1.06 0l-1.91 1.909-4.72-4.719a.75.75 0 0 0-1.06 0L2.5 11.06Zm6-3.31a1.25 1.25 0 1 1 2.5 0 1.25 1.25 0 0 1-2.5 0Z" clipRule="evenodd" />
                          </svg>
                      }
                      <input type="file" accept="image/*" className="hidden" onChange={e => { uploadWebPhoto(editingZone!, e); setEditingZone(null); }} />
                    </label>
                  </div>
                  <ColorPicker selected={editingColor} onSelect={setEditingColor} />
                  <div className="flex justify-end gap-2 mt-4">
                    <button onClick={() => setEditingZone(null)} className="text-sm text-gray-500 px-3 py-1.5 rounded-md hover:bg-gray-100">Cancel</button>
                    <button
                      onClick={() => {
                        const name = editingName.trim() || `Zone ${editingZone}`;
                        setZoneEdits(prev => ({ ...prev, [editingZone!]: name }));
                        setZoneColors(prev => ({ ...prev, [editingZone!]: editingColor }));
                        saveZoneName(editingZone!);
                        if (editingColor !== (zoneColors[editingZone!] ?? ZONE_COLORS[editingZone!] ?? null)) {
                          fetch(`/api/proxy/devices/${mac}/zones/${editingZone}`, {
                            method: 'PUT', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ color: editingColor }),
                          });
                        }
                        setEditingZone(null);
                      }}
                      className="text-sm font-semibold text-white bg-[#1a56db] px-3 py-1.5 rounded-md hover:bg-blue-700"
                    >Save</button>
                  </div>
                </div>
              </div>
            );
          })()}
        </>
      )}

      {/* ── Settings tab ── */}
      {tab === 'Settings' && (
        <div className="space-y-6">
          {/* Controller Name */}
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">Controller</h3>
            </div>
            <div className="flex items-center gap-3 px-5 py-3">
              <input
                type="text"
                value={nameEdit}
                onChange={e => setNameEdit(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveDeviceName(); }}
                placeholder="Controller name"
                maxLength={64}
                className={`flex-1 text-sm border rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#1a56db] ${
                  nameEdit !== deviceName ? 'border-[#1a56db]' : 'border-gray-200'
                }`}
              />
              <button
                onClick={saveDeviceName}
                disabled={!nameEdit.trim() || nameEdit === deviceName || savingName}
                className={`text-xs px-3 py-1.5 rounded-md font-semibold transition-colors ${
                  nameEdit.trim() && nameEdit !== deviceName && !savingName
                    ? 'bg-[#1a56db] text-white hover:bg-blue-700'
                    : 'bg-gray-100 text-gray-400 cursor-default'
                }`}
              >
                {savingName ? '…' : 'Save'}
              </button>
            </div>
          </div>

          {/* Zones */}
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <button
              type="button"
              onClick={() => setZonesPanelOpen(v => !v)}
              className={`w-full flex items-center justify-between px-5 py-3 text-left hover:bg-gray-50 ${zonesPanelOpen ? 'border-b border-gray-100' : ''}`}
              aria-expanded={zonesPanelOpen}
            >
              <h3 className="font-semibold text-gray-900">Zones</h3>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className={`w-4 h-4 text-gray-400 transition-transform ${zonesPanelOpen ? 'rotate-90' : ''}`}
              >
                <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z" clipRule="evenodd" />
              </svg>
            </button>
            {zonesPanelOpen && (
            <div className="divide-y divide-gray-50">
              {zones.map(z => {
                const val   = zoneEdits[z.number] ?? z.name ?? '';
                const dirty = val !== (z.name ?? '');
                const thumb = z.photoUrl ? `${BACKEND_URL}${z.photoUrl}` : null;
                return (
                  <div key={z.number} className="flex items-center gap-3 px-5 py-3">
                    <span className="text-sm text-gray-400 w-8 flex-shrink-0">#{z.number}</span>
                    <input
                      type="text"
                      value={val}
                      onChange={e => setZoneEdits(prev => ({ ...prev, [z.number]: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter') saveZoneName(z.number); }}
                      placeholder={`Zone ${z.number}`}
                      maxLength={31}
                      className={`flex-1 text-sm border rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#1a56db] ${
                        dirty ? 'border-[#1a56db]' : 'border-gray-200'
                      }`}
                    />
                    <button
                      onClick={() => saveZoneName(z.number)}
                      disabled={!dirty || savingZone === z.number}
                      className={`text-xs px-3 py-1.5 rounded-md font-semibold transition-colors ${
                        dirty && savingZone !== z.number
                          ? 'bg-[#1a56db] text-white hover:bg-blue-700'
                          : 'bg-gray-100 text-gray-400 cursor-default'
                      }`}
                    >
                      {savingZone === z.number ? '…' : 'Save'}
                    </button>
                    <label className="cursor-pointer flex-shrink-0 w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100">
                      {thumb
                        ? <img src={thumb} alt="" className="w-8 h-[18px] rounded-sm object-cover" />
                        : <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-gray-500"><path fillRule="evenodd" d="M1 5.25A2.25 2.25 0 0 1 3.25 3h13.5A2.25 2.25 0 0 1 19 5.25v9.5A2.25 2.25 0 0 1 16.75 17H3.25A2.25 2.25 0 0 1 1 14.75v-9.5Zm1.5 5.81v3.69c0 .414.336.75.75.75h13.5a.75.75 0 0 0 .75-.75v-2.69l-2.22-2.219a.75.75 0 0 0-1.06 0l-1.91 1.909-4.72-4.719a.75.75 0 0 0-1.06 0L2.5 11.06Zm6-3.31a1.25 1.25 0 1 1 2.5 0 1.25 1.25 0 0 1-2.5 0Z" clipRule="evenodd" /></svg>}
                      <input type="file" accept="image/*" className="hidden" onChange={e => uploadWebPhoto(z.number, e)} />
                    </label>
                  </div>
                );
              })}
            </div>
            )}
          </div>

          {/* Device info */}
          {(deviceStatus.firmware || deviceStatus.mac) && (
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100">
                <h3 className="font-semibold text-gray-900">Device</h3>
              </div>
              <div className="divide-y divide-gray-50">
                {deviceStatus.firmware && <InfoRow label="Firmware" value={deviceStatus.firmware} />}
                {deviceStatus.mac      && <InfoRow label="MAC" value={deviceStatus.mac} />}
                {deviceStatus.ip       && <InfoRow label="IP" value={deviceStatus.ip} />}
                {deviceStatus.uptime_seconds != null && (
                  <InfoRow label="Uptime" value={formatUptime(deviceStatus.uptime_seconds)} />
                )}
              </div>
            </div>
          )}

          {/* Firmware update */}
          <FirmwareSection
            mac={mac as string}
            currentVersion={deviceStatus.firmware ?? null}
            ota={ota}
            onUpdated={async () => {
              const d = await apiFetch(`/devices/${mac}`);
              setDeviceStatus({
                firmware:       d.firmware,
                uptime_seconds: d.uptime_seconds,
                mac:            d.mac,
                ip:             d.ipAddress,
              });
            }}
          />

          {/* Activity Log */}
          <ActivityLog logs={logs} zones={zones} />
        </div>
      )}

      {deviceStatus.firmware && (
        <div className="mt-8 pt-4 border-t border-gray-200 flex items-center gap-4 text-xs text-gray-400">
          <span>Firmware: {deviceStatus.firmware}</span>
          {deviceStatus.uptime_seconds != null && <span>Uptime: {formatUptime(deviceStatus.uptime_seconds)}</span>}
          {WEB_DEBUG && (
            <span className="ml-auto bg-red-600 text-white text-[10px] font-bold tracking-wide rounded px-1.5 py-0.5 opacity-85">DEBUG</span>
          )}
        </div>
      )}

    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center px-5 py-3">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm text-gray-900 font-medium">{value}</span>
    </div>
  );
}

function formatSource(source: string): string {
  if (source === 'MQTT' || source === 'manual' || source === 'app') return 'Manual';
  if (source === 'scheduler' || source === 'schedule') return 'Schedule';
  return source;
}

function formatLogDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday     = d.toDateString() === now.toDateString();
  const yesterday   = new Date(now); yesterday.setDate(now.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (isToday)     return `Today ${time}`;
  if (isYesterday) return `Yesterday ${time}`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + time;
}

type ReleaseListItem = { id: string; version: string; target: string; sha256: string; size: number; releaseNotes: string | null; createdAt: string };

function compareSemver(a: string, b: string): number {
  const pa = a.split(/[.-]/).map(x => Number(x) || 0);
  const pb = b.split(/[.-]/).map(x => Number(x) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  }
  return 0;
}

function FirmwareSection({ mac, currentVersion, ota, onUpdated }: {
  mac: string;
  currentVersion: string | null;
  ota: OtaLive | null;
  onUpdated: () => void | Promise<void>;
}) {
  const [releases, setReleases]   = useState<ReleaseListItem[]>([]);
  const [loadError, setLoadError] = useState('');
  const [triggering, setTriggering] = useState(false);
  const [triggerError, setTriggerError] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const prevOtaStatus = useRef<OtaLive['status'] | null>(null);

  useEffect(() => {
    fetch('/api/proxy/admin/firmware').then(async r => {
      if (!r.ok) { setLoadError(`Error ${r.status}`); return; }
      const list = (await r.json()) as ReleaseListItem[];
      setReleases(list.filter(x => x.target === 'main-controller'));
    }).catch(e => setLoadError(String(e.message ?? e)));
  }, []);

  // Newest available version above the currently-installed one.
  const available = releases
    .filter(r => !currentVersion || compareSemver(r.version, currentVersion) > 0)
    .sort((a, b) => compareSemver(b.version, a.version))[0] ?? null;

  const inFlight = ota && ['pending','downloading','verifying','installing'].includes(ota.status);

  // Refetch device metadata when an OTA transitions into `complete` so the
  // "Current" line updates from 0.2.2 → 0.2.3 on its own.
  useEffect(() => {
    const prev = prevOtaStatus.current;
    prevOtaStatus.current = ota?.status ?? null;
    if (ota?.status === 'complete' && prev !== 'complete') {
      // Small delay so the device has a moment to publish its new status ping.
      const t = setTimeout(() => { void onUpdated(); }, 2000);
      return () => clearTimeout(t);
    }
  }, [ota?.status, onUpdated]);

  async function trigger() {
    if (!available) return;
    setTriggerError('');
    setTriggering(true);
    try {
      const res = await fetch(`/api/proxy/devices/${mac}/ota`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: available.version }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `Trigger failed (${res.status})`);
      const row = body.status ?? {};
      zoneStream.setOta(mac, {
        statusId:    row.id,
        version:     row.version ?? available.version,
        status:      (row.status ?? 'pending') as OtaLive['status'],
        progress:    Number(row.progress ?? 0),
        error:       null,
        startedAt:   row.startedAt ?? new Date().toISOString(),
        completedAt: null,
      });
      setConfirmOpen(false);
    } catch (e: any) {
      setTriggerError(e.message ?? String(e));
    } finally {
      setTriggering(false);
    }
  }

  // Nothing to show — up-to-date, no in-flight update, no visible error.
  if (!inFlight && !available && ota?.status !== 'error' && !loadError) return null;

  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100">
        <h3 className="font-semibold text-gray-900">Firmware</h3>
      </div>
      <div className="px-5 py-4 space-y-3">
        {loadError && <p className="text-sm text-red-600">{loadError}</p>}

        {inFlight && ota && (
          <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-sm">
            <div className="flex justify-between mb-1">
              <span className="text-blue-900 font-medium">Updating to {ota.version}</span>
              <span className="text-blue-700">{ota.progress}%</span>
            </div>
            <div className="h-1.5 bg-blue-100 rounded overflow-hidden">
              <div className="h-full bg-[#1a56db] transition-all" style={{ width: `${ota.progress}%` }} />
            </div>
            <p className="text-xs text-blue-700 mt-1 capitalize">{ota.status}</p>
          </div>
        )}
        {ota?.status === 'error' && !inFlight && (
          <div className="bg-red-50 border border-red-100 rounded-lg px-3 py-2 text-sm text-red-700">
            Update failed: {ota.error ?? 'unknown error'}
          </div>
        )}

        {!inFlight && available && (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm text-gray-900">
                Firmware <span className="font-mono">{available.version}</span> is available.
              </p>
              {available.releaseNotes && (
                <p className="text-xs text-gray-500 mt-0.5">{available.releaseNotes}</p>
              )}
            </div>
            <button
              onClick={() => { setTriggerError(''); setConfirmOpen(true); }}
              className="text-xs px-3 py-1.5 rounded-md bg-[#1a56db] text-white font-semibold flex-shrink-0"
            >
              Update
            </button>
          </div>
        )}
        {triggerError && <p className="text-sm text-red-600">{triggerError}</p>}
      </div>

      {confirmOpen && available && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4" onClick={() => !triggering && setConfirmOpen(false)}>
          <div className="bg-white rounded-xl shadow-lg max-w-sm w-full p-5" onClick={e => e.stopPropagation()}>
            <h4 className="font-semibold text-gray-900 mb-2">Update firmware?</h4>
            <p className="text-sm text-gray-600 mb-4">
              Update to <span className="font-mono">{available.version}</span>. The controller will reboot mid-update; any running zone will be canceled.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmOpen(false)}
                disabled={triggering}
                className="text-sm px-3 py-1.5 rounded-md border border-gray-200 text-gray-700"
              >Cancel</button>
              <button
                onClick={trigger}
                disabled={triggering}
                className="text-sm px-3 py-1.5 rounded-md bg-[#1a56db] text-white font-semibold disabled:opacity-50"
              >
                {triggering ? 'Sending…' : 'Update'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ActivityLog({ logs, zones }: { logs: LogEntry[]; zones: ZoneLive[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors"
      >
        <h3 className="font-semibold text-gray-900">Activity Log</h3>
        <span className="text-gray-400 text-sm">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        logs.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-8">No activity recorded yet.</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {logs.map((e, i) => {
              const zoneName = zones.find(z => z.number === e.zoneNumber)?.name || `Zone ${e.zoneNumber}`;
              const duration = formatDuration(e.durationSeconds);
              const source   = formatSource(e.source);
              const date     = formatLogDate(e.startedAt);
              return (
                <div key={i} className="flex justify-between items-center px-5 py-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{zoneName}</p>
                    <p className="text-xs text-gray-400">{duration} · {source}</p>
                  </div>
                  <p className="text-xs text-gray-400 text-right">{date}</p>
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}
