import { useEffect, useRef, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  ActivityIndicator, StyleSheet, Alert, ScrollView, Switch,
  Modal, FlatList as FList,
} from 'react-native';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import Slider from '@react-native-community/slider';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import { Stack } from 'expo-router';
import { useControllerConnection } from '@/context/ControllerConnection';
import { sliderToSeconds, secondsToSlider, formatDurationLabel } from '@/utils/durationSlider';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ScheduleRun = {
  zone_id: number; day_mask: number;
  hour: number; minute: number; duration_seconds: number;
  interval_days?: number; // 1 = daily (default), 2 = every other day, etc.
};

type Schedule = {
  uuid?: string; name: string;
  start_date: string; end_date: string | null;
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
function formatDate(iso: string): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${m}/${d}/${y}`;
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function SchedulesScreen() {
  const { execCommand, connected } = useControllerConnection();
  const [loading, setLoading]       = useState(true);
  const [schedules, setSchedules]   = useState<Schedule[]>([]);
  const [activeUuid, setActiveUuid] = useState<string | null>(null);
  const [editing, setEditing]       = useState<Schedule | null>(null);
  const swipeRefs = useRef<Map<string, Swipeable | null>>(new Map());

  useEffect(() => { if (connected) loadWithRetry(); }, [connected]);

  async function loadWithRetry(attempts = 2, delayMs = 500): Promise<void> {
    for (let i = 0; i < attempts; i++) {
      try {
        const [all, active] = await Promise.all([
          execCommand('get_schedules'),
          execCommand('get_active_schedule').catch(() => null),
        ]);
        setSchedules(all as Schedule[]);
        setActiveUuid((active as any)?.uuid ?? null);
        setLoading(false);
        return;
      } catch (e) {
        console.log(`[Schedules] load attempt ${i+1} failed:`, e);
        if (i < attempts - 1) await new Promise(r => setTimeout(r, delayMs));
      }
    }
    setLoading(false);
  }

  async function load() { return loadWithRetry(); }

  async function handleActivate(uuid: string) {
    try {
      if (activeUuid === uuid) {
        await execCommand('deactivate_schedule');
        setActiveUuid(null);
      } else {
        await execCommand('activate_schedule', { uuid });
        setActiveUuid(uuid);
      }
    } catch (e: any) { Alert.alert('Error', e?.message); }
  }

  async function handleDelete(uuid: string) {
    Alert.alert('Delete Schedule', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await execCommand('delete_schedule', { uuid });
          if (activeUuid === uuid) setActiveUuid(null);
          await load();
        } catch (e: any) { Alert.alert('Error', e?.message); }
      }},
    ]);
  }

  async function handleSave(s: Schedule) {
    try {
      if (s.uuid) {
        await execCommand('update_schedule', s);
      } else {
        await execCommand('create_schedule', s);
      }
      setEditing(null);
      await load();
    } catch (e: any) { Alert.alert('Error', e?.message); }
  }

  if (editing) {
    return (
      <ScheduleEditor
        schedule={editing}
        onSaved={() => { setEditing(null); load(); }}
        onCancel={() => setEditing(null)}
      />
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Schedules',
          headerRight: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginRight: 4 }}>
              {loading && <ActivityIndicator size="small" color="#fff" />}
              <TouchableOpacity onPress={() => setEditing(blankSchedule())} style={{ paddingHorizontal: 8 }}>
                <Text style={{ color: '#fff', fontSize: 26, lineHeight: 30 }}>+</Text>
              </TouchableOpacity>
            </View>
          ),
        }}
      />

      {!loading && schedules.length === 0 && (
        <View style={styles.center}>
          <Text style={styles.emptyText}>No schedules yet.</Text>
          <TouchableOpacity style={styles.addFirstBtn} onPress={() => setEditing(blankSchedule())}>
            <Text style={styles.addFirstBtnText}>+ Create Schedule</Text>
          </TouchableOpacity>
        </View>
      )}

      {loading ? null : schedules.length > 0 && (
        <FlatList
          data={schedules}
          keyExtractor={s => s.uuid!}
          contentContainerStyle={{ paddingBottom: 32 }}
          renderItem={({ item: s }) => {
            const isActive = s.uuid === activeUuid;

            const renderRightActions = () => (
              <TouchableOpacity
                style={styles.swipeDeleteBtn}
                onPress={() => {
                  swipeRefs.current.get(s.uuid!)?.close();
                  handleDelete(s.uuid!);
                }}
              >
                <Text style={styles.swipeDeleteText}>🗑{'\n'}Delete</Text>
              </TouchableOpacity>
            );

            return (
              <Swipeable
                ref={ref => { swipeRefs.current.set(s.uuid!, ref); }}
                renderRightActions={renderRightActions}
                rightThreshold={60}
                overshootRight={false}
              >
                <TouchableOpacity
                  style={styles.card}
                  onPress={() => setEditing(s)}
                  activeOpacity={0.85}
                >
                  <View style={styles.cardHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.scheduleName}>{s.name}</Text>
                      <Text style={styles.scheduleDates}>
                        {formatDate(s.start_date)} → {s.end_date ? formatDate(s.end_date) : 'open-ended'}
                      </Text>
                      <Text style={styles.scheduleRuns}>{s.runs.length} zone{s.runs.length !== 1 ? 's' : ''} scheduled</Text>
                    </View>
                    <Switch
                      value={isActive}
                      onValueChange={() => handleActivate(s.uuid!)}
                      trackColor={{ true: '#1a56db' }}
                    />
                  </View>
                </TouchableOpacity>
              </Swipeable>
            );
          }}
        />
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// TimePicker drum wheel
// ---------------------------------------------------------------------------

const DRUM_ITEM_H = 44;
const DRUM_VISIBLE = 5;

function DrumWheel({ values, selected, onChange }: {
  values: string[];
  selected: number;
  onChange: (idx: number) => void;
}) {
  const listRef = useRef<FList<string>>(null);

  useEffect(() => {
    listRef.current?.scrollToIndex({ index: selected, animated: false });
  }, []);

  return (
    <View style={{ height: DRUM_ITEM_H * DRUM_VISIBLE, width: 72, overflow: 'hidden' }}>
      <View style={drumStyles.highlightBar} pointerEvents="none" />
      <FList
        ref={listRef}
        data={values}
        keyExtractor={v => v}
        snapToInterval={DRUM_ITEM_H}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        getItemLayout={(_, i) => ({ length: DRUM_ITEM_H, offset: DRUM_ITEM_H * i, index: i })}
        contentContainerStyle={{ paddingVertical: DRUM_ITEM_H * 2 }}
        onMomentumScrollEnd={e => {
          const idx = Math.round(e.nativeEvent.contentOffset.y / DRUM_ITEM_H);
          onChange(Math.max(0, Math.min(idx, values.length - 1)));
        }}
        renderItem={({ item, index }) => (
          <View style={drumStyles.item}>
            <Text style={[drumStyles.itemText, index === selected && drumStyles.itemTextSelected]}>
              {item}
            </Text>
          </View>
        )}
      />
    </View>
  );
}

const drumStyles = StyleSheet.create({
  highlightBar: {
    position: 'absolute', top: DRUM_ITEM_H * 2,
    height: DRUM_ITEM_H, width: '100%',
    borderTopWidth: 1, borderBottomWidth: 1,
    borderColor: '#1a56db', zIndex: 1,
  },
  item:             { height: DRUM_ITEM_H, alignItems: 'center', justifyContent: 'center' },
  itemText:         { fontSize: 22, color: '#9ca3af' },
  itemTextSelected: { color: '#111827', fontWeight: '700' },
});

function TimePickerModal({ hour, minute, onConfirm, onCancel }: {
  hour: number; minute: number;
  onConfirm: (h: number, m: number) => void;
  onCancel: () => void;
}) {
  const [h, setH] = useState(hour);
  const [m, setM] = useState(minute);
  const hours   = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
  const minutes = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0'));

  return (
    <Modal transparent animationType="fade">
      <View style={tpStyles.overlay}>
        <View style={tpStyles.box}>
          <Text style={tpStyles.title}>Set Time</Text>
          <View style={tpStyles.drums}>
            <DrumWheel values={hours}   selected={h} onChange={setH} />
            <Text style={tpStyles.colon}>:</Text>
            <DrumWheel values={minutes} selected={m} onChange={setM} />
          </View>
          <View style={tpStyles.buttons}>
            <TouchableOpacity style={tpStyles.cancelBtn} onPress={onCancel}>
              <Text style={tpStyles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={tpStyles.confirmBtn} onPress={() => onConfirm(h, m)}>
              <Text style={tpStyles.confirmText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const tpStyles = StyleSheet.create({
  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  box:        { backgroundColor: '#fff', borderRadius: 14, padding: 24, width: '80%', alignItems: 'center' },
  title:      { fontSize: 17, fontWeight: '700', color: '#111827', marginBottom: 20 },
  drums:      { flexDirection: 'row', alignItems: 'center', gap: 8 },
  colon:      { fontSize: 28, fontWeight: '700', color: '#111827', marginBottom: 4 },
  buttons:    { flexDirection: 'row', gap: 12, marginTop: 24, width: '100%' },
  cancelBtn:  { flex: 1, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#d1d5db', alignItems: 'center' },
  cancelText: { color: '#374151', fontWeight: '600' },
  confirmBtn: { flex: 1, padding: 12, borderRadius: 8, backgroundColor: '#1a56db', alignItems: 'center' },
  confirmText:{ color: '#fff', fontWeight: '600' },
});

// ---------------------------------------------------------------------------
// Schedule editor
// ---------------------------------------------------------------------------

function ScheduleEditor({ schedule, onSaved, onCancel }: {
  schedule: Schedule;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const { zones, execCommand } = useControllerConnection();
  const originalJson = useRef(JSON.stringify(schedule));
  const [s, setS]       = useState<Schedule>(JSON.parse(JSON.stringify(schedule)));
  const [saving, setSaving]                   = useState(false);
  const isDirty = JSON.stringify(s) !== originalJson.current || !schedule.uuid;
  const [startPickerOpen, setStartPickerOpen] = useState(false);
  const [endPickerOpen, setEndPickerOpen]     = useState(false);
  const [timePickerRun, setTimePickerRun]     = useState<number | null>(null);
  // null = all collapsed (default for existing schedules), number = that index is expanded
  const [expandedRun, setExpandedRun]         = useState<number | null>(schedule.uuid ? null : 0);
  // Stable date refs — prevents the picker from bouncing on re-renders.
  // For end date, seed with start_date + 30 days when null so the picker
  // opens to a sensible default rather than dismissing immediately.
  const startDateRef = useRef<Date>(isoToDate(schedule.start_date));
  const endDateRef   = useRef<Date>((() => {
    if (schedule.end_date) return isoToDate(schedule.end_date);
    const d = isoToDate(schedule.start_date);
    d.setDate(d.getDate() + 30);
    return d;
  })());

  function updateRun(i: number, patch: Partial<ScheduleRun>) {
    setS(prev => { const runs = [...prev.runs]; runs[i] = { ...runs[i], ...patch }; return { ...prev, runs }; });
  }

  function isoToDate(iso: string | null): Date {
    if (!iso) return new Date();
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function dateToIso(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  async function handleSave() {
    if (!s.name.trim())  { Alert.alert('Name required'); return; }
    if (!s.runs.length)  { Alert.alert('At least one run required'); return; }
    setSaving(true);
    try {
      if (s.uuid) {
        await execCommand('update_schedule', s);
      } else {
        await execCommand('create_schedule', s);
      }
      onSaved();
    } catch (e: any) {
      Alert.alert('Error', e?.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#f0f4f8' }}>
      <Stack.Screen options={{
        title: s.uuid ? 'Edit Schedule' : 'New Schedule',
        headerLeft: () => (
          <TouchableOpacity onPress={onCancel} style={{ marginLeft: 4, paddingHorizontal: 8 }}>
            <Text style={{ color: '#fff', fontSize: 22 }}>‹</Text>
          </TouchableOpacity>
        ),
        headerRight: () => (
          <TouchableOpacity
            onPress={handleSave}
            disabled={saving || !isDirty}
            style={{ marginRight: 4, paddingHorizontal: 8, opacity: (!isDirty && !saving) ? 0.4 : 1 }}
          >
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>Save</Text>}
          </TouchableOpacity>
        ),
      }} />

      {/* Date pickers — use stable refs to prevent picker from bouncing */}
      <DateTimePickerModal
        isVisible={startPickerOpen}
        mode="date"
        date={startDateRef.current}
        onConfirm={d => {
          startDateRef.current = d;
          setS(p => ({ ...p, start_date: dateToIso(d) }));
          setStartPickerOpen(false);
        }}
        onCancel={() => setStartPickerOpen(false)}
      />
      <DateTimePickerModal
        isVisible={endPickerOpen}
        mode="date"
        date={endDateRef.current}
        onConfirm={d => {
          endDateRef.current = d;
          setS(p => ({ ...p, end_date: dateToIso(d) }));
          setEndPickerOpen(false);
        }}
        onCancel={() => setEndPickerOpen(false)}
      />

      {/* Time picker modal */}
      {timePickerRun !== null && (
        <TimePickerModal
          hour={s.runs[timePickerRun].hour}
          minute={s.runs[timePickerRun].minute}
          onConfirm={(h, m) => { updateRun(timePickerRun, { hour: h, minute: m }); setTimePickerRun(null); }}
          onCancel={() => setTimePickerRun(null)}
        />
      )}

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>

        {/* Name */}
        <Text style={styles.fieldLabel}>Name</Text>
        <TextInput style={styles.textInput} value={s.name} onChangeText={v => setS(p => ({ ...p, name: v }))} placeholder="Schedule name" />

        {/* Start date */}
        <Text style={styles.fieldLabel}>Start Date</Text>
        <TouchableOpacity style={styles.dateRow} onPress={() => setStartPickerOpen(true)}>
          <Text style={styles.dateText}>{formatDate(s.start_date)}</Text>
          <Text style={styles.dateChevron}>›</Text>
        </TouchableOpacity>

        {/* End date */}
        <Text style={styles.fieldLabel}>End Date</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity style={[styles.dateRow, { flex: 1 }]} onPress={() => setEndPickerOpen(true)}>
            <Text style={styles.dateText}>{s.end_date ? formatDate(s.end_date) : 'Open-ended'}</Text>
            <Text style={styles.dateChevron}>›</Text>
          </TouchableOpacity>
          {s.end_date && (
            <TouchableOpacity style={styles.clearDateBtn} onPress={() => setS(p => ({ ...p, end_date: null }))}>
              <Text style={styles.clearDateText}>Clear</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Zone Schedules */}
        <Text style={[styles.fieldLabel, { marginTop: 20 }]}>Zone Schedules</Text>
        {s.runs.map((run, i) => (
          <RunCard
            key={i}
            run={run}
            runIndex={i}
            expanded={expandedRun === i}
            onExpand={() => {
              if (expandedRun === i) { setExpandedRun(null); }
              else { setTimePickerRun(null); setExpandedRun(i); }
            }}
            canRemove={s.runs.length > 1}
            zones={zones}
            onUpdate={patch => updateRun(i, patch)}
            onRemove={() => {
              setS(p => ({ ...p, runs: p.runs.filter((_, idx) => idx !== i) }));
              if (expandedRun === i) setExpandedRun(null);
              else if (expandedRun !== null && expandedRun > i) setExpandedRun(expandedRun - 1);
            }}
            onOpenTimePicker={() => setTimePickerRun(i)}
          />
        ))}

        <TouchableOpacity style={styles.addRunBtn} onPress={() => {
          setS(p => { const runs = [...p.runs, blankRun()]; setExpandedRun(runs.length - 1); return { ...p, runs }; });
        }}>
          <Text style={styles.addRunText}>+ Add Zone Schedule</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Run card
// ---------------------------------------------------------------------------

function RunCard({ run, runIndex, expanded, onExpand, canRemove, zones, onUpdate, onRemove, onOpenTimePicker }: {
  run: ScheduleRun;
  runIndex: number;
  expanded: boolean;
  onExpand: () => void;
  canRemove: boolean;
  zones: { id: number; name: string }[];
  onUpdate: (patch: Partial<ScheduleRun>) => void;
  onRemove: () => void;
  onOpenTimePicker: () => void;
}) {
  const [durSecs, setDurSecs]       = useState(run.duration_seconds);
  const [zonePickerOpen, setZonePickerOpen] = useState(false);
  const intervalDays = run.interval_days ?? 1;
  const useInterval  = intervalDays > 1;

  function zoneLabel(id: number) {
    return zones.find(z => z.id === id)?.name ?? `Zone ${id}`;
  }

  function summaryText(): string {
    const zone = zoneLabel(run.zone_id);
    const time = `${String(run.hour).padStart(2, '0')}:${String(run.minute).padStart(2, '0')}`;
    const dur  = formatDurationLabel(run.duration_seconds);
    const sched = useInterval
      ? `every ${intervalDays} days`
      : DAY_NAMES.filter((_, i) => run.day_mask & DAY_BITS[i]).join(' ') || '—';
    return `${zone}  ·  ${time}  ·  ${dur}  ·  ${sched}`;
  }

  if (!expanded) {
    return (
      <TouchableOpacity style={styles.runSummary} onPress={onExpand}>
        <Text style={styles.runSummaryText} numberOfLines={1}>{summaryText()}</Text>
        <Text style={styles.dateChevron}>›</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.runCard}>
      <View style={styles.runHeader}>
        <TouchableOpacity onPress={onExpand} style={{ flex: 1 }}>
          <Text style={styles.runCollapseHint}>▾ Collapse</Text>
        </TouchableOpacity>
        {canRemove && (
          <TouchableOpacity onPress={onRemove}>
            <Text style={styles.removeRunText}>Remove</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Zone + Time side by side */}
      <View style={styles.zoneTimeRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.runFieldLabel}>Zone</Text>
          <TouchableOpacity style={styles.compactRow} onPress={() => setZonePickerOpen(true)}>
            <Text style={styles.compactText} numberOfLines={1}>{zoneLabel(run.zone_id)}</Text>
            <Text style={styles.dateChevron}>›</Text>
          </TouchableOpacity>
        </View>
        <View style={{ width: 1, backgroundColor: '#e5e7eb', marginHorizontal: 8, marginTop: 20 }} />
        <View style={{ flex: 1 }}>
          <Text style={styles.runFieldLabel}>Start Time</Text>
          <TouchableOpacity style={styles.compactRow} onPress={onOpenTimePicker}>
            <Text style={styles.compactText}>
              {String(run.hour).padStart(2, '0')}:{String(run.minute).padStart(2, '0')}
            </Text>
            <Text style={styles.dateChevron}>›</Text>
          </TouchableOpacity>
        </View>
      </View>
      <Modal visible={zonePickerOpen} transparent animationType="fade">
        <TouchableOpacity style={zpStyles.overlay} activeOpacity={1} onPress={() => setZonePickerOpen(false)}>
          <View style={zpStyles.sheet}>
            <Text style={zpStyles.title}>Select Zone</Text>
            {Array.from({ length: 8 }, (_, i) => i + 1).map(id => (
              <TouchableOpacity
                key={id}
                style={[zpStyles.item, run.zone_id === id && zpStyles.itemActive]}
                onPress={() => { onUpdate({ zone_id: id }); setZonePickerOpen(false); }}
              >
                <Text style={[zpStyles.itemText, run.zone_id === id && zpStyles.itemTextActive]}>
                  {zoneLabel(id)}
                </Text>
                {run.zone_id === id && <Text style={zpStyles.check}>✓</Text>}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Duration slider */}
      <Text style={styles.runFieldLabel}>Duration</Text>
      <Text style={styles.durationLabel}>{formatDurationLabel(durSecs)}</Text>
      <Slider
        style={{ width: '100%', height: 36 }}
        minimumValue={0} maximumValue={100}
        value={secondsToSlider(durSecs)}
        onValueChange={pos => setDurSecs(sliderToSeconds(pos))}
        onSlidingComplete={pos => onUpdate({ duration_seconds: sliderToSeconds(pos) })}
        minimumTrackTintColor="#1a56db" maximumTrackTintColor="#d1d5db" thumbTintColor="#1a56db"
      />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: -4 }}>
        <Text style={styles.sliderEndLabel}>5s</Text>
        <Text style={styles.sliderEndLabel}>60m</Text>
      </View>

      {/* Schedule mode toggle */}
      <Text style={[styles.runFieldLabel, { marginTop: 14 }]}>Schedule</Text>
      <View style={styles.modeToggle}>
        <TouchableOpacity
          style={[styles.modeBtn, !useInterval && styles.modeBtnActive]}
          onPress={() => onUpdate({ interval_days: 1 })}
        >
          <Text style={[styles.modeBtnText, !useInterval && styles.modeBtnTextActive]}>Days of week</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeBtn, useInterval && styles.modeBtnActive]}
          onPress={() => onUpdate({ interval_days: 2 })}
        >
          <Text style={[styles.modeBtnText, useInterval && styles.modeBtnTextActive]}>Every N days</Text>
        </TouchableOpacity>
      </View>

      {useInterval ? (
        <View style={styles.intervalRow}>
          <Text style={styles.intervalLabel}>Every</Text>
          <TouchableOpacity style={styles.intervalBtn} onPress={() => onUpdate({ interval_days: Math.max(2, intervalDays - 1) })}>
            <Text style={styles.intervalBtnText}>−</Text>
          </TouchableOpacity>
          <Text style={styles.intervalValue}>{intervalDays}</Text>
          <TouchableOpacity style={styles.intervalBtn} onPress={() => onUpdate({ interval_days: Math.min(30, intervalDays + 1) })}>
            <Text style={styles.intervalBtnText}>+</Text>
          </TouchableOpacity>
          <Text style={styles.intervalLabel}>days</Text>
        </View>
      ) : (
        <>
          <View style={styles.daysHeader}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity onPress={() => onUpdate({ day_mask: 127 })}>
                <Text style={styles.dayActionText}>All</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => onUpdate({ day_mask: 0 })}>
                <Text style={styles.dayActionText}>Clear</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.dayRow}>
            {DAY_NAMES.map((name, d) => {
              const active = !!(run.day_mask & DAY_BITS[d]);
              return (
                <TouchableOpacity
                  key={d}
                  style={[styles.dayBtn, active && styles.dayBtnActive]}
                  onPress={() => onUpdate({ day_mask: run.day_mask ^ DAY_BITS[d] })}
                >
                  <Text style={[styles.dayBtnText, active && styles.dayBtnTextActive]}>{name}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: '#f0f4f8' },
  center:           { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyText:        { color: '#9ca3af', fontSize: 15, textAlign: 'center', marginBottom: 20 },
  addFirstBtn:      { backgroundColor: '#1a56db', borderRadius: 8, paddingVertical: 12, paddingHorizontal: 28 },
  addFirstBtnText:  { color: '#fff', fontWeight: '600', fontSize: 15 },
  card:             { backgroundColor: '#fff', marginHorizontal: 16, marginTop: 10, borderRadius: 10, padding: 14, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  cardHeader:       { flexDirection: 'row', alignItems: 'center' },
  swipeDeleteBtn:   { backgroundColor: '#dc2626', justifyContent: 'center', alignItems: 'center', width: 80, marginHorizontal: 16, marginTop: 10, borderRadius: 10 },
  swipeDeleteText:  { color: '#fff', fontWeight: '700', fontSize: 12, textAlign: 'center' },
  scheduleName:     { fontSize: 16, fontWeight: '600', color: '#111827' },
  scheduleDates:    { fontSize: 12, color: '#6b7280', marginTop: 2 },
  scheduleRuns:     { fontSize: 12, color: '#9ca3af', marginTop: 1 },
  cardFooter:       { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  cardFooterBtn:    { paddingVertical: 4, paddingHorizontal: 8 },
  editLink:         { color: '#1a56db', fontWeight: '600', fontSize: 14 },
  deleteLink:       { color: '#dc2626', fontWeight: '600', fontSize: 14 },
  fieldLabel:       { fontSize: 13, color: '#6b7280', marginBottom: 6, marginTop: 12 },
  textInput:        { backgroundColor: '#fff', borderRadius: 8, padding: 10, fontSize: 15, color: '#111827', borderWidth: 1, borderColor: '#e5e7eb' },
  dateRow:          { backgroundColor: '#fff', borderRadius: 8, padding: 12, borderWidth: 1, borderColor: '#e5e7eb', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dateText:         { fontSize: 15, color: '#111827' },
  dateChevron:      { fontSize: 18, color: '#9ca3af' },
  clearDateBtn:     { backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 14, borderWidth: 1, borderColor: '#e5e7eb', justifyContent: 'center' },
  clearDateText:    { color: '#6b7280', fontSize: 14 },
  runSummary:       { backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#e5e7eb' },
  runSummaryText:   { fontSize: 13, color: '#374151', flex: 1, marginRight: 8 },
  runCard:          { backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#1a56db' },
  runHeader:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  runCollapseHint:  { fontSize: 12, color: '#6b7280' },
  removeRunText:    { color: '#dc2626', fontSize: 13 },
  runFieldLabel:    { fontSize: 12, color: '#6b7280', marginBottom: 4, marginTop: 10 },
  zoneChip:         { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#d1d5db', backgroundColor: '#f9fafb' },
  zoneChipActive:   { backgroundColor: '#1a56db', borderColor: '#1a56db' },
  zoneChipText:     { fontSize: 12, color: '#374151', fontWeight: '500' },
  zoneChipTextActive:{ color: '#fff' },
  timeRow:          { backgroundColor: '#f9fafb', borderRadius: 8, padding: 12, borderWidth: 1, borderColor: '#e5e7eb', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  timeText:         { fontSize: 22, fontWeight: '700', color: '#111827', letterSpacing: 2 },
  durationLabel:    { fontSize: 28, fontWeight: '700', color: '#1a56db', textAlign: 'center', marginTop: 4 },
  sliderEndLabel:   { fontSize: 11, color: '#9ca3af' },
  daysHeader:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  dayActionText:    { fontSize: 12, color: '#1a56db', fontWeight: '600' },
  dayRow:           { flexDirection: 'row', gap: 6, marginTop: 4, flexWrap: 'wrap' },
  dayBtn:           { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6, borderWidth: 1, borderColor: '#d1d5db', backgroundColor: '#f9fafb' },
  dayBtnActive:     { backgroundColor: '#1a56db', borderColor: '#1a56db' },
  dayBtnText:       { fontSize: 12, color: '#6b7280', fontWeight: '500' },
  dayBtnTextActive: { color: '#fff' },
  zoneTimeRow:      { flexDirection: 'row', alignItems: 'flex-end', marginTop: 4 },
  compactRow:       { backgroundColor: '#fff', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: '#e5e7eb', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  compactText:      { fontSize: 14, color: '#111827', flexShrink: 1 },
  modeToggle:       { flexDirection: 'row', backgroundColor: '#e5e7eb', borderRadius: 8, padding: 3, marginTop: 4 },
  modeBtn:          { flex: 1, paddingVertical: 7, alignItems: 'center', borderRadius: 6 },
  modeBtnActive:    { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 2, elevation: 2 },
  modeBtnText:      { fontSize: 13, color: '#6b7280', fontWeight: '500' },
  modeBtnTextActive:{ color: '#111827', fontWeight: '600' },
  intervalRow:      { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  intervalLabel:    { fontSize: 14, color: '#374151' },
  intervalBtn:      { width: 32, height: 32, borderRadius: 16, backgroundColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center' },
  intervalBtnText:  { fontSize: 18, color: '#111827', lineHeight: 22 },
  intervalValue:    { fontSize: 20, fontWeight: '700', color: '#1a56db', minWidth: 28, textAlign: 'center' },
  addRunBtn:        { marginTop: 8, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#1a56db', alignItems: 'center' },
  addRunText:       { color: '#1a56db', fontWeight: '600', fontSize: 14 },
});

const zpStyles = StyleSheet.create({
  overlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet:        { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingTop: 20, paddingBottom: 36 },
  title:        { fontSize: 15, fontWeight: '700', color: '#374151', paddingHorizontal: 20, marginBottom: 8 },
  item:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  itemActive:   { backgroundColor: '#f0f7ff' },
  itemText:     { fontSize: 16, color: '#111827' },
  itemTextActive:{ color: '#1a56db', fontWeight: '600' },
  check:        { fontSize: 16, color: '#1a56db' },
});
