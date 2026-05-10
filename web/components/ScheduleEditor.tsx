'use client';
import { useState } from 'react';

export type ScheduleRun = {
  zone_id: number;
  day_mask: number;
  hour: number;
  minute: number;
  duration_seconds: number;
  interval_days?: number;
};

export type Schedule = {
  uuid?: string;
  name: string;
  start_date: string;
  end_date: string | null;
  active?: boolean;
  runs: ScheduleRun[];
};

const DAY_NAMES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const DAY_BITS  = [1, 2, 4, 8, 16, 32, 64];

function today(): string { return new Date().toISOString().slice(0, 10); }

function blankRun(): ScheduleRun {
  return { zone_id: 1, day_mask: 127, hour: 7, minute: 0, duration_seconds: 300 };
}

function blankSchedule(): Schedule {
  return { name: '', start_date: today(), end_date: null, runs: [blankRun()] };
}

function pad(n: number) { return String(n).padStart(2, '0'); }

function formatDur(secs: number): string {
  if (secs < 60) return `${secs}s`;
  if (secs % 60 === 0) return `${secs / 60}m`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

const DURATION_OPTIONS = [
  { label: '1m',  value: 60 },
  { label: '5m',  value: 300 },
  { label: '10m', value: 600 },
  { label: '15m', value: 900 },
  { label: '20m', value: 1200 },
  { label: '30m', value: 1800 },
  { label: '45m', value: 2700 },
  { label: '60m', value: 3600 },
];

interface Props {
  schedule?: Schedule;
  zoneNames: Record<number, string>;
  onSave: (s: Schedule) => Promise<void>;
  onCancel: () => void;
}

export function ScheduleEditor({ schedule, zoneNames, onSave, onCancel }: Props) {
  const [s, setS]       = useState<Schedule>(schedule ? JSON.parse(JSON.stringify(schedule)) : blankSchedule());
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');
  const isDirty = !schedule || JSON.stringify(s) !== JSON.stringify(schedule);

  function updateRun(i: number, patch: Partial<ScheduleRun>) {
    setS(prev => { const runs = [...prev.runs]; runs[i] = { ...runs[i], ...patch }; return { ...prev, runs }; });
  }

  async function handleSave() {
    if (!s.name.trim()) { setError('Name required'); return; }
    if (!s.runs.length) { setError('At least one zone schedule required'); return; }
    setSaving(true); setError('');
    try { await onSave(s); }
    catch (e: any) { setError(e.message); setSaving(false); }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <h2 className="font-bold text-gray-900 text-lg">{schedule?.uuid ? 'Edit Schedule' : 'New Schedule'}</h2>
        <div className="flex items-center gap-3">
          <button onClick={onCancel} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5">Cancel</button>
          <button onClick={handleSave} disabled={saving || !isDirty}
            className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
              isDirty && !saving ? 'bg-[#1a56db] text-white hover:bg-blue-700' : 'bg-gray-100 text-gray-400 cursor-default'
            }`}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {error && <p className="text-red-500 text-sm px-6 pt-3">{error}</p>}

      <div className="px-6 py-5 space-y-5">
        {/* Name */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Name</label>
          <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a56db]"
            value={s.name} onChange={e => setS(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Summer Watering" />
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Start Date</label>
            <input type="date" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a56db]"
              value={s.start_date} onChange={e => setS(p => ({ ...p, start_date: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">End Date</label>
            <div className="flex gap-2">
              <input type="date" className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a56db]"
                value={s.end_date ?? ''} onChange={e => setS(p => ({ ...p, end_date: e.target.value || null }))} />
              {s.end_date && (
                <button onClick={() => setS(p => ({ ...p, end_date: null }))}
                  className="px-2 text-gray-400 hover:text-gray-600 text-sm">✕</button>
              )}
            </div>
            {!s.end_date && <p className="text-xs text-gray-400 mt-1">Leave blank for open-ended</p>}
          </div>
        </div>

        {/* Zone schedules */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Zone Schedules</label>
            <button onClick={() => setS(p => ({ ...p, runs: [...p.runs, blankRun()] }))}
              className="text-xs font-semibold text-[#1a56db] hover:underline">+ Add Zone</button>
          </div>
          <div className="space-y-4">
            {s.runs.map((run, i) => (
              <RunEditor key={i} run={run} index={i} zoneNames={zoneNames} canRemove={s.runs.length > 1}
                onChange={patch => updateRun(i, patch)}
                onRemove={() => setS(p => ({ ...p, runs: p.runs.filter((_, idx) => idx !== i) }))} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function RunEditor({ run, index, zoneNames, canRemove, onChange, onRemove }: {
  run: ScheduleRun; index: number; zoneNames: Record<number, string>;
  canRemove: boolean; onChange: (p: Partial<ScheduleRun>) => void; onRemove: () => void;
}) {
  const useInterval = (run.interval_days ?? 1) > 1;

  return (
    <div className="border border-gray-200 rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-400 uppercase">Zone Schedule {index + 1}</span>
        {canRemove && (
          <button onClick={onRemove} className="text-xs text-red-400 hover:text-red-600">Remove</button>
        )}
      </div>

      {/* Zone + Time side by side */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Zone</label>
          <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a56db]"
            value={run.zone_id} onChange={e => onChange({ zone_id: Number(e.target.value) })}>
            {Array.from({ length: 8 }, (_, i) => i + 1).map(n => (
              <option key={n} value={n}>{zoneNames[n] ?? `Zone ${n}`}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Start Time</label>
          <div className="flex gap-1 items-center">
            <input type="number" min="0" max="23" className="w-16 border border-gray-200 rounded-lg px-2 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-[#1a56db]"
              value={pad(run.hour)} onChange={e => onChange({ hour: Math.min(23, Math.max(0, Number(e.target.value))) })} />
            <span className="text-gray-400 font-bold">:</span>
            <input type="number" min="0" max="59" step="5" className="w-16 border border-gray-200 rounded-lg px-2 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-[#1a56db]"
              value={pad(run.minute)} onChange={e => onChange({ minute: Math.min(59, Math.max(0, Number(e.target.value))) })} />
          </div>
        </div>
      </div>

      {/* Duration */}
      <div>
        <label className="block text-xs text-gray-500 mb-1">Duration — {formatDur(run.duration_seconds)}</label>
        <div className="flex flex-wrap gap-2">
          {DURATION_OPTIONS.map(opt => (
            <button key={opt.value} onClick={() => onChange({ duration_seconds: opt.value })}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                run.duration_seconds === opt.value ? 'bg-[#1a56db] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Schedule mode toggle */}
      <div>
        <label className="block text-xs text-gray-500 mb-2">Repeat</label>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit mb-3">
          <button onClick={() => onChange({ interval_days: 1 })}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${!useInterval ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>
            Days of week
          </button>
          <button onClick={() => onChange({ interval_days: 2 })}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${useInterval ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>
            Every N days
          </button>
        </div>

        {useInterval ? (
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600">Every</span>
            <div className="flex items-center gap-2">
              <button onClick={() => onChange({ interval_days: Math.max(2, (run.interval_days ?? 2) - 1) })}
                className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-700 font-bold">−</button>
              <span className="text-lg font-bold text-[#1a56db] w-8 text-center">{run.interval_days ?? 2}</span>
              <button onClick={() => onChange({ interval_days: Math.min(30, (run.interval_days ?? 2) + 1) })}
                className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-700 font-bold">+</button>
            </div>
            <span className="text-sm text-gray-600">days</span>
          </div>
        ) : (
          <div className="flex flex-wrap gap-1">
            {DAY_NAMES.map((name, d) => {
              const active = !!(run.day_mask & DAY_BITS[d]);
              return (
                <button key={d} onClick={() => onChange({ day_mask: run.day_mask ^ DAY_BITS[d] })}
                  className={`w-9 h-9 rounded-lg text-xs font-semibold transition-colors ${
                    active ? 'bg-[#1a56db] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}>
                  {name}
                </button>
              );
            })}
            <button onClick={() => onChange({ day_mask: 127 })} className="px-2 h-9 text-xs text-[#1a56db] hover:underline ml-1">All</button>
            <button onClick={() => onChange({ day_mask: 0 })} className="px-2 h-9 text-xs text-gray-400 hover:underline">Clear</button>
          </div>
        )}
      </div>
    </div>
  );
}
