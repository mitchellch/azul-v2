import { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, TextInput,
  ActivityIndicator, StyleSheet, Alert, ScrollView, Switch,
  Modal, FlatList,
} from 'react-native';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { useControllerConnection } from '@/context/ControllerConnection';
import { formatDurationLabel } from '@/utils/durationSlider';
import { WeekGlance } from '@/components/WeekGlance';
import { MAX_ZONES } from '@/lib/constants';
import type { ProgramPayload } from '@/services/cloudApi';

// ---------------------------------------------------------------------------
// Types & helpers
// ---------------------------------------------------------------------------

type StartTime  = { hour: number; minute: number };
type ProgramZoneSpec = { zoneNumber: number; durationSeconds: number; order: number };

// A locally-edited program. `id` is undefined for a new (unsaved) program.
type LocalProgram = {
  id?:          string;
  name:         string;
  dayMask:      number;
  intervalDays: number;
  startDate:    string;
  endDate:      string | null;
  active:       boolean;
  startTimes:   StartTime[];
  zones:        ProgramZoneSpec[];
};

const DAY_NAMES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const DAY_BITS  = [1, 2, 4, 8, 16, 32, 64];
const FIRMWARE_RUN_CAP = 48;

function today(): string { return new Date().toISOString().slice(0, 10); }
function blankProgram(): LocalProgram {
  return {
    name:         '',
    dayMask:      0x7F,
    intervalDays: 1,
    startDate:    today(),
    endDate:      null,
    active:       false,
    startTimes:   [{ hour: 6, minute: 0 }],
    zones:        [],
  };
}
function programInWindow(p: LocalProgram): boolean {
  const t = today();
  return (!p.startDate || t >= p.startDate) && (!p.endDate || t <= p.endDate);
}

// Expand programs to flat firmware runs for the Week-at-a-Glance and to enforce
// the 48-run cap client-side before hitting the server.
type ScheduleRun = { zone_id: number; day_mask: number; hour: number; minute: number; duration_seconds: number; interval_days?: number };
function expandProgram(p: LocalProgram): ScheduleRun[] {
  const runs: ScheduleRun[] = [];
  for (const st of p.startTimes) {
    let offset = 0;
    for (const z of [...p.zones].sort((a, b) => a.order - b.order)) {
      const total = st.minute + offset;
      runs.push({
        zone_id:          z.zoneNumber,
        day_mask:         p.dayMask,
        hour:             st.hour + Math.floor(total / 60),
        minute:           total % 60,
        duration_seconds: z.durationSeconds,
        ...(p.intervalDays !== 1 && { interval_days: p.intervalDays }),
      });
      offset += Math.ceil(z.durationSeconds / 60);
    }
  }
  return runs;
}

