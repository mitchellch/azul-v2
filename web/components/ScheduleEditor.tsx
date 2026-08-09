'use client';
import { useEffect, useRef, useState, useMemo } from 'react';
import { MAX_ZONES } from '@/lib/constants';

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

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

// Days in each month (non-leap; scheduler handles year-end edge cases)
const DAYS_IN_MONTH = [31,29,31,30,31,30,31,31,30,31,30,31];

function daysForMonth(month: number) {
  return Array.from({ length: DAYS_IN_MONTH[month - 1] }, (_, i) => i + 1);
}

// Parse "MM-DD" string into { month, day }
function parseMD(md: string): { month: number; day: number } {
  const [m, d] = md.split('-').map(Number);
  return { month: m || 1, day: d || 1 };
}

// Format { month, day } to "MM-DD"
function formatMD(month: number, day: number): string {
  return `${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}

const DAY_NAMES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const DAY_BITS  = [1, 2, 4, 8, 16, 32, 64];

function today(): string { return new Date().toISOString().slice(0, 10); }

function blankRun(existingRuns: ScheduleRun[] = []): ScheduleRun {
  const used = new Set(existingRuns.map(r => r.zone_id));
  let zone_id = 1;
  for (let i = 1; i <= MAX_ZONES; i++) { if (!used.has(i)) { zone_id = i; break; } }
  const now = new Date();
  return { zone_id, day_mask: 127, hour: now.getHours(), minute: now.getMinutes(), duration_seconds: 300 };
}

function blankSchedule(): Schedule {
  return { name: '', start_date: today(), end_date: null, runs: [blankRun([])] };
}

function pad(n: number) { return String(n).padStart(2, '0'); }

function formatDur(secs: number): string {
  if (secs < 60)   return `${secs}s`;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0)          return `${h}h`;
  return `${m}m`;
}

const SCHED_DEBUG = process.env.NEXT_PUBLIC_DEBUG_MODE === 'true';

function sliderToSecs(pos: number): number {
  if (SCHED_DEBUG) {
    if (pos <= 25) {
      const secs = 5 + (pos / 25) * 25;
      return Math.round(secs / 5) * 5;
    }
    const secs = 30 + ((pos - 25) / 75) * 270;
    return Math.round(secs / 5) * 5;
  }
  if (pos <= 25) {
    const mins = Math.round((pos / 25) * 59) + 1;
    return mins * 60;
  }
  const mins = 60 + Math.round(((pos - 25) / 75) * 180);
  return mins * 60;
}
function secsToSlider(secs: number): number {
  if (SCHED_DEBUG) {
    const s = Math.max(5, Math.min(secs, 300));
    if (s <= 30) return ((s - 5) / 25) * 25;
    return 25 + ((s - 30) / 270) * 75;
  }
  const mins = secs / 60;
  if (mins <= 60) return ((mins - 1) / 59) * 25;
  return 25 + ((mins - 60) / 180) * 75;
}

const DUR_LABELS = SCHED_DEBUG
  ? [
      { label: '5s',  pos: secsToSlider(5) },
      { label: '15s', pos: secsToSlider(15) },
      { label: '30s', pos: secsToSlider(30) },
      { label: '1m',  pos: secsToSlider(60) },
      { label: '3m',  pos: secsToSlider(180) },
      { label: '5m',  pos: secsToSlider(300) },
    ]
  : [
      { label: '5m',   pos: secsToSlider(300) },
      { label: '15m',  pos: secsToSlider(900) },
      { label: '30m',  pos: secsToSlider(1800) },
      { label: '1h',   pos: 25 },
      { label: '2h',   pos: secsToSlider(7200) },
      { label: '3h',   pos: secsToSlider(10800) },
      { label: '4h',   pos: 100 },
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
  const isDirty = useMemo(() => {
    if (!schedule) return true;
    const sCompare = { ...s };
    const scheduleCompare = { ...schedule };
    delete sCompare.active;
    delete scheduleCompare.active;
    return JSON.stringify(sCompare) !== JSON.stringify(scheduleCompare);
  }, [s, schedule]);
  const nameRef      = useRef<HTMLInputElement>(null);
  const [expandedRun, setExpandedRun] = useState<number | null>(null);
  const YEAR_PLACEHOLDER = String(new Date().getFullYear());

  // "Any year" means only month+day matter — we store 1970 as the canonical year
  const isAnyYear = (date: string | null) => !date || date.startsWith(YEAR_PLACEHOLDER) || !date;
  const [anyYear, setAnyYear] = useState(isAnyYear(s.start_date));

  function toggleAnyYear(on: boolean) {
    setAnyYear(on);
    if (on) {
      // Strip year — keep only month/day by setting year to 1970
      const startMD = s.start_date.slice(5);  // MM-DD
      const endMD   = s.end_date?.slice(5);
      setS(p => ({
        ...p,
        start_date: `${YEAR_PLACEHOLDER}-${startMD}`,
        end_date:   endMD ? `${YEAR_PLACEHOLDER}-${endMD}` : null,
      }));
    }
  }

  useEffect(() => { nameRef.current?.focus(); }, []);

  function updateRun(i: number, patch: Partial<ScheduleRun>) {
    setS(prev => { const runs = [...prev.runs]; runs[i] = { ...runs[i], ...patch }; return { ...prev, runs }; });
  }

  function findOverlap(): string | null {
    for (let i = 0; i < s.runs.length; i++) {
      for (let j = i + 1; j < s.runs.length; j++) {
        const a = s.runs[i], b = s.runs[j];
        if (a.zone_id !== b.zone_id) continue;
        // Only check runs that share at least one day (or both use interval)
        const useIntervalA = (a.interval_days ?? 1) > 1;
        const useIntervalB = (b.interval_days ?? 1) > 1;
        if (!useIntervalA && !useIntervalB && !(a.day_mask & b.day_mask)) continue;
        // Check time overlap: a starts before b ends AND b starts before a ends
        const aStart = a.hour * 60 + a.minute;
        const aEnd   = aStart + Math.ceil(a.duration_seconds / 60);
        const bStart = b.hour * 60 + b.minute;
        const bEnd   = bStart + Math.ceil(b.duration_seconds / 60);
        if (aStart < bEnd && bStart < aEnd) {
          const zoneName = zoneNames[a.zone_id] ?? `Zone ${a.zone_id}`;
          return `${zoneName} has two overlapping runs on the same day.`;
        }
      }
    }
    return null;
  }

  async function handleSave() {
    if (!s.name.trim()) { setError('Name required'); return; }
    if (!s.runs.length) { setError('At least one zone schedule required'); return; }
    const overlap = findOverlap();
    if (overlap) { setError(overlap); return; }
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
          <input ref={nameRef} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a56db]"
            value={s.name} onChange={e => setS(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Summer Watering" />
        </div>

        {/* Any Year toggle */}
        <div>
          <label className="flex items-center gap-2 cursor-pointer w-fit">
            <input type="checkbox" checked={anyYear} onChange={e => toggleAnyYear(e.target.checked)}
              className="w-4 h-4 accent-[#1a56db]" />
            <span className="text-sm font-medium text-gray-700">Repeat every year</span>
          </label>
          <p className="text-xs text-gray-400 mt-1 ml-6">
            {anyYear
              ? 'Only the month and day matter — this schedule runs the same dates each year.'
              : 'This schedule runs once during the specified date range only.'}
          </p>
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="start-date" className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Start
            </label>
            {anyYear ? (
              <MonthDayPicker
                id="start-date"
                value={s.start_date.slice(5)}
                onChange={md => setS(p => ({ ...p, start_date: `${YEAR_PLACEHOLDER}-${md}` }))}
              />
            ) : (
              <input id="start-date" type="date"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a56db]"
                value={s.start_date}
                onChange={e => setS(p => ({ ...p, start_date: e.target.value }))} />
            )}
          </div>
          <div>
            <label htmlFor="end-date" className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              End <span className="font-normal text-gray-400">(optional)</span>
            </label>
            {anyYear ? (
              <div className="flex items-center gap-2">
                <MonthDayPicker
                  id="end-date"
                  value={s.end_date?.slice(5) ?? ''}
                  placeholder
                  onChange={md => setS(p => ({ ...p, end_date: md ? `${YEAR_PLACEHOLDER}-${md}` : null }))}
                />
                {s.end_date && (
                  <button aria-label="Clear end date" onClick={() => setS(p => ({ ...p, end_date: null }))}
                    className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
                )}
              </div>
            ) : (
              <div className="flex gap-2">
                <input id="end-date" type="date"
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a56db]"
                  value={s.end_date ?? ''}
                  onChange={e => setS(p => ({ ...p, end_date: e.target.value || null }))} />
                {s.end_date && (
                  <button aria-label="Clear end date" onClick={() => setS(p => ({ ...p, end_date: null }))}
                    className="px-2 text-gray-400 hover:text-gray-600">✕</button>
                )}
              </div>
            )}
            {!s.end_date && <p className="text-xs text-gray-400 mt-1">Leave blank — runs all season</p>}
          </div>
        </div>

        {/* Zone schedules */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Zone Schedules</label>
            <button onClick={() => {
              setExpandedRun(s.runs.length);
              setS(p => ({ ...p, runs: [...p.runs, blankRun(p.runs)] }));
            }} className="text-xs font-semibold text-[#1a56db] hover:underline">+ Add Zone</button>
          </div>
          <div className="space-y-3">
            {[...s.runs]
              .map((run, i) => ({ run, i }))
              .sort((a, b) =>
                a.run.zone_id !== b.run.zone_id
                  ? a.run.zone_id - b.run.zone_id
                  : (a.run.hour * 60 + a.run.minute) - (b.run.hour * 60 + b.run.minute)
              )
              .map(({ run, i }) => (
                <RunEditor key={i} run={run} index={i} zoneNames={zoneNames} canRemove={s.runs.length > 1}
                  expanded={expandedRun === i}
                  onExpand={() => setExpandedRun(expandedRun === i ? null : i)}
                  onChange={patch => updateRun(i, patch)}
                  onClone={() => {
                    const next = blankRun(s.runs);
                    const cloned = { ...run, zone_id: next.zone_id };
                    setExpandedRun(s.runs.length);
                    setS(p => ({ ...p, runs: [...p.runs, cloned] }));
                  }}
                  onRemove={() => {
                    setS(p => ({ ...p, runs: p.runs.filter((_, idx) => idx !== i) }));
                    if (expandedRun === i) setExpandedRun(null);
                  }} />
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function formatTime12(hour: number, minute: number): string {
  const ampm = hour < 12 ? 'AM' : 'PM';
  const h = hour % 12 || 12;
  return `${h}:${pad(minute)} ${ampm}`;
}

function runSummary(run: ScheduleRun, zoneNames: Record<number, string>): { zone: string; time: string; dur: string; sched: string } {
  return {
    zone:  zoneNames[run.zone_id] ?? `Zone ${run.zone_id}`,
    time:  formatTime12(run.hour, run.minute),
    dur:   formatDur(run.duration_seconds),
    sched: (run.interval_days ?? 1) > 1
      ? `every ${run.interval_days} days`
      : ['Su','Mo','Tu','We','Th','Fr','Sa'].filter((_, d) => run.day_mask & (1 << d)).join(' ') || 'no days',
  };
}

function RunEditor({ run, index, zoneNames, canRemove, expanded, onExpand, onChange, onClone, onRemove }: {
  run: ScheduleRun; index: number; zoneNames: Record<number, string>;
  canRemove: boolean; expanded: boolean; onExpand: () => void;
  onChange: (p: Partial<ScheduleRun>) => void; onClone: () => void; onRemove: () => void;
}) {
  const useInterval = (run.interval_days ?? 1) > 1;

  if (!expanded) {
    const s = runSummary(run, zoneNames);
    return (
      <div className="flex items-center gap-2 border border-gray-200 rounded-xl px-4 py-3 hover:border-gray-300 transition-colors cursor-pointer"
        onClick={onExpand}>
        <span className="text-sm text-gray-700 truncate w-36 flex-shrink-0">{s.zone}</span>
        <span className="text-sm text-gray-500 w-20 flex-shrink-0 tabular-nums">{s.time}</span>
        <span className="text-sm text-gray-400 w-12 flex-shrink-0">{s.dur}</span>
        <span className="text-sm text-gray-400 truncate flex-1">{s.sched}</span>
        <button type="button" onClick={e => { e.stopPropagation(); onClone(); }}
          aria-label="Clone zone schedule"
          className="text-gray-300 hover:text-[#1a56db] transition-colors flex-shrink-0 text-sm leading-none px-1">
          ⧉
        </button>
        {canRemove && (
          <button type="button" onClick={e => { e.stopPropagation(); onRemove(); }}
            aria-label="Remove zone schedule"
            className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0 text-base leading-none px-1">
            ✕
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="border border-[#1a56db] rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <button type="button" onClick={onExpand} className="text-xs text-gray-400 hover:text-gray-600">▾ Collapse</button>
        <div className="flex items-center gap-3">
          <button type="button" onClick={onClone} className="text-xs text-[#1a56db] hover:underline">Clone</button>
          {canRemove && (
            <button onClick={onRemove} className="text-xs text-red-400 hover:text-red-600">Remove</button>
          )}
        </div>
      </div>

      {/* Zone + Time */}
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
          <input type="time"
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a56db]"
            value={`${pad(run.hour)}:${pad(run.minute)}`}
            onChange={e => {
              const [h, m] = e.target.value.split(':').map(Number);
              if (!isNaN(h) && !isNaN(m)) onChange({ hour: h, minute: m });
            }} />
        </div>
      </div>

      {/* Duration slider */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <label className="text-xs text-gray-500">Duration:</label>
          <span className="text-base font-bold text-[#1a56db]">{formatDur(run.duration_seconds)}</span>
        </div>
        <input type="range" min="0" max="100" step="1"
          value={secsToSlider(run.duration_seconds)}
          onChange={e => onChange({ duration_seconds: sliderToSecs(Number(e.target.value)) })}
          className="w-full accent-[#1a56db]"
        />
        <div className="relative h-4 mt-1">
          {DUR_LABELS.map(({ label, pos }) => (
            <span key={label} className="absolute text-xs text-gray-400"
              style={{ left: `${pos}%`, transform: pos === 0 ? 'none' : pos === 100 ? 'translateX(-100%)' : 'translateX(-50%)' }}>
              {label}
            </span>
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

// Accessible month + day selector using native <select> elements
function MonthDayPicker({ id, value, onChange, placeholder }: {
  id?: string;
  value: string;       // "MM-DD" or "" for unset
  onChange: (md: string | null) => void;
  placeholder?: boolean;
}) {
  const { month, day } = value ? parseMD(value) : { month: 0, day: 0 };

  function handleMonth(m: number) {
    const clampedDay = m > 0 ? Math.min(day || 1, DAYS_IN_MONTH[m - 1]) : 0;
    if (m === 0) { onChange(null); return; }
    onChange(formatMD(m, clampedDay || 1));
  }

  function handleDay(d: number) {
    if (month === 0) return;
    onChange(formatMD(month, d));
  }

  const selectClass = "border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a56db] bg-white";

  return (
    <div className="flex gap-2">
      <select id={id} aria-label="Month" value={month} onChange={e => handleMonth(Number(e.target.value))}
        className={`w-36 ${selectClass}`}>
        {placeholder && <option value={0}>Month</option>}
        {MONTHS.map((name, i) => (
          <option key={i + 1} value={i + 1}>{name}</option>
        ))}
      </select>
      <select aria-label="Day" value={day} onChange={e => handleDay(Number(e.target.value))}
        disabled={month === 0}
        className={`w-16 ${selectClass} ${month === 0 ? 'opacity-40' : ''}`}>
        {placeholder && <option value={0}>Day</option>}
        {daysForMonth(month || 1).map(d => (
          <option key={d} value={d}>{d}</option>
        ))}
      </select>
    </div>
  );
}
