import { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, ActivityIndicator,
  StyleSheet, Alert, Animated, Modal, Dimensions,
  TextInput, KeyboardAvoidingView, Platform, Image,
} from 'react-native';

const SCREEN_WIDTH = Dimensions.get('window').width;
const PHOTO_REVEAL_HEIGHT = SCREEN_WIDTH * 9 / 16; // 16:9 aspect
import Slider from '@react-native-community/slider';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import { useLocalSearchParams } from 'expo-router';
import { useControllerStore } from '@/store/controllers';
import { useControllerConnection, ZoneData } from '@/context/ControllerConnection';
import { controllerStore } from '@/lib/controllerStore';
import {
  sliderToMinutes, minutesToSlider, sliderToSeconds, formatDurationLabel,
  SLIDER_MAX_POS, SLIDER_LABELS,
} from '@/utils/durationSlider';
import { uploadZonePhoto, deleteZonePhoto } from '@/services/cloudApi';
let ImagePicker: typeof import('expo-image-picker') | null = null;
try { ImagePicker = require('expo-image-picker'); } catch {}

// Zone color for the inactive border (index 0 = unused)
const ZONE_COLORS: Record<number, string> = {
  1: '#6b7280', 2: '#ef4444', 3: '#f97316', 4: '#eab308',
  5: '#22c55e', 6: '#3b82f6', 7: '#6366f1', 8: '#a855f7',
  9: '#ff1493', 10: '#00ffff', 11: '#80ff00', 12: '#ff00ff',
};

function SprinklerIcon() {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 600, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  const opacity    = anim.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] });
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [0, -3] });
  return (
    <Animated.Text style={{ opacity, transform: [{ translateY }], fontSize: 16, marginLeft: 4 }}>
      💦
    </Animated.Text>
  );
}

