'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ScheduleEditor, Schedule } from '@/components/ScheduleEditor';
import { ProgramEditor, Program, expandPrograms, DAY_NAMES, DAY_BITS, formatTime } from '@/components/ProgramEditor';
import { WeekGlance } from '@/components/WeekGlance';
import { ColorPicker } from '@/components/ColorPicker';
import { zoneStream, useZones, ZoneLive } from '@/lib/zoneStream';

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

const TABS = ['Programs', 'Schedules', 'Zones', 'Settings'] as const;
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
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null | 'new'>(null);
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

  // Load programs from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(`azul-programs-${mac}`);
      if (stored) setPrograms(JSON.parse(stored));
    } catch {}
  }, [mac]);

  function savePrograms(updated: Program[]) {
    setPrograms(updated);
    localStorage.setItem(`azul-programs-${mac}`, JSON.stringify(updated));
  }

  async function syncProgramsToSchedule(progs: Program[]) {
    const runs = expandPrograms(progs);
    const activeSchedule = schedules.find(s => s.active);
    if (!activeSchedule) return;
    const updated = { ...activeSchedule, runs };
    await saveSchedule(updated);
  }

  // Load device metadata and schedules (not zone state — that comes from zoneStream)
  useEffect(() => {
    Promise.all([
      apiFetch(`/devices/${mac}`),
      apiFetch(`/devices/${mac}/schedules`),
    ]).then(([device, s]) => {
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
      setSchedules(s);
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
      const activeSchedule = schedules.find(s => s.active);
      const prog = programs.find(pr => pr.zones.some(z => z.zoneId === number));
      const scheduleName = prog?.name ?? activeSchedule?.name ?? 'a schedule';
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

  async function saveSchedule(s: Schedule) {
    const method = s.uuid ? 'PUT' : 'POST';
    const url = s.uuid
      ? `/api/proxy/devices/${mac}/schedules/${s.uuid}`
      : `/api/proxy/devices/${mac}/schedules`;
    const res = await fetch(url, {
      method, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(s),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error ?? `Save failed (${res.status})`);
    }
    const updated = await apiFetch(`/devices/${mac}/schedules`);
    setSchedules(updated);
    setEditingSchedule(null);
  }

  async function deleteSchedule(uuid: string) {
    if (!confirm('Delete this schedule? This cannot be undone.')) return;
    await fetch(`/api/proxy/devices/${mac}/schedules/${uuid}`, { method: 'DELETE' });
    const updated = await apiFetch(`/devices/${mac}/schedules`);
    setSchedules(updated);
  }

  async function toggleScheduleActive(s: Schedule) {
    if (s.active) {
      await fetch(`/api/proxy/devices/${mac}/schedules/deactivate`, { method: 'POST' });
    } else {
      await fetch(`/api/proxy/devices/${mac}/schedules/${s.uuid}/activate`, { method: 'POST' });
    }
    const updated = await apiFetch(`/devices/${mac}/schedules`);
    setSchedules(updated);
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

  function isInDateRange(s: Schedule): boolean {
    const today = new Date().toISOString().split('T')[0];
    return today >= s.start_date && (!s.end_date || today <= s.end_date);
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
              onSave={(p) => {
                const existing = programs.findIndex(x => x.id === p.id);
                const updated = existing >= 0
                  ? programs.map((x, i) => i === existing ? p : x)
                  : [...programs, p];
                savePrograms(updated);
                syncProgramsToSchedule(updated);
                setEditingProgram(null);
              }}
              onCancel={() => setEditingProgram(null)}
            />
          ) : (
            <>
              {!schedules.some(s => s.active) && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 mb-4 text-sm text-amber-800">
                  <p className="font-medium">No active schedule</p>
                  <p className="mt-1">Programs need an active schedule to sync to. Create and activate a schedule in the Schedules tab first.</p>
                </div>
              )}

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
                    const dayLabels = DAY_NAMES.filter((_, i) => (prog.dayMask & DAY_BITS[i]) !== 0).join(', ');
                    const timeLabels = prog.startTimes.map(t => formatTime(t.hour, t.minute)).join(', ');
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
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              if (!confirm(`Delete program "${prog.name}"?`)) return;
                              const updated = programs.filter(x => x.id !== prog.id);
                              savePrograms(updated);
                              syncProgramsToSchedule(updated);
                            }}
                            className="text-xs text-red-400 hover:text-red-600 px-2 py-1"
                          >🗑</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {programs.length > 0 && (
                <div className="mt-6 bg-blue-50 border border-blue-100 rounded-xl px-5 py-4 text-sm text-blue-900 space-y-1.5">
                  <p className="font-semibold">How Programs Work</p>
                  <p>Each program runs its zones sequentially at the specified start times on the selected days.</p>
                  <p>Programs are expanded into individual zone runs and synced to the active schedule on the controller.</p>
                  <p><strong>{expandPrograms(programs).length}</strong> of <strong>48</strong> run slots used.</p>
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

      {/* ── Schedules tab ── */}
      {tab === 'Schedules' && (
        <div>
          {editingSchedule !== null ? (
            <ScheduleEditor
              schedule={editingSchedule === 'new' ? undefined : editingSchedule}
              zoneNames={Object.fromEntries(zones.map(z => [z.number, z.name || `Zone ${z.number}`]))}
              onSave={saveSchedule}
              onCancel={() => setEditingSchedule(null)}
            />
          ) : (
            <>
              <div className="flex justify-end mb-4">
                <button onClick={() => setEditingSchedule('new')}
                  disabled={schedules.length >= 5}
                  className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
                    schedules.length >= 5
                      ? 'bg-gray-100 text-gray-400 cursor-default'
                      : 'bg-[#1a56db] text-white hover:bg-blue-700'
                  }`}>
                  {schedules.length >= 5 ? 'Schedule limit reached (5/5)' : '+ New Schedule'}
                </button>
              </div>
              <div className="space-y-3">
                {schedules.length === 0 && (
                  <div className="bg-white rounded-xl shadow-sm p-8 text-center">
                    <p className="text-gray-600 font-medium mb-1">No schedules yet.</p>
                    <p className="text-gray-400 text-sm mb-4">Schedules created on the mobile app sync here automatically.</p>
                    <button onClick={() => setEditingSchedule('new')}
                      className="text-[#1a56db] text-sm font-semibold hover:underline">
                      Create your first schedule →
                    </button>
                  </div>
                )}
                {schedules.map(s => (
                  <div key={s.uuid}
                    onClick={() => setEditingSchedule(s)}
                    className="bg-white rounded-xl shadow-sm p-4 cursor-pointer hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0 mr-4">
                        <p className="font-semibold text-gray-900">{s.name}</p>
                        <p className="text-sm text-gray-400 mt-0.5">
                          {s.start_date} → {s.end_date ?? 'open-ended'}
                          {' · '}{(s.runs as unknown[]).length} zone schedule{(s.runs as unknown[]).length !== 1 ? 's' : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={e => { e.stopPropagation(); toggleScheduleActive(s); }}
                          className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
                            s.active && isInDateRange(s)
                              ? 'bg-green-100 text-green-700 hover:bg-green-200'
                              : s.active
                              ? 'bg-blue-50 text-blue-500 hover:bg-blue-100'
                              : 'bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600'
                          }`}>
                          {s.active && isInDateRange(s) ? '● Running' : s.active ? '● Enabled' : '○ Disabled'}
                        </button>
                        <button onClick={e => { e.stopPropagation(); deleteSchedule(s.uuid!); }}
                          className="text-xs text-red-400 hover:text-red-600 px-2 py-1">🗑</button>
                      </div>
                    </div>
                    {s.active && (
                      <div className="mt-3 pt-3 border-t border-gray-100" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => setWaagOpen(!waagOpen)}
                          className="text-xs font-semibold text-gray-500 hover:text-gray-700 transition-colors">
                          {waagOpen ? '▾' : '▸'} Week at a Glance
                        </button>
                        {waagOpen && (
                          <div className="mt-2">
                            <WeekGlance
                              runs={s.runs}
                              zoneNames={Object.fromEntries(zones.map(z => [z.number, z.name || `Zone ${z.number}`]))}
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="mt-6 bg-blue-50 border border-blue-100 rounded-xl px-5 py-4 text-sm text-blue-900 space-y-1.5">
                <p className="font-semibold">About Schedules</p>
                <p>The active schedule is determined by today's date — whichever schedule's date range includes today runs automatically.</p>
                <p>Up to <strong>5 schedules</strong> per controller, <strong>24 zone entries</strong> each. Date ranges must not overlap.</p>
              </div>
            </>
          )}
        </div>
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