function formatTime(h: number, m: number): string {
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hh   = h % 12 || 12;
  return `${hh}:${String(m).padStart(2, '0')} ${ampm}`;
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function ProgramsScreen() {
  const { execCommand, connected, status, zones } = useControllerConnection();
  const [loading, setLoading]     = useState(true);
  const [programs, setPrograms]   = useState<LocalProgram[]>([]);
  const [editing, setEditing]     = useState<LocalProgram | null>(null);
  const [waagOpen, setWaagOpen]   = useState(false);
  const [waagExpanded, setWaagExpanded] = useState(false);
  const swipeRefs = useRef<Map<string, Swipeable | null>>(new Map());

  useEffect(() => { if (connected) load(); }, [connected]);

  async function load() {
    try {
      const list = (await execCommand('get_programs')) as ProgramPayload[];
      setPrograms(list.map(fromPayload));
    } catch (e) {
      console.log('[Programs] load failed:', e);
    } finally {
      setLoading(false);
    }
  }

  function fromPayload(p: ProgramPayload): LocalProgram {
    return {
      id:           p.id,
      name:         p.name,
      dayMask:      p.dayMask,
      intervalDays: p.intervalDays,
      startDate:    p.startDate,
      endDate:      p.endDate,
      active:       p.active,
      startTimes:   p.startTimes,
      zones:        p.zones,
    };
  }

  async function handleToggleActive(p: LocalProgram) {
    if (!p.id) return;
    try {
      await execCommand(p.active ? 'deactivate_program' : 'activate_program', { id: p.id });
      await load();
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Toggle failed');
    }
  }

  async function handleDelete(p: LocalProgram) {
    if (!p.id) return;
    Alert.alert('Delete Program', `Delete "${p.name}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await execCommand('delete_program', { id: p.id });
          await load();
        } catch (e: any) { Alert.alert('Error', e?.message); }
      }},
    ]);
  }

  if (editing) {
    return (
      <ProgramEditor
        program={editing}
        onSaved={() => { setEditing(null); load(); }}
        onCancel={() => setEditing(null)}
      />
    );
  }

  const activeRuns = programs.filter(p => p.active && programInWindow(p)).flatMap(expandProgram);

  return (
    <View style={styles.container}>
      <View style={styles.tabHeader}>
        <Text style={styles.tabTitle}>Programs</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {loading && <ActivityIndicator size="small" color="#1a56db" />}
          <TouchableOpacity onPress={() => setEditing(blankProgram())} style={{ padding: 8 }}>
            <Text style={{ color: '#1a56db', fontSize: 26, lineHeight: 30, fontWeight: '300' }}>+</Text>
          </TouchableOpacity>
        </View>
      </View>

      {!loading && programs.length === 0 && (
        <View style={styles.center}>
          <Text style={styles.emptyText}>No programs yet.</Text>
          <TouchableOpacity style={styles.addFirstBtn} onPress={() => setEditing(blankProgram())}>
            <Text style={styles.addFirstBtnText}>+ Create Program</Text>
          </TouchableOpacity>
        </View>
      )}

      {!loading && programs.length > 0 && (
        <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
          {programs.map(p => {
            const key = p.id ?? p.name;
            const inWin = programInWindow(p);
            const dayLabel = p.intervalDays > 1
              ? `Every ${p.intervalDays} days`
              : DAY_NAMES.filter((_, i) => (p.dayMask & DAY_BITS[i]) !== 0).join(' ') || '—';
            const timeLabel = p.startTimes.map(t => formatTime(t.hour, t.minute)).join(', ');
            return (
              <Swipeable
                key={key}
                ref={ref => { swipeRefs.current.set(key, ref); }}
                renderRightActions={() => (
                  <TouchableOpacity
                    style={styles.swipeDeleteBtn}
                    onPress={() => {
                      swipeRefs.current.get(key)?.close();
                      handleDelete(p);
                    }}
                  >
                    <Text style={styles.swipeDeleteText}>🗑{'\n'}Delete</Text>
                  </TouchableOpacity>
                )}
                rightThreshold={60}
                overshootRight={false}
              >
                <View style={styles.card}>
                  <TouchableOpacity onPress={() => setEditing(p)} activeOpacity={0.85}>
                    <View style={styles.cardHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.programName}>{p.name}</Text>
                        <Text style={styles.programSub}>
                          {p.zones.length} zone{p.zones.length !== 1 ? 's' : ''} · {timeLabel || '—'}
                        </Text>
                        <Text style={styles.programSub2}>{dayLabel}</Text>
                      </View>
                      <Switch
                        value={p.active}
                        onValueChange={() => handleToggleActive(p)}
                        trackColor={{ true: inWin ? '#22c55e' : '#1a56db' }}
                      />
                    </View>
                  </TouchableOpacity>
                </View>
              </Swipeable>
            );
          })}

          {activeRuns.length > 0 && (
            <View style={[styles.card, { paddingBottom: 6 }]}>
              <View style={styles.waagToggle}>
                <TouchableOpacity onPress={() => setWaagOpen(v => !v)}>
                  <Text style={styles.waagToggleText}>{waagOpen ? '▾' : '▸'} Week at a Glance</Text>
                </TouchableOpacity>
                {waagOpen && (
                  <TouchableOpacity onPress={() => setWaagExpanded(v => !v)}>
                    <Text style={styles.waagZoomText}>{waagExpanded ? 'Zoom out' : 'Zoom in'}</Text>
                  </TouchableOpacity>
                )}
              </View>
              {waagOpen && (
                <View style={{ marginTop: 8 }}>
                  <WeekGlance runs={activeRuns} zones={zones} expanded={waagExpanded} />
                </View>
              )}
              <Text style={styles.slotUsage}>
                {activeRuns.length} of {FIRMWARE_RUN_CAP} run slots used
              </Text>
            </View>
          )}
        </ScrollView>
      )}

      {(status as any)?.firmware && (
        <View style={styles.firmwareRow}>
          <Text style={styles.firmwareLabel}>Firmware {(status as any).firmware}</Text>
          {process.env.EXPO_PUBLIC_DEBUG_MODE === 'true' && (
            <View style={styles.debugBadge}>
              <Text style={styles.debugText}>DEBUG</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Drum wheel + Time picker (kept from schedules.tsx)
// ---------------------------------------------------------------------------

const DRUM_ITEM_H  = 44;
const DRUM_VISIBLE = 5;

function DrumWheel({ values, selected, onChange }: { values: string[]; selected: number; onChange: (idx: number) => void }) {
  const listRef = useRef<FlatList<string>>(null);
  useEffect(() => { listRef.current?.scrollToIndex({ index: selected, animated: false }); }, []);
  return (
    <View style={{ height: DRUM_ITEM_H * DRUM_VISIBLE, width: 72, overflow: 'hidden' }}>
      <View style={drumStyles.highlightBar} pointerEvents="none" />
      <FlatList
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
            <Text style={[drumStyles.itemText, index === selected && drumStyles.itemTextSelected]}>{item}</Text>
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
  const minutes = Array.from({ length: 12 }, (_, i) => (i * 5).toString().padStart(2, '0'));
  const minuteIdx = Math.min(11, Math.round(m / 5));
  return (
    <Modal transparent animationType="fade">
      <View style={tpStyles.overlay}>
        <View style={tpStyles.box}>
          <Text style={tpStyles.title}>Set Time</Text>
          <View style={tpStyles.drums}>
            <DrumWheel values={hours}   selected={h}         onChange={setH} />
            <Text style={tpStyles.colon}>:</Text>
            <DrumWheel values={minutes} selected={minuteIdx} onChange={i => setM(i * 5)} />
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

const DURATION_OPTIONS = [
  { label: '5m',  secs: 300 },
  { label: '10m', secs: 600 },
  { label: '15m', secs: 900 },
  { label: '20m', secs: 1200 },
  { label: '30m', secs: 1800 },
  { label: '45m', secs: 2700 },
  { label: '60m', secs: 3600 },
];

// ---------------------------------------------------------------------------
// Program editor
// ---------------------------------------------------------------------------

function ProgramEditor({ program, onSaved, onCancel }: {
  program: LocalProgram;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const { zones, execCommand } = useControllerConnection();
  const originalJson = useRef(JSON.stringify(program));
  const [p, setP] = useState<LocalProgram>(JSON.parse(JSON.stringify(program)));
  const [saving, setSaving] = useState(false);
  const [timePickerIdx, setTimePickerIdx] = useState<number | null>(null);
  const [zonePickerFor, setZonePickerFor] = useState<number | null>(null);   // zoneNumber being edited (for duration menu)
  const [addZonePickerOpen, setAddZonePickerOpen] = useState(false);

  const isDirty = JSON.stringify(p) !== originalJson.current || !p.id;
  const runCount = expandProgram(p).length;
  const overflow = runCount > FIRMWARE_RUN_CAP;

  const allZoneIds = Array.from({ length: MAX_ZONES }, (_, i) => i + 1);
  const availableZoneIds = allZoneIds.filter(id => !p.zones.some(z => z.zoneNumber === id));

  function updateZone(zoneNumber: number, patch: Partial<ProgramZoneSpec>) {
    setP(prev => ({
      ...prev,
      zones: prev.zones.map(z => z.zoneNumber === zoneNumber ? { ...z, ...patch } : z),
    }));
  }

  function addZone(zoneNumber: number) {
    setP(prev => {
      const nextOrder = prev.zones.reduce((m, z) => Math.max(m, z.order), -1) + 1;
      return { ...prev, zones: [...prev.zones, { zoneNumber, durationSeconds: 600, order: nextOrder }] };
    });
  }

  function removeZone(zoneNumber: number) {
    setP(prev => {
      const kept = prev.zones.filter(z => z.zoneNumber !== zoneNumber);
      // Re-pack `order` so gaps don't linger.
      kept.sort((a, b) => a.order - b.order).forEach((z, i) => { z.order = i; });
      return { ...prev, zones: kept };
    });
  }

  function zoneName(id: number) { return zones.find(z => z.id === id)?.name || `Zone ${id}`; }

  async function handleSave() {
    if (!p.name.trim())      { Alert.alert('Name required'); return; }
    if (p.startTimes.length === 0) { Alert.alert('At least one start time'); return; }
    if (p.zones.length === 0)      { Alert.alert('Select at least one zone'); return; }
    if (p.intervalDays === 1 && p.dayMask === 0) { Alert.alert('Select at least one day'); return; }
    if (overflow) { Alert.alert('Too many runs', `Programs compile to ${runCount} runs; firmware supports ${FIRMWARE_RUN_CAP}.`); return; }
    setSaving(true);
    try {
      if (p.id) {
        await execCommand('update_program', p);
      } else {
        await execCommand('create_program', p);
      }
      onSaved();
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  const useInterval = p.intervalDays > 1;

  return (
    <View style={{ flex: 1, backgroundColor: '#f0f4f8' }}>
      <View style={{ backgroundColor: '#1a56db', flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 4 }}>
        <TouchableOpacity onPress={onCancel} style={{ width: 44, alignItems: 'center' }}>
          <Text style={{ color: '#fff', fontSize: 22 }}>‹</Text>
        </TouchableOpacity>
        <Text style={{ flex: 1, color: '#fff', fontSize: 17, fontWeight: '600', textAlign: 'center' }}>
          {p.id ? 'Edit Program' : 'New Program'}
        </Text>
        <TouchableOpacity
          onPress={handleSave}
          disabled={saving || !isDirty}
          style={{ paddingHorizontal: 12, alignItems: 'center', opacity: (!isDirty && !saving) ? 0.4 : 1 }}
        >
          {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>Save</Text>}
        </TouchableOpacity>
      </View>

      {timePickerIdx !== null && (
        <TimePickerModal
          hour={p.startTimes[timePickerIdx].hour}
          minute={p.startTimes[timePickerIdx].minute}
          onConfirm={(h, m) => {
            setP(prev => {
              const st = [...prev.startTimes];
              st[timePickerIdx] = { hour: h, minute: m };
              return { ...prev, startTimes: st };
            });
            setTimePickerIdx(null);
          }}
          onCancel={() => setTimePickerIdx(null)}
        />
      )}

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 64 }}>
        {/* Name */}
        <Text style={styles.fieldLabel}>Name</Text>
        <TextInput style={styles.textInput} value={p.name} onChangeText={v => setP(prev => ({ ...prev, name: v }))} placeholder="e.g., Lawn, Drip, Garden" />

        {/* Start times */}
        <Text style={styles.fieldLabel}>Start Times</Text>
        {p.startTimes.map((st, i) => (
          <View key={i} style={styles.rowInline}>
            <TouchableOpacity style={styles.rowInlinePress} onPress={() => setTimePickerIdx(i)}>
              <Text style={styles.rowInlineText}>{formatTime(st.hour, st.minute)}</Text>
              <Text style={styles.dateChevron}>›</Text>
            </TouchableOpacity>
            {p.startTimes.length > 1 && (
              <TouchableOpacity
                style={styles.smallRemoveBtn}
                onPress={() => setP(prev => ({ ...prev, startTimes: prev.startTimes.filter((_, idx) => idx !== i) }))}
              >
                <Text style={styles.smallRemoveText}>×</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
        {p.startTimes.length < 6 && (
          <TouchableOpacity style={styles.addRunBtn} onPress={() => setP(prev => ({ ...prev, startTimes: [...prev.startTimes, { hour: 12, minute: 0 }] }))}>
            <Text style={styles.addRunText}>+ Add Start Time</Text>
          </TouchableOpacity>
        )}

        {/* Repeat */}
        <Text style={styles.fieldLabel}>Repeat</Text>
        <View style={styles.modeToggle}>
          <TouchableOpacity
            style={[styles.modeBtn, !useInterval && styles.modeBtnActive]}
            onPress={() => setP(prev => ({ ...prev, intervalDays: 1, dayMask: prev.dayMask || 0x7F }))}
          >
            <Text style={[styles.modeBtnText, !useInterval && styles.modeBtnTextActive]}>Days of week</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeBtn, useInterval && styles.modeBtnActive]}
            onPress={() => setP(prev => ({ ...prev, intervalDays: prev.intervalDays > 1 ? prev.intervalDays : 2 }))}
          >
            <Text style={[styles.modeBtnText, useInterval && styles.modeBtnTextActive]}>Every N days</Text>
          </TouchableOpacity>
        </View>
        {useInterval ? (
          <View style={styles.intervalRow}>
            <Text style={styles.intervalLabel}>Every</Text>
            <TouchableOpacity style={styles.intervalBtn} onPress={() => setP(prev => ({ ...prev, intervalDays: Math.max(2, prev.intervalDays - 1) }))}>
              <Text style={styles.intervalBtnText}>−</Text>
            </TouchableOpacity>
            <Text style={styles.intervalValue}>{p.intervalDays}</Text>
            <TouchableOpacity style={styles.intervalBtn} onPress={() => setP(prev => ({ ...prev, intervalDays: Math.min(30, prev.intervalDays + 1) }))}>
              <Text style={styles.intervalBtnText}>+</Text>
            </TouchableOpacity>
            <Text style={styles.intervalLabel}>days</Text>
          </View>
        ) : (
          <>
            <View style={styles.daysHeader}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity onPress={() => setP(prev => ({ ...prev, dayMask: 127 }))}>
                  <Text style={styles.dayActionText}>All</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setP(prev => ({ ...prev, dayMask: 0 }))}>
                  <Text style={styles.dayActionText}>Clear</Text>
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.dayRow}>
              {DAY_NAMES.map((name, d) => {
                const active = !!(p.dayMask & DAY_BITS[d]);
                return (
                  <TouchableOpacity
                    key={d}
                    style={[styles.dayBtn, active && styles.dayBtnActive]}
                    onPress={() => setP(prev => ({ ...prev, dayMask: prev.dayMask ^ DAY_BITS[d] }))}
                  >
                    <Text style={[styles.dayBtnText, active && styles.dayBtnTextActive]}>{name}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

        {/* Zones & Durations */}
        <Text style={styles.fieldLabel}>Zones &amp; Durations</Text>
        {[...p.zones].sort((a, b) => a.order - b.order).map(z => (
          <View key={z.zoneNumber} style={styles.zoneRow}>
            <Text style={styles.zoneRowName} numberOfLines={1}>{zoneName(z.zoneNumber)}</Text>
            <TouchableOpacity style={styles.zoneDurPill} onPress={() => setZonePickerFor(z.zoneNumber)}>
              <Text style={styles.zoneDurText}>{formatDurationLabel(z.durationSeconds)}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.smallRemoveBtn} onPress={() => removeZone(z.zoneNumber)}>
              <Text style={styles.smallRemoveText}>×</Text>
            </TouchableOpacity>
          </View>
        ))}
        {availableZoneIds.length > 0 && (
          <TouchableOpacity style={styles.addRunBtn} onPress={() => setAddZonePickerOpen(true)}>
            <Text style={styles.addRunText}>+ Add Zone</Text>
          </TouchableOpacity>
        )}

        {/* Zone add picker */}
        <Modal visible={addZonePickerOpen} transparent animationType="fade">
          <TouchableOpacity style={zpStyles.overlay} activeOpacity={1} onPress={() => setAddZonePickerOpen(false)}>
            <View style={zpStyles.sheet}>
              <Text style={zpStyles.title}>Add Zone</Text>
              {availableZoneIds.map(id => (
                <TouchableOpacity
                  key={id}
                  style={zpStyles.item}
                  onPress={() => { addZone(id); setAddZonePickerOpen(false); }}
                >
                  <Text style={zpStyles.itemText}>{zoneName(id)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </TouchableOpacity>
        </Modal>

        {/* Duration picker (per-zone) */}
        <Modal visible={zonePickerFor !== null} transparent animationType="fade">
          <TouchableOpacity style={zpStyles.overlay} activeOpacity={1} onPress={() => setZonePickerFor(null)}>
            <View style={zpStyles.sheet}>
              <Text style={zpStyles.title}>Duration</Text>
              {DURATION_OPTIONS.map(opt => {
                const current = p.zones.find(z => z.zoneNumber === zonePickerFor)?.durationSeconds;
                const active = current === opt.secs;
                return (
                  <TouchableOpacity
                    key={opt.secs}
                    style={[zpStyles.item, active && zpStyles.itemActive]}
                    onPress={() => {
                      if (zonePickerFor !== null) updateZone(zonePickerFor, { durationSeconds: opt.secs });
                      setZonePickerFor(null);
                    }}
                  >
                    <Text style={[zpStyles.itemText, active && zpStyles.itemTextActive]}>{opt.label}</Text>
                    {active && <Text style={zpStyles.check}>✓</Text>}
                  </TouchableOpacity>
                );
              })}
            </View>
          </TouchableOpacity>
        </Modal>

        {/* Summary + overflow warning */}
        {p.zones.length > 0 && p.startTimes.length > 0 && (
          <View style={styles.summaryBox}>
            <Text style={styles.summaryText}>
              Total runs: <Text style={{ fontWeight: '700' }}>{runCount}</Text> per active day
            </Text>
            {overflow && (
              <Text style={styles.overflowText}>
                Exceeds {FIRMWARE_RUN_CAP}-run firmware limit. Reduce zones, start times, or split into multiple programs.
              </Text>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: '#f0f4f8' },
  tabHeader:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  tabTitle:         { fontSize: 17, fontWeight: '700', color: '#111827' },
  center:           { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyText:        { color: '#9ca3af', fontSize: 15, textAlign: 'center', marginBottom: 20 },
  addFirstBtn:      { backgroundColor: '#1a56db', borderRadius: 8, paddingVertical: 12, paddingHorizontal: 28 },
  addFirstBtnText:  { color: '#fff', fontWeight: '600', fontSize: 15 },
  card:             { backgroundColor: '#fff', marginHorizontal: 16, marginTop: 10, borderRadius: 10, padding: 14, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  cardHeader:       { flexDirection: 'row', alignItems: 'center' },
  swipeDeleteBtn:   { backgroundColor: '#dc2626', justifyContent: 'center', alignItems: 'center', width: 80, marginHorizontal: 16, marginTop: 10, borderRadius: 10 },
  swipeDeleteText:  { color: '#fff', fontWeight: '700', fontSize: 12, textAlign: 'center' },
  programName:      { fontSize: 16, fontWeight: '600', color: '#111827' },
  programSub:       { fontSize: 12, color: '#6b7280', marginTop: 2 },
  programSub2:      { fontSize: 12, color: '#9ca3af', marginTop: 1 },
  fieldLabel:       { fontSize: 13, color: '#6b7280', marginBottom: 6, marginTop: 12 },
  textInput:        { backgroundColor: '#fff', borderRadius: 8, padding: 10, fontSize: 15, color: '#111827', borderWidth: 1, borderColor: '#e5e7eb' },
  rowInline:        { flexDirection: 'row', gap: 8, marginBottom: 6, alignItems: 'center' },
  rowInlinePress:   { flex: 1, backgroundColor: '#fff', borderRadius: 8, padding: 12, borderWidth: 1, borderColor: '#e5e7eb', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowInlineText:    { fontSize: 15, color: '#111827' },
  dateChevron:      { fontSize: 18, color: '#9ca3af' },
  smallRemoveBtn:   { width: 36, height: 36, borderRadius: 8, backgroundColor: '#fee2e2', alignItems: 'center', justifyContent: 'center' },
  smallRemoveText:  { color: '#dc2626', fontSize: 20, lineHeight: 22, fontWeight: '400' },
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
  daysHeader:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  dayActionText:    { fontSize: 12, color: '#1a56db', fontWeight: '600' },
  dayRow:           { flexDirection: 'row', gap: 6, marginTop: 4, flexWrap: 'wrap' },
  dayBtn:           { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: '#d1d5db', backgroundColor: '#f9fafb' },
  dayBtnActive:     { backgroundColor: '#1a56db', borderColor: '#1a56db' },
  dayBtnText:       { fontSize: 13, color: '#6b7280', fontWeight: '500' },
  dayBtnTextActive: { color: '#fff' },
  zoneRow:          { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6, backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb', padding: 10 },
  zoneRowName:      { flex: 1, fontSize: 14, color: '#111827' },
  zoneDurPill:      { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, backgroundColor: '#e0e7ff' },
  zoneDurText:      { fontSize: 13, color: '#1a56db', fontWeight: '600' },
  addRunBtn:        { marginTop: 6, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#1a56db', alignItems: 'center' },
  addRunText:       { color: '#1a56db', fontWeight: '600', fontSize: 14 },
  summaryBox:       { marginTop: 16, backgroundColor: '#f9fafb', borderRadius: 8, padding: 12 },
  summaryText:      { fontSize: 13, color: '#374151' },
  overflowText:     { marginTop: 4, fontSize: 12, color: '#dc2626' },
  slotUsage:        { marginTop: 8, fontSize: 11, color: '#9ca3af', textAlign: 'center' },
  waagToggle:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  waagToggleText:   { fontSize: 12, color: '#6b7280', fontWeight: '600' },
  waagZoomText:     { fontSize: 12, color: '#1a56db', fontWeight: '600' },
  firmwareRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12, marginTop: 'auto' as any },
  firmwareLabel:    { fontSize: 11, color: '#c4c9d4' },
  debugBadge:       { backgroundColor: '#dc2626', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  debugText:        { color: '#fff', fontSize: 10, fontWeight: '700', letterSpacing: 1 },
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
