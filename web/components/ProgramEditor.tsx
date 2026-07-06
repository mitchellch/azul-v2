'use client';
import { useState } from 'react';

export type ProgramTime = { hour: number; minute: number };

export type ProgramZone = {
  zoneId: number;
  durationSeconds: number;
  order: number;
};

export type Program = {
  id: string;
  name: string;
  startTimes: ProgramTime[];
  dayMask: number;
  intervalDays?: number;
  zones: ProgramZone[];
};

type ScheduleRun = {
  zone_id: number;
  day_mask: number;
  hour: number;
  minute: number;
  duration_seconds: number;
  interval_days?: number;
};

export const DAY_NAMES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
export const DAY_BITS  = [1, 2, 4, 8, 16, 32, 64];

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function formatTime(h: number, m: number): string {
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 || 12;
  return `${hh}:${String(m).padStart(2, '0')} ${ampm}`;
}

function formatDuration(secs: number): string {
  if (secs < 60) return `${secs}s`;
  if (secs % 60 === 0) return `${secs / 60}m`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

export function expandPrograms(programs: Program[]): ScheduleRun[] {
  const runs: ScheduleRun[] = [];
  for (const program of programs) {
    for (const startTime of program.startTimes) {
      let offsetMinutes = 0;
      const sorted = [...program.zones].sort((a, b) => a.order - b.order);
      for (const zone of sorted) {
        const totalMinutes = startTime.minute + offsetMinutes;
        runs.push({
          zone_id: zone.zoneId,
          day_mask: program.dayMask,
          hour: startTime.hour + Math.floor(totalMinutes / 60),
          minute: totalMinutes % 60,
          duration_seconds: zone.durationSeconds,
          interval_days: program.intervalDays ?? 1,
        });
        offsetMinutes += Math.ceil(zone.durationSeconds / 60);
      }
    }
  }
  return runs;
}

// --- Editor component ---

type Props = {
  program?: Program;
  zoneNames: Record<number, string>;
  onSave: (p: Program) => void;
  onCancel: () => void;
};

const DURATION_OPTIONS = [
  { label: '5m', secs: 300 },
  { label: '10m', secs: 600 },
  { label: '15m', secs: 900 },
  { label: '20m', secs: 1200 },
  { label: '30m', secs: 1800 },
  { label: '45m', secs: 2700 },
  { label: '60m', secs: 3600 },
];

function blankProgram(): Program {
  return {
    id: uuid(),
    name: '',
    startTimes: [{ hour: 6, minute: 0 }],
    dayMask: 0x7F,
    zones: [],
  };
}

export function ProgramEditor({ program, zoneNames, onSave, onCancel }: Props) {
  const [p, setP] = useState<Program>(program ? { ...program, zones: [...program.zones], startTimes: [...program.startTimes] } : blankProgram());
  const [timePickerIdx, setTimePickerIdx] = useState<number | null>(null);
  const [timeHour, setTimeHour] = useState(6);
  const [timeMinute, setTimeMinute] = useState(0);

  const allZoneIds = Object.keys(zoneNames).map(Number).sort((a, b) => a - b);

  function toggleDay(bit: number) {
    setP(prev => ({ ...prev, dayMask: prev.dayMask ^ bit }));
  }

  function addStartTime() {
    if (p.startTimes.length >= 6) return;
    setP(prev => ({ ...prev, startTimes: [...prev.startTimes, { hour: 12, minute: 0 }] }));
  }

  function removeStartTime(idx: number) {
    setP(prev => ({ ...prev, startTimes: prev.startTimes.filter((_, i) => i !== idx) }));
  }

  function updateStartTime(idx: number, hour: number, minute: number) {
    setP(prev => {
      const st = [...prev.startTimes];
      st[idx] = { hour, minute };
      return { ...prev, startTimes: st };
    });
  }

  function toggleZone(zoneId: number) {
    setP(prev => {
      const existing = prev.zones.find(z => z.zoneId === zoneId);
      if (existing) {
        return { ...prev, zones: prev.zones.filter(z => z.zoneId !== zoneId) };
      }
      const maxOrder = prev.zones.reduce((m, z) => Math.max(m, z.order), 0);
      return { ...prev, zones: [...prev.zones, { zoneId, durationSeconds: 600, order: maxOrder + 1 }] };
    });
  }

  function updateZoneDuration(zoneId: number, secs: number) {
    setP(prev => ({
      ...prev,
      zones: prev.zones.map(z => z.zoneId === zoneId ? { ...z, durationSeconds: secs } : z),
    }));
  }

  function handleSave() {
    if (!p.name.trim()) { alert('Name is required'); return; }
    if (p.startTimes.length === 0) { alert('At least one start time is required'); return; }
    if (p.zones.length === 0) { alert('Select at least one zone'); return; }
    if (p.dayMask === 0) { alert('Select at least one day'); return; }
    onSave(p);
  }

  return (
    <div className="bg-white rounded-xl shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <button onClick={onCancel} className="text-sm text-gray-500 hover:text-gray-700">← Back</button>
        <h3 className="font-semibold text-gray-900">{program ? 'Edit Program' : 'New Program'}</h3>
        <button onClick={handleSave} className="text-sm font-semibold text-[#1a56db] hover:text-blue-700">Save</button>
      </div>

      <div className="p-5 space-y-6">
        {/* Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Program Name</label>
          <input
            type="text"
            value={p.name}
            onChange={e => setP(prev => ({ ...prev, name: e.target.value }))}
            placeholder="e.g., Lawn, Drip Lines, Garden"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a56db]"
          />
        </div>

        {/* Start Times */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Start Times</label>
          <div className="space-y-2">
            {p.startTimes.map((st, i) => (
              <div key={i} className="flex items-center gap-2">
                <button
                  onClick={() => { setTimeHour(st.hour); setTimeMinute(st.minute); setTimePickerIdx(i); }}
                  className="flex-1 text-left text-sm border border-gray-200 rounded-lg px-3 py-2 hover:border-[#1a56db] transition-colors"
                >
                  {formatTime(st.hour, st.minute)}
                </button>
                {p.startTimes.length > 1 && (
                  <button onClick={() => removeStartTime(i)} className="text-red-400 hover:text-red-600 text-sm px-2">✕</button>
                )}
              </div>
            ))}
          </div>
          {p.startTimes.length < 6 && (
            <button onClick={addStartTime} className="text-sm text-[#1a56db] hover:text-blue-700 mt-2 font-medium">
              + Add Start Time
            </button>
          )}
        </div>

        {/* Time picker modal */}
        {timePickerIdx !== null && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setTimePickerIdx(null)}>
            <div className="bg-white rounded-xl shadow-xl w-72 p-5" onClick={e => e.stopPropagation()}>
              <p className="text-sm font-medium text-gray-700 mb-3">Set Time</p>
              <div className="flex items-center gap-2 justify-center mb-4">
                <select
                  value={timeHour}
                  onChange={e => setTimeHour(Number(e.target.value))}
                  className="text-lg border border-gray-200 rounded-md px-2 py-1"
                >
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>{String(i).padStart(2, '0')}</option>
                  ))}
                </select>
                <span className="text-lg font-bold">:</span>
                <select
                  value={timeMinute}
                  onChange={e => setTimeMinute(Number(e.target.value))}
                  className="text-lg border border-gray-200 rounded-md px-2 py-1"
                >
                  {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map(m => (
                    <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setTimePickerIdx(null)} className="text-sm text-gray-500 px-3 py-1.5 rounded-md hover:bg-gray-100">Cancel</button>
                <button
                  onClick={() => { updateStartTime(timePickerIdx, timeHour, timeMinute); setTimePickerIdx(null); }}
                  className="text-sm font-semibold text-white bg-[#1a56db] px-3 py-1.5 rounded-md hover:bg-blue-700"
                >Done</button>
              </div>
            </div>
          </div>
        )}

        {/* Repeat */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Repeat</label>
          {/* Mode toggle */}
          <div className="inline-flex bg-gray-100 rounded-lg p-0.5 mb-3">
            <button
              onClick={() => setP(prev => ({ ...prev, intervalDays: undefined, dayMask: prev.dayMask || 0x7F }))}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                !p.intervalDays || p.intervalDays <= 1
                  ? 'bg-white shadow text-gray-900'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >Days of week</button>
            <button
              onClick={() => setP(prev => ({ ...prev, intervalDays: prev.intervalDays && prev.intervalDays > 1 ? prev.intervalDays : 2 }))}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                p.intervalDays && p.intervalDays > 1
                  ? 'bg-white shadow text-gray-900'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >Every N days</button>
          </div>

          {(!p.intervalDays || p.intervalDays <= 1) ? (
            <div className="flex items-center gap-2">
              <div className="flex gap-1.5">
                {DAY_NAMES.map((name, i) => {
                  const active = (p.dayMask & DAY_BITS[i]) !== 0;
                  return (
                    <button
                      key={name}
                      onClick={() => toggleDay(DAY_BITS[i])}
                      className={`w-10 h-10 rounded-lg text-xs font-semibold transition-colors ${
                        active
                          ? 'bg-[#1a56db] text-white'
                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}
                    >
                      {name}
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => setP(prev => ({ ...prev, dayMask: 0x7F }))}
                className="text-sm text-[#1a56db] font-medium hover:text-blue-700 ml-2"
              >All</button>
              <button
                onClick={() => setP(prev => ({ ...prev, dayMask: 0 }))}
                className="text-sm text-gray-400 font-medium hover:text-gray-600"
              >Clear</button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-700">Every</span>
              <input
                type="number"
                min={2}
                max={30}
                value={p.intervalDays}
                onChange={e => setP(prev => ({ ...prev, intervalDays: Math.max(2, Number(e.target.value)) }))}
                className="w-16 text-sm border border-gray-200 rounded-md px-2 py-1.5 text-center focus:outline-none focus:ring-2 focus:ring-[#1a56db]"
              />
              <span className="text-sm text-gray-700">days</span>
            </div>
          )}
        </div>

        {/* Zones & Durations */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Zones &amp; Durations</label>
          <div className="space-y-2">
            {allZoneIds.map(zoneId => {
              const included = p.zones.find(z => z.zoneId === zoneId);
              return (
                <div key={zoneId} className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                  included ? 'border-[#1a56db] bg-blue-50/50' : 'border-gray-200'
                }`}>
                  <button
                    onClick={() => toggleZone(zoneId)}
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                      included ? 'border-[#1a56db] bg-[#1a56db]' : 'border-gray-300'
                    }`}
                  >
                    {included && <span className="text-white text-xs font-bold">✓</span>}
                  </button>
                  <span className="text-sm text-gray-900 flex-1">{zoneNames[zoneId] ?? `Zone ${zoneId}`}</span>
                  {included && (
                    <select
                      value={included.durationSeconds}
                      onChange={e => updateZoneDuration(zoneId, Number(e.target.value))}
                      className="text-sm border border-gray-200 rounded-md px-2 py-1 bg-white"
                    >
                      {DURATION_OPTIONS.map(opt => (
                        <option key={opt.secs} value={opt.secs}>{opt.label}</option>
                      ))}
                    </select>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Summary */}
        {p.zones.length > 0 && p.startTimes.length > 0 && (
          <div className="bg-gray-50 rounded-lg px-4 py-3 text-sm text-gray-600">
            <span className="font-medium">Total runs:</span>{' '}
            {p.zones.length * p.startTimes.length} per active day
            {' · '}
            <span className="font-medium">Total water time:</span>{' '}
            {formatDuration(p.zones.reduce((sum, z) => sum + z.durationSeconds, 0) * p.startTimes.length)} per day
          </div>
        )}
      </div>
    </div>
  );
}
