import { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView } from 'react-native';

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
  zones?: { id: number; name: string }[];
  expanded?: boolean;
};

const DAY_NAMES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const DAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_BITS = [1, 2, 4, 8, 16, 32, 64];

const ZONE_COLORS: Record<number, string> = {
  1: '#6b7280', 2: '#ef4444', 3: '#f97316', 4: '#eab308',
  5: '#22c55e', 6: '#3b82f6', 7: '#6366f1', 8: '#a855f7',
};

const COMPACT_HEIGHT = 180;
const EXPANDED_HEIGHT = 500;
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

export function WeekGlance({ runs, zones, expanded = false }: Props) {
  const [selected, setSelected] = useState<Block | null>(null);

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
      <View style={st.empty}>
        <Text style={st.emptyText}>No schedule to display</Text>
      </View>
    );
  }

  const totalMinutes = (endHour - startHour) * 60;
  const timelineHeight = expanded ? EXPANDED_HEIGHT : COMPACT_HEIGHT;

  // Current time indicator
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const nowDay = now.getDay(); // 0=Su
  const nowInRange = nowMin >= startHour * 60 && nowMin <= endHour * 60;

  // Tick interval: finer when expanded
  const tickIntervalMin = expanded ? 15 : (totalMinutes <= 240 ? 15 : totalMinutes <= 480 ? 30 : 60);
  const tickLines: number[] = [];
  const firstTick = Math.ceil((startHour * 60) / tickIntervalMin) * tickIntervalMin;
  for (let t = firstTick; t <= endHour * 60; t += tickIntervalMin) {
    tickLines.push(t);
  }

  function zoneName(id: number): string {
    const z = zones?.find(z => z.id === id);
    return z?.name || `Zone ${id}`;
  }

  const timeline = (
    <View style={[st.timelineRow, { height: timelineHeight }]}>
      {/* Time labels gutter */}
      <View style={[st.timeGutter, { height: timelineHeight }]}>
        {tickLines.map(t => {
          const top = ((t - startHour * 60) / totalMinutes) * timelineHeight;
          const h = Math.floor(t / 60);
          const m = t % 60;
          const label = m === 0 ? `${String(h).padStart(2, '0')}:00` : `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
          return (
            <Text key={t} style={[st.hourLabel, { top }]}>
              {label}
            </Text>
          );
        })}
      </View>

      {/* Day columns */}
      {DAY_NAMES.map((_, dayIdx) => (
        <View key={dayIdx} style={[st.dayColumn, { height: timelineHeight }]}>
          {/* Grid lines */}
          {tickLines.map(t => {
            const top = ((t - startHour * 60) / totalMinutes) * timelineHeight;
            return <View key={t} style={[st.gridLine, { top }, t % 60 === 0 && st.gridLineHour]} />;
          })}
          {/* Current time line */}
          {nowInRange && dayIdx === nowDay && (
            <View style={[st.nowLine, { top: ((nowMin - startHour * 60) / totalMinutes) * timelineHeight }]} />
          )}
          {/* Zone blocks */}
          {blocks
            .filter(b => b.day === dayIdx)
            .map((b, i) => {
              const top = ((b.startMin - startHour * 60) / totalMinutes) * timelineHeight;
              const height = Math.max(4, (b.durationMin / totalMinutes) * timelineHeight);
              const color = ZONE_COLORS[b.zone_id] ?? '#94a3b8';
              return (
                <TouchableOpacity
                  key={i}
                  activeOpacity={0.7}
                  onPress={() => setSelected(b)}
                  style={[st.block, { top, height, backgroundColor: color }]}
                />
              );
            })}
        </View>
      ))}
    </View>
  );

  return (
    <View style={st.container}>
      {/* Header row */}
      <View style={st.headerRow}>
        <View style={st.timeGutter} />
        {DAY_NAMES.map(d => (
          <View key={d} style={st.dayHeader}>
            <Text style={st.dayHeaderText}>{d}</Text>
          </View>
        ))}
      </View>

      {/* Timeline — scrollable when expanded */}
      {expanded ? (
        <ScrollView
          style={{ maxHeight: 320 }}
          showsVerticalScrollIndicator
          bounces={false}
          nestedScrollEnabled
        >
          {timeline}
        </ScrollView>
      ) : (
        timeline
      )}

      {/* Legend */}
      <View style={st.legend}>
        {Array.from(new Set(runs.map(r => r.zone_id)))
          .sort((a, b) => a - b)
          .map(id => (
            <View key={id} style={st.legendItem}>
              <View style={[st.legendDot, { backgroundColor: ZONE_COLORS[id] ?? '#94a3b8' }]} />
              <Text style={st.legendText}>{zoneName(id)}</Text>
            </View>
          ))}
      </View>

      {/* Detail popup */}
      {selected && (
        <Modal transparent animationType="fade">
          <TouchableOpacity
            style={st.popoverOverlay}
            activeOpacity={1}
            onPress={() => setSelected(null)}
          >
            <View style={st.popoverCard}>
              <View style={[st.popoverDot, { backgroundColor: ZONE_COLORS[selected.zone_id] ?? '#94a3b8' }]} />
              <Text style={st.popoverZone}>{zoneName(selected.zone_id)}</Text>
              <Text style={st.popoverDetail}>{DAY_FULL[selected.day]}</Text>
              <Text style={st.popoverDetail}>
                {formatTime(selected.startMin)} – {formatTime(selected.startMin + selected.durationMin)}
              </Text>
              <Text style={st.popoverDuration}>{formatDuration(selected.durationMin)}</Text>
            </View>
          </TouchableOpacity>
        </Modal>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  container:      { marginTop: 4 },
  empty:          { padding: 20, alignItems: 'center' },
  emptyText:      { color: '#9ca3af', fontSize: 13 },
  headerRow:      { flexDirection: 'row', marginBottom: 4, alignItems: 'center' },
  timeGutter:     { width: 34 },
  dayHeader:      { flex: 1, alignItems: 'center' },
  dayHeaderText:  { fontSize: 11, fontWeight: '600', color: '#6b7280' },
  timelineRow:    { flexDirection: 'row' },
  dayColumn:      { flex: 1, position: 'relative', marginHorizontal: 1, backgroundColor: '#f9fafb', borderRadius: 3 },
  gridLine:       { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: '#f3f4f6' },
  gridLineHour:   { backgroundColor: '#e5e7eb' },
  hourLabel:      { position: 'absolute', fontSize: 8, color: '#9ca3af', right: 2, marginTop: -5 },
  nowLine:        { position: 'absolute', left: 0, right: 0, height: 1.5, backgroundColor: '#dc2626', zIndex: 10 },
  block:          { position: 'absolute', left: 1, right: 1, borderRadius: 2, opacity: 0.85 },
  legend:         { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  legendItem:     { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot:      { width: 8, height: 8, borderRadius: 4 },
  legendText:     { fontSize: 11, color: '#6b7280' },
  popoverOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', alignItems: 'center', justifyContent: 'center' },
  popoverCard:    { backgroundColor: '#fff', borderRadius: 12, padding: 20, width: '70%', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12, elevation: 6 },
  popoverDot:     { width: 12, height: 12, borderRadius: 6, marginBottom: 8 },
  popoverZone:    { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 4 },
  popoverDetail:  { fontSize: 14, color: '#6b7280', marginTop: 2 },
  popoverDuration:{ fontSize: 13, color: '#9ca3af', marginTop: 6 },
});