export default function ControllerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const ctrl = useControllerStore(s => s.controllers.find(c => c.id === id));
  const { updateController } = useControllerStore();

  const { connecting, connected, reconnect, zones, status, execCommand, setZones, storeKey } =
    useControllerConnection();

  const [sliderPos, setSliderPos]     = useState(minutesToSlider(process.env.EXPO_PUBLIC_DEBUG_MODE === 'true' ? 1 : 5));
  const [customMins, setCustomMins]   = useState<number | null>(null); // set when >60m via picker
  const [showTimePicker, setShowTimePicker] = useState(false);

  const [renameZone, setRenameZone]   = useState<{ id: number; name: string } | null>(null);
  const [renameInput, setRenameInput] = useState('');
  const [savingRename, setSavingRename] = useState(false);
  const [revealPhoto, setRevealPhoto] = useState<string | null>(null);
  const revealAnim = useRef(new Animated.Value(0)).current;
  const renameInputRef = useRef<TextInput>(null);

  function openRevealPhoto(url: string) {
    setRevealPhoto(url);
    Animated.spring(revealAnim, { toValue: 1, useNativeDriver: false, tension: 60, friction: 10 }).start();
  }

  function closeRevealPhoto() {
    Animated.timing(revealAnim, { toValue: 0, duration: 200, useNativeDriver: false }).start(() => setRevealPhoto(null));
  }

  const COLS    = 2;
  const GAP     = 12;
  const PADDING = 16;

  const durationMins = customMins ?? sliderToMinutes(sliderPos);
  const durationSecs = durationMins * 60;

  // Focus the rename input after modal appears
  useEffect(() => {
    if (renameZone !== null) {
      const t = setTimeout(() => {
        renameInputRef.current?.focus();
      }, 150);
      return () => clearTimeout(t);
    }
  }, [renameZone]);

  async function handleTapZone(zoneId: number) {
    const zone = zones.find(z => z.id === zoneId);
    if (!zone) return;

    if (zone.status === 'idle') {
      if (revealPhoto) closeRevealPhoto();
      const controllerBusy = zones.some(
        z => z.id !== zoneId && (z.status === 'running' || z.status === 'pending')
      );
      if (controllerBusy) {
        controllerStore.enqueue(storeKey, zoneId);
        setZones(prev => prev.map(z =>
          z.id === zoneId ? { ...z, status: 'pending', runtime_seconds: durationSecs } : z
        ));
      } else {
        setZones(prev => prev.map(z =>
          z.id === zoneId ? { ...z, status: 'running', runtime_seconds: durationSecs } : z
        ));
      }
      try {
        await execCommand('start_zone', { id: zoneId, duration: durationSecs });
      } catch (e: any) {
        controllerStore.dequeue(storeKey, zoneId);
        setZones(prev => prev.map(z =>
          z.id === zoneId ? { ...z, status: 'idle', runtime_seconds: 0 } : z
        ));
        Alert.alert('Error', e?.message ?? 'Failed to start zone');
      }
    } else {
      if (zone.source === 'scheduler' && !ctrl?.skipScheduleStopConfirm) {
        Alert.alert(
          'Zone Running on Schedule',
          `${zone.name} is running as part of a schedule. Stop it?`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: "Stop — don't ask again",
              onPress: () => {
                if (ctrl) updateController(ctrl.deviceId, { skipScheduleStopConfirm: true });
                doStopZone(zoneId);
              },
            },
            { text: 'Stop', style: 'destructive', onPress: () => doStopZone(zoneId) },
          ]
        );
      } else {
        doStopZone(zoneId);
      }
    }
  }

  async function doStopZone(zoneId: number) {
    controllerStore.dequeue(storeKey, zoneId);
    setZones(prev => prev.map(z =>
      z.id === zoneId ? { ...z, status: 'idle', runtime_seconds: 0 } : z
    ));
    try {
      await execCommand('stop_zone', { id: zoneId });
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to stop zone');
    }
  }

  function handleLongPressZone(zone: ZoneData) {
    setRenameInput(zone.name);
    setRenameZone({ id: zone.id, name: zone.name });
    setTimeout(() => renameInputRef.current?.focus(), 100);
  }

  function handleZonePhoto() {
    if (!renameZone) return;
    const mac = ctrl?.mac;
    if (!mac) { Alert.alert('Error', 'No MAC address'); return; }
    if (!ImagePicker) { Alert.alert('Rebuild Required', 'Run `npx expo run:android` to enable camera.'); return; }

    const zone = zones.find(z => z.id === renameZone.id);
    const hasPhoto = !!(zone as any)?.photoUrl;

    const buttons: { text: string; style?: 'cancel' | 'destructive' | 'default'; onPress?: () => void }[] = [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Take Photo', onPress: () => launchZonePhoto(ImagePicker!.launchCameraAsync, mac, renameZone.id) },
      { text: 'Choose from Library', onPress: () => launchZonePhoto(ImagePicker!.launchImageLibraryAsync, mac, renameZone.id) },
    ];
    if (hasPhoto) {
      buttons.push({ text: 'Remove Photo', style: 'destructive', onPress: async () => {
        try {
          await deleteZonePhoto(mac, renameZone.id);
          controllerStore.setZonePhoto(storeKey, renameZone.id, null);
        } catch (e: any) { Alert.alert('Error', e?.message ?? 'Failed to remove photo'); }
      }});
    }
    Alert.alert('Zone Photo', undefined, buttons);
  }

  async function launchZonePhoto(
    launch: typeof import('expo-image-picker').launchCameraAsync,
    mac: string, zoneId: number,
  ) {
    const result = await launch({ mediaTypes: ['images'], quality: 0.7, allowsEditing: true, aspect: [16, 9] });
    if (result.canceled) return;
    const uri = result.assets[0].uri;
    try {
      const res = await uploadZonePhoto(mac, zoneId, uri);
      controllerStore.setZonePhoto(storeKey, zoneId, res.photoUrl);
    } catch (e: any) { Alert.alert('Error', e?.message ?? 'Upload failed'); }
  }

  async function handleRenameSave() {
    if (!renameZone) return;
    const trimmed = renameInput.trim();
    if (!trimmed) return;
    setSavingRename(true);
    try {
      await execCommand('update_zone', { id: renameZone.id, name: trimmed });
      setRenameZone(null);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to rename zone');
    } finally {
      setSavingRename(false);
    }
  }

  async function executeStopAll() {
    try {
      await execCommand('stop_all');
      setZones(prev => prev.map(z => ({ ...z, status: 'idle' as const, runtime_seconds: 0 })));
      zones.forEach(z => controllerStore.dequeue(storeKey, z.id));
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to stop all zones');
    }
  }

  function handleStopAll() {
    if (ctrl?.skipStopAllConfirm) { executeStopAll(); return; }
    Alert.alert('Stop All Zones', 'Stop all running and queued zones?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: "Stop — don't ask again",
        onPress: () => {
          if (ctrl) updateController(ctrl.deviceId, { skipStopAllConfirm: true });
          executeStopAll();
        },
      },
      { text: 'Stop All', style: 'destructive', onPress: executeStopAll },
    ]);
  }

  function formatRuntime(secs: number): string {
    const m = Math.floor(secs / 60), s = secs % 60;
    return m > 0 ? `${m}m${s > 0 ? ` ${s}s` : ''}` : `${s}s`;
  }

  function handleTimePickerConfirm(date: Date) {
    setShowTimePicker(false);
    const total = date.getHours() * 60 + date.getMinutes();
    if (total < 1) return;
    if (total > 60) {
      setCustomMins(total);
    } else {
      setCustomMins(null);
      setSliderPos(minutesToSlider(total));
    }
  }

  if (connecting && zones.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1a56db" />
        <Text style={styles.statusText}>Connecting…</Text>
      </View>
    );
  }

  const anyRunning = zones.some(z => z.status === 'running' || z.status === 'pending');

  const rows: ZoneData[][] = [];
  for (let i = 0; i < zones.length; i += COLS) {
    rows.push(zones.slice(i, i + COLS));
  }

  return (
    <View style={styles.container}>
      {connecting && zones.length > 0 && (
        <View style={styles.reconnectingBar}>
          <ActivityIndicator size="small" color="#1a56db" style={{ marginRight: 8 }} />
          <Text style={styles.reconnectingText}>Reconnecting…</Text>
        </View>
      )}
      {!connected && !connecting && zones.length === 0 && (
        <View style={styles.disconnectedBanner}>
          <Text style={styles.disconnectedText}>Reconnecting…</Text>
          <TouchableOpacity onPress={reconnect}>
            <Text style={styles.reconnectText}>Retry now</Text>
          </TouchableOpacity>
        </View>
      )}

      {revealPhoto && (
        <Animated.View style={{ height: revealAnim.interpolate({ inputRange: [0, 1], outputRange: [0, PHOTO_REVEAL_HEIGHT] }), overflow: 'hidden' }}>
          <View style={{ width: SCREEN_WIDTH, height: PHOTO_REVEAL_HEIGHT }}>
            <Image source={{ uri: revealPhoto }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          </View>
        </Animated.View>
      )}

      <ScrollView contentContainerStyle={{ padding: PADDING, paddingBottom: 32 }}>
        {/* Duration slider */}
        <TouchableOpacity
          activeOpacity={1}
          onLongPress={() => setShowTimePicker(true)}
          delayLongPress={600}
          style={styles.sliderCard}
        >
          <View style={styles.sliderHeader}>
            <Text style={styles.sliderLabel}>Duration</Text>
            <Text style={styles.sliderValue}>{formatDurationLabel(durationSecs)}</Text>
          </View>

          {customMins !== null ? (
            /* Custom >60m mode: grayed slider, tap anywhere to reset to slider */
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => { setCustomMins(null); setSliderPos(minutesToSlider(60)); }}
              style={styles.customDurationRow}
            >
              <Text style={styles.customDurationText}>Tap to use slider</Text>
            </TouchableOpacity>
          ) : (
            /* Normal slider + labels */
            <View style={styles.sliderWrapper}>
              <Slider
                style={{ width: '100%', height: 36 }}
                minimumValue={0}
                maximumValue={SLIDER_MAX_POS}
                value={sliderPos}
                onValueChange={pos => setSliderPos(minutesToSlider(sliderToMinutes(pos)))}
                onSlidingComplete={pos => setSliderPos(minutesToSlider(sliderToMinutes(pos)))}
                minimumTrackTintColor="#1a56db"
                maximumTrackTintColor="#d1d5db"
                thumbTintColor="#1a56db"
              />
              <View style={styles.labelRow}>
                {SLIDER_LABELS.map(({ pos, mins, label }) => (
                  <TouchableOpacity
                    key={mins}
                    style={[styles.labelItem, { left: `${pos}%` as any }]}
                    onPress={() => setSliderPos(minutesToSlider(mins))}
                    hitSlop={{ top: 6, bottom: 6, left: 10, right: 10 }}
                  >
                    <Text style={[
                      styles.labelText,
                      durationMins === mins && styles.labelTextActive,
                    ]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          <Text style={styles.longPressHint}>Hold for exact time</Text>
        </TouchableOpacity>

        <Text style={styles.hint}>Tap to start/stop · Long-press to rename</Text>

        {rows.map((row, ri) => (
          <View key={ri} style={[styles.gridRow, ri > 0 && { marginTop: GAP }]}>
            {row.map((z) => {
              const isRunning  = z.status === 'running';
              const isPending  = z.status === 'pending';
              const zoneColor  = ZONE_COLORS[z.id] ?? '#e5e7eb';

              const borderColor = zoneColor;
              const bgColor = isRunning ? '#f0fdf4' : isPending ? '#fffbeb' : '#fff';

              let statusText = '';
              if (isRunning) {
                statusText = z.source === 'scheduler'
                  ? `${formatRuntime(z.runtime_seconds)} (Scheduled)`
                  : formatRuntime(z.runtime_seconds);
              } else if (isPending) {
                const pos = controllerStore.queuePosition(storeKey, z.id);
                statusText = pos === 1 ? 'Next' : pos != null ? `#${pos}` : '';
              }

              const baseUrl = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000/api').replace(/\/api$/, '');
              const photoUrl = (z as any).photoUrl
                ? `${baseUrl}${(z as any).photoUrl}`
                : null;

              return (
                <TouchableOpacity
                  key={z.id}
                  activeOpacity={0.7}
                  onPress={() => handleTapZone(z.id)}
                  onLongPress={() => handleLongPressZone(z)}
                  delayLongPress={500}
                  style={[
                    styles.badge,
                    { borderColor, backgroundColor: bgColor },
                    !connected && styles.btnDisabled,
                  ]}
                >
                  {photoUrl && (
                    <Image
                      source={{ uri: photoUrl }}
                      style={styles.badgeBgPhoto}
                      resizeMode="cover"
                    />
                  )}
                  <View style={styles.badgeContent}>
                    <View style={styles.badgeHeader}>
                      <Text style={[styles.zoneName, photoUrl && styles.zoneNameOnPhoto]} numberOfLines={1}>{z.name || `Zone ${z.id}`}</Text>
                      {isRunning && <SprinklerIcon />}
                      {isPending && (
                        <ActivityIndicator
                          size="small"
                          color="#f59e0b"
                          style={{ marginLeft: 4, transform: [{ scale: 0.75 }] }}
                        />
                      )}
                    </View>

                    <View style={styles.badgeBottom}>
                      <Text style={[
                        styles.badgeStatus,
                        isRunning && styles.badgeStatusRunning,
                        isPending && styles.badgeStatusPending,
                      ]}>
                        {statusText}
                      </Text>
                      {photoUrl && (
                        <TouchableOpacity
                          onPress={() => revealPhoto === photoUrl ? closeRevealPhoto() : openRevealPhoto(photoUrl)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          style={styles.badgeChevronBtn}
                        >
                          <Text style={styles.badgeChevron}>{revealPhoto === photoUrl ? '▴' : '▾'}</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
            {row.length < COLS && <View style={{ flex: 1 }} />}
          </View>
        ))}

        {anyRunning && (
          <TouchableOpacity
            style={styles.stopAllLink}
            onPress={handleStopAll}
            disabled={!connected}
          >
            <Text style={[styles.stopAllLinkText, !connected && styles.stopAllLinkDisabled]}>
              Stop All Zones
            </Text>
          </TouchableOpacity>
        )}

        {(status as any).firmware && (
          <View style={styles.firmwareRow}>
            <Text style={styles.firmwareLabel}>Firmware {(status as any).firmware}</Text>
            {process.env.EXPO_PUBLIC_DEBUG_MODE === 'true' && (
              <View style={styles.debugBadge}>
                <Text style={styles.debugText}>DEBUG</Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      <DateTimePickerModal
        isVisible={showTimePicker}
        mode="time"
        date={(() => {
          const d = new Date();
          d.setHours(Math.floor(durationMins / 60), durationMins % 60, 0, 0);
          return d;
        })()}
        is24Hour
        onConfirm={handleTimePickerConfirm}
        onCancel={() => setShowTimePicker(false)}
        display="spinner"
      />

      {/* Zone edit modal */}
      <Modal
        visible={renameZone !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setRenameZone(null)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Zone {renameZone?.id}</Text>
              <TouchableOpacity onPress={handleZonePhoto} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                {(() => {
                  const zone = zones.find(z => z.id === renameZone?.id);
                  const photo = (zone as any)?.photoUrl;
                  const baseUrl = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000/api').replace(/\/api$/, '');
                  return photo
                    ? <Image source={{ uri: `${baseUrl}${photo}` }} style={{ width: 128, height: 72, borderRadius: 6 }} resizeMode="cover" />
                    : <Text style={{ fontSize: 22 }}>📷</Text>;
                })()}
              </TouchableOpacity>
            </View>
            <TextInput
              ref={renameInputRef}
              style={styles.modalInput}
              value={renameInput}
              onChangeText={setRenameInput}
              maxLength={31}
              returnKeyType="done"
              onSubmitEditing={handleRenameSave}
              placeholder="Zone name"
              placeholderTextColor="#9ca3af"
              selectTextOnFocus
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalBtnCancel}
                onPress={() => setRenameZone(null)}
                disabled={savingRename}
              >
                <Text style={styles.modalBtnCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtnSave, savingRename && { opacity: 0.6 }]}
                onPress={handleRenameSave}
                disabled={savingRename || !renameInput.trim()}
              >
                {savingRename
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.modalBtnSaveText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#f0f4f8' },
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center' },
  statusText:  { marginTop: 16, fontSize: 16, color: '#6b7280' },
  firmwareRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 24, paddingBottom: 12 },
  firmwareLabel: { fontSize: 11, color: '#c4c9d4' },
  debugBadge:    { backgroundColor: '#dc2626', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  debugText:     { color: '#fff', fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  reconnectingBar: {
    backgroundColor: '#eff6ff', borderBottomWidth: 1, borderBottomColor: '#bfdbfe',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 6,
  },
  reconnectingText: { color: '#1a56db', fontSize: 12, fontWeight: '500' },
  disconnectedBanner: {
    backgroundColor: '#fef2f2', borderBottomWidth: 1, borderBottomColor: '#fecaca',
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10,
  },
  disconnectedText: { color: '#dc2626', fontWeight: '600' },
  reconnectText:    { color: '#1a56db', fontWeight: '600' },
  sliderCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 12,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  sliderHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  sliderLabel:   { fontSize: 13, color: '#6b7280', fontWeight: '500' },
  sliderValue:   { fontSize: 18, fontWeight: '700', color: '#1a56db' },
  sliderWrapper: { position: 'relative', paddingBottom: 24, paddingRight: 12 },
  labelRow:      { position: 'absolute', bottom: 0, left: 0, right: 12, height: 18 },
  labelItem:     { position: 'absolute', transform: [{ translateX: -16 }] },
  labelText:     { fontSize: 11, color: '#9ca3af', textAlign: 'center', width: 32 },
  labelTextActive: { color: '#1a56db', fontWeight: '700' },
  longPressHint: { fontSize: 10, color: '#d1d5db', textAlign: 'right', marginTop: 2 },
  customDurationRow: { alignItems: 'center', paddingVertical: 14 },
  customDurationText: { fontSize: 13, color: '#9ca3af' },
  hint:        { fontSize: 12, color: '#9ca3af', marginBottom: 10, textAlign: 'center' },
  gridRow:     { flexDirection: 'row', gap: 12 },
  badge: {
    flex: 1,
    backgroundColor: '#fff', borderRadius: 12,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
    borderWidth: 2,
    overflow: 'hidden',
  },
  badgeBgPhoto:   { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 10, opacity: 0.2 },
  badgeBottom:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 },
  badgeChevronBtn:{ paddingHorizontal: 10, paddingVertical: 0 },
  badgeChevron:   { fontSize: 24, color: '#374151', fontWeight: '700', lineHeight: 26 },
  badgeContent:   { padding: 10 },
  badgeHeader:  { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  zoneName:         { fontSize: 14, fontWeight: '700', color: '#111827', flex: 1 },
  zoneNameOnPhoto:  { textShadowColor: 'rgba(255,255,255,0.8)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 3 },
  badgeStatus:        { fontSize: 12, color: 'transparent', lineHeight: 16 },
  badgeStatusRunning: { color: '#16a34a', fontWeight: '600' },
  badgeStatusPending: { color: '#f59e0b', fontWeight: '600' },
  btnDisabled:  { opacity: 0.35 },
  stopAllLink:  { marginTop: 24, alignItems: 'center', paddingVertical: 10 },
  stopAllLinkText:     { fontSize: 14, color: '#dc2626', fontWeight: '600' },
  stopAllLinkDisabled: { opacity: 0.35 },
  modalOverlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  modalCard:       { backgroundColor: '#fff', borderRadius: 14, padding: 24, width: '82%', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12, elevation: 8 },
  modalHeader:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle:      { fontSize: 17, fontWeight: '700', color: '#111827' },
  modalInput:      { borderWidth: 1.5, borderColor: '#1a56db', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: '#111827', backgroundColor: '#f9fafb' },
  modalButtons:    { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 20 },
  modalBtnCancel:  { paddingVertical: 8, paddingHorizontal: 16 },
  modalBtnCancelText: { fontSize: 15, color: '#6b7280', fontWeight: '500' },
  modalBtnSave:    { backgroundColor: '#1a56db', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 20 },
  modalBtnSaveText:{ fontSize: 15, color: '#fff', fontWeight: '600' },
});
