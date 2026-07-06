'use client';
import { useMemo, useState } from 'react';

type ScheduleRun = {
  zone_id: number;
  day_mask: number;
  hour: number;
  minute: number;
  duration_seconds: number;
  interval_days?: number;
};

type Props = {
  runs: ScheduleRun[];
  zoneNames?: Record<number, string>;
};

const DAY_NAMES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const DAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_BITS = [1, 2, 4, 8, 16, 32, 64];

const ZONE_COLORS: Record<number, string> = {
  1: '#6b7280', 2: '#ef4444', 3: '#f97316', 4: '#eab308',
  5: '#22c55e', 6: '#3b82f6', 7: '#6366f1', 8: '#a855f7',
};

const TIMELINE_HEIGHT = 280;
const MIN_PADDING_HOURS = 0.5;

type Block = { day: number; startMin: number; durationMin: number; zone_id: number };

function formatTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

function formatDuration(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function WeekGlance({ runs, zoneNames }: Props) {
  const [hovered, setHovered] = useState<{ block: Block; x: number; y: number } | null>(null);

  const { blocks, startHour, endHour } = useMemo(() => {
    if (!runs.length) return { blocks: [] as Block[], startHour: 6, endHour: 8 };

    let minTime = 24 * 60;
    let maxTime = 0;
    const blocks: Block[] = [];

    for (const run of runs) {
      if (run.interval_days && run.interval_days > 1) {
        for (let d = 0; d < 7; d++) {
          blocks.push({
            day: d,
            startMin: run.hour * 60 + run.minute,
            durationMin: Math.ceil(run.duration_seconds / 60),
            zone_id: run.zone_id,
          });
        }
        const s = run.hour * 60 + run.minute;
        const e = s + Math.ceil(run.duration_seconds / 60);
        minTime = Math.min(minTime, s);
        maxTime = Math.max(maxTime, e);
        continue;
      }
      for (let d = 0; d < 7; d++) {
        if (!(run.day_mask & DAY_BITS[d])) continue;
        const s = run.hour * 60 + run.minute;
        const e = s + Math.ceil(run.duration_seconds / 60);
        blocks.push({ day: d, startMin: s, durationMin: Math.ceil(run.duration_seconds / 60), zone_id: run.zone_id });
        minTime = Math.min(minTime, s);
        maxTime = Math.max(maxTime, e);
      }
    }

    const startHour = Math.max(0, Math.floor(minTime / 60) - MIN_PADDING_HOURS);
    const endHour = Math.min(24, Math.ceil(maxTime / 60) + MIN_PADDING_HOURS);

    return { blocks, startHour, endHour };
  }, [runs]);

  if (!runs.length) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-6 text-center text-gray-400 text-sm">
        No schedule to display
      </div>
    );
  }

  const totalMinutes = (endHour - startHour) * 60;
  // Pick tick interval: 15min if window <= 4h, 30min if <= 8h, else 60min
  const tickIntervalMin = totalMinutes <= 240 ? 15 : totalMinutes <= 480 ? 30 : 60;
  const tickLines: number[] = []; // in minutes from midnight
  const firstTick = Math.ceil((startHour * 60) / tickIntervalMin) * tickIntervalMin;
  for (let t = firstTick; t <= endHour * 60; t += tickIntervalMin) {
    tickLines.push(t);
  }

  // Current time indicator
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const nowDay = now.getDay();
  const nowInRange = nowMin >= startHour * 60 && nowMin <= endHour * 60;

  const uniqueZones = Array.from(new Set(runs.map(r => r.zone_id))).sort((a, b) => a - b);

  return (
    <div className="pt-2 relative">

      <div className="flex">
        {/* Time gutter */}
        <div className="w-10 relative flex-shrink-0" style={{ height: TIMELINE_HEIGHT }}>
          {tickLines.map(t => {
            const top = ((t - startHour * 60) / totalMinutes) * 100;
            const h = Math.floor(t / 60);
            const m = t % 60;
            const label = m === 0 ? `${String(h).padStart(2, '0')}:00` : `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
            return (
              <span
                key={t}
                className="absolute text-[9px] text-gray-400 right-1 -translate-y-1/2"
                style={{ top: `${top}%` }}
              >
                {label}
              </span>
            );
          })}
        </div>

        {/* Day columns */}
        <div className="flex-1 grid grid-cols-7 gap-px">
          {DAY_NAMES.map((name, dayIdx) => (
            <div key={dayIdx} className="flex flex-col">
              <div className="text-center text-[11px] font-semibold text-gray-500 mb-1">{name}</div>
              <div className="relative bg-gray-50 rounded" style={{ height: TIMELINE_HEIGHT }}>
                {/* Grid lines */}
                {tickLines.map(t => {
                  const top = ((t - startHour * 60) / totalMinutes) * 100;
                  const isHour = t % 60 === 0;
                  return (
                    <div
                      key={t}
                      className={`absolute left-0 right-0 border-t ${isHour ? 'border-gray-200' : 'border-gray-100'}`}
                      style={{ top: `${top}%` }}
                    />
                  );
                })}
                {/* Current time line */}
                {nowInRange && dayIdx === nowDay && (
                  <div
                    className="absolute left-0 right-0 h-[1.5px] bg-red-600 z-10"
                    style={{ top: `${((nowMin - startHour * 60) / totalMinutes) * 100}%` }}
                  />
                )}
                {/* Zone blocks */}
                {blocks
                  .filter(b => b.day === dayIdx)
                  .map((b, i) => {
                    const top = ((b.startMin - startHour * 60) / totalMinutes) * 100;
                    const height = Math.max(1.5, (b.durationMin / totalMinutes) * 100);
                    const color = ZONE_COLORS[b.zone_id] ?? '#94a3b8';
                    return (
                      <div
                        key={i}
                        className="absolute left-0.5 right-0.5 rounded-sm opacity-90 hover:opacity-100 hover:ring-2 hover:ring-white/60 transition-all cursor-pointer"
                        style={{ top: `${top}%`, height: `${height}%`, backgroundColor: color, zIndex: hovered?.block === b ? 10 : 1 }}
                        onMouseEnter={e => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          const parentRect = e.currentTarget.closest('.relative.pt-2')?.getBoundingClientRect();
                          setHovered({
                            block: b,
                            x: rect.left - (parentRect?.left ?? 0) + rect.width / 2,
                            y: rect.top - (parentRect?.top ?? 0) - 4,
                          });
                        }}
                        onMouseLeave={() => setHovered(null)}
                      >
                        {height > 6 && (
                          <span className="text-[9px] text-white font-medium px-0.5 leading-tight block truncate">
                            {zoneNames?.[b.zone_id] ?? `Z${b.zone_id}`}
                          </span>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Hover tooltip */}
      {hovered && (
        <div
          className="absolute z-50 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg pointer-events-none whitespace-nowrap -translate-x-1/2 -translate-y-full"
          style={{ left: hovered.x, top: hovered.y }}
        >
          <p className="font-semibold">{zoneNames?.[hovered.block.zone_id] ?? `Zone ${hovered.block.zone_id}`}</p>
          <p className="text-gray-300 mt-0.5">
            {DAY_FULL[hovered.block.day]} · {formatTime(hovered.block.startMin)} – {formatTime(hovered.block.startMin + hovered.block.durationMin)}
          </p>
          <p className="text-gray-300">{formatDuration(hovered.block.durationMin)}</p>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-gray-100">
        {uniqueZones.map(id => (
          <div key={id} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: ZONE_COLORS[id] ?? '#94a3b8' }} />
            <span className="text-xs text-gray-500">{zoneNames?.[id] ?? `Zone ${id}`}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
