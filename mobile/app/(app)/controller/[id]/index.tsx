import { useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  ActivityIndicator, StyleSheet, Alert, Modal, useWindowDimensions,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { useLocalSearchParams, Stack } from 'expo-router';
import { useControllerStore } from '@/store/controllers';
import { useControllerConnection, ZoneData } from '@/context/ControllerConnection';
import { sliderToSeconds, secondsToSlider, formatDurationLabel } from '@/utils/durationSlider';

// Mirrors ZoneLed::colorForZone in firmware
const ZONE_COLORS: Record<number, string> = {
  1: '#ffffff', // White
  2: '#ff0000', // Red
  3: '#ff8000', // Orange
  4: '#ffff00', // Yellow
  5: '#00ff00', // Green
  6: '#0000ff', // Blue
  7: '#4b0082', // Indigo
  8: '#9400d3', // Violet
};

export default function ControllerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const ctrl   = useControllerStore(s => s.controllers.find(c => c.id === id));
  const { width } = useWindowDimensions();

  const { connecting, connected, reconnect, zones, status, execCommand, setZones } =
    useControllerConnection();

  const [durationSecs, setDurationSecs]             = useState(60);
  const [pendingZone, setPendingZone]               = useState<number | null>(null);
  const [skipStopAllConfirm, setSkipStopAllConfirm] = useState(false);

  const COLS    = 2;
  const GAP     = 12;
  const PADDING = 16;
  const badgeSize = (width - PADDING * 2 - GAP * (COLS - 1)) / COLS;

  function handleStartZone(zoneId: number) {
    setDurationSecs(60);
    setPendingZone(zoneId);
  }

  async function confirmStartZone() {
    const zoneId = pendingZone;
    setPendingZone(null);
    if (zoneId === null) return;
    try {
      await execCommand('start_zone', { id: zoneId, duration: durationSecs });
      setZones(prev => prev.map(z =>
        z.id === zoneId ? { ...z, status: 'pending', runtime_seconds: durationSecs } : z
      ));
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to start zone');
    }
  }

  async function handleStopZone(zoneId: number) {
    try {
      await execCommand('stop_zone', { id: zoneId });
      setZones(prev => prev.map(z =>
        z.id === zoneId ? { ...z, status: 'idle', runtime_seconds: 0 } : z
      ));
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to stop zone');
    }
  }

  async function executeStopAll() {
    try {
      await execCommand('stop_all');
      setZones(prev => prev.map(z => ({ ...z, status: 'idle' as const, runtime_seconds: 0 })));
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to stop all zones');
    }
  }

  function handleStopAll() {
    if (skipStopAllConfirm) { executeStopAll(); return; }
    Alert.alert('Stop All Zones', 'Stop all running and queued zones?', [
      { text: 'Cancel', style: 'cancel' },
      { text: "Yes, and don't ask again", onPress: () => { setSkipStopAllConfirm(true); executeStopAll(); } },
      { text: 'Stop All', style: 'destructive', onPress: executeStopAll },
    ]);
  }

  function formatRuntime(secs: number): string {
    const m = Math.floor(secs / 60), s = secs % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  }

  if (connecting) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: ctrl?.name ?? 'Controller' }} />
        <ActivityIndicator size="large" color="#1a56db" />
        <Text style={styles.statusText}>Connecting…</Text>
      </View>
    );
  }

  // Build rows of 2
  const rows: ZoneData[][] = [];
  for (let i = 0; i < zones.length; i += COLS) {
    rows.push(zones.slice(i, i + COLS));
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{
        title: ctrl?.name ?? 'Controller',
        headerRight: () => (
          <TouchableOpacity onPress={handleStopAll} style={styles.stopAllHeaderBtn} disabled={!connected}>
            <Text style={[styles.stopAllHeaderText, !connected && { opacity: 0.4 }]}>■ Stop All</Text>
          </TouchableOpacity>
        ),
      }} />

      {/* Duration picker modal */}
      <Modal visible={pendingZone !== null} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Start Zone {pendingZone}</Text>
            <Text style={styles.modalDuration}>{formatDurationLabel(durationSecs)}</Text>
            <Slider
              style={styles.slider}
              minimumValue={0} maximumValue={100}
              value={secondsToSlider(durationSecs)}
              onValueChange={pos => setDurationSecs(sliderToSeconds(pos))}
              minimumTrackTintColor="#1a56db" maximumTrackTintColor="#d1d5db" thumbTintColor="#1a56db"
            />
            <View style={styles.sliderLabels}>
              <Text style={styles.sliderEndLabel}>5s</Text>
              <Text style={styles.sliderMidLabel}>1m</Text>
              <Text style={styles.sliderEndLabel}>60m</Text>
            </View>
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setPendingZone(null)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirm} onPress={confirmStartZone}>
                <Text style={styles.modalConfirmText}>▶ Start</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {!connected && !connecting && (
        <View style={styles.disconnectedBanner}>
          <Text style={styles.disconnectedText}>Reconnecting…</Text>
          <TouchableOpacity onPress={reconnect}>
            <Text style={styles.reconnectText}>Retry now</Text>
          </TouchableOpacity>
        </View>
      )}

      {(status as any).firmware && (
        <Text style={styles.firmwareLabel}>Firmware {(status as any).firmware}</Text>
      )}

      <ScrollView contentContainerStyle={{ padding: PADDING, paddingBottom: 24 }}>
        {rows.map((row, ri) => (
          <View key={ri} style={[styles.gridRow, ri > 0 && { marginTop: GAP }]}>
            {row.map((z) => {
              const isIdle    = z.status === 'idle';
              const isRunning = z.status === 'running';
              const isPending = z.status === 'pending';
              const ledColor  = ZONE_COLORS[z.id] ?? '#fff';

              return (
                <TouchableOpacity
                  key={z.id}
                  activeOpacity={isIdle ? 0.7 : 1}
                  onPress={() => isIdle && connected && handleStartZone(z.id)}
                  style={[
                    styles.badge,
                    { width: badgeSize },
                    isRunning && styles.badgeRunning,
                    isPending && styles.badgePending,
                    isIdle && !connected && styles.btnDisabled,
                  ]}
                >
                  {/* Header row: LED dot + name */}
                  <View style={styles.badgeHeader}>
                    <View style={[styles.zoneLed, { backgroundColor: ledColor }]} />
                    <Text style={styles.zoneName} numberOfLines={1}>{z.name}</Text>
                  </View>

                  {/* Status */}
                  <Text style={[
                    styles.badgeStatus,
                    isRunning && styles.badgeStatusRunning,
                    isPending && styles.badgeStatusPending,
                  ]}>
                    {isRunning ? `▶ ${formatRuntime(z.runtime_seconds)}` :
                     isPending ? '… Pending' : 'Tap to run'}
                  </Text>

                  {/* Stop/Cancel button — only shown when active */}
                  {!isIdle && (
                    <TouchableOpacity
                      style={[styles.badgeBtn, styles.badgeBtnStop, !connected && styles.btnDisabled]}
                      onPress={() => connected && handleStopZone(z.id)}
                    >
                      <Text style={styles.badgeBtnStopText}>
                        {isPending ? 'Cancel' : 'Stop'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              );
            })}
            {/* Fill empty cell in last row if odd count */}
            {row.length < COLS && (
              <View style={{ width: badgeSize }} />
            )}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#f0f4f8' },
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center' },
  statusText:  { marginTop: 16, fontSize: 16, color: '#6b7280' },
  firmwareLabel: { fontSize: 11, color: '#9ca3af', textAlign: 'center', paddingVertical: 4 },
  disconnectedBanner: {
    backgroundColor: '#fef2f2', borderBottomWidth: 1, borderBottomColor: '#fecaca',
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10,
  },
  disconnectedText: { color: '#dc2626', fontWeight: '600' },
  reconnectText:    { color: '#1a56db', fontWeight: '600' },
  gridRow:   { flexDirection: 'row', justifyContent: 'space-between' },
  badge: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  badgeRunning: { borderWidth: 1.5, borderColor: '#16a34a' },
  badgePending: { borderWidth: 1.5, borderColor: '#f59e0b' },
  badgeHeader:  { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  zoneLed:      { width: 12, height: 12, borderRadius: 6, marginRight: 7, borderWidth: 1, borderColor: '#e5e7eb', flexShrink: 0 },
  zoneName:     { fontSize: 14, fontWeight: '700', color: '#111827', flex: 1 },
  badgeStatus:  { fontSize: 12, color: '#9ca3af', marginBottom: 8 },
  badgeTapHint: { fontSize: 11, color: '#c7d2fe', marginBottom: 4 },
  badgeStatusRunning: { color: '#16a34a', fontWeight: '600' },
  badgeStatusPending: { color: '#f59e0b', fontWeight: '600' },
  badgeBtn:     { borderRadius: 7, paddingVertical: 8, alignItems: 'center' },
  badgeBtnRun:  { backgroundColor: '#eff6ff' },
  badgeBtnStop: { backgroundColor: '#fef2f2' },
  badgeBtnRunText:  { color: '#1a56db', fontWeight: '700', fontSize: 13 },
  badgeBtnStopText: { color: '#dc2626', fontWeight: '700', fontSize: 13 },
  btnDisabled:  { opacity: 0.35 },
  stopAllHeaderBtn:  { marginRight: 8, paddingHorizontal: 8, paddingVertical: 4 },
  stopAllHeaderText: { color: '#fca5a5', fontWeight: '600', fontSize: 13 },
  modalOverlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  modalBox:        { backgroundColor: '#fff', borderRadius: 14, padding: 24, width: '88%', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10, elevation: 8 },
  modalTitle:      { fontSize: 17, fontWeight: '700', color: '#111827', marginBottom: 12 },
  modalDuration:   { fontSize: 42, fontWeight: '700', color: '#1a56db', textAlign: 'center', marginBottom: 8 },
  slider:          { width: '100%', height: 40 },
  sliderLabels:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, marginTop: -4 },
  sliderEndLabel:  { fontSize: 11, color: '#9ca3af', width: 28 },
  sliderMidLabel:  { fontSize: 11, color: '#9ca3af', position: 'absolute', left: '25%', transform: [{ translateX: -8 }] },
  modalButtons:    { flexDirection: 'row', gap: 10 },
  modalCancel:     { flex: 1, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#d1d5db', alignItems: 'center' },
  modalCancelText: { color: '#374151', fontWeight: '600' },
  modalConfirm:    { flex: 1, padding: 12, borderRadius: 8, backgroundColor: '#1a56db', alignItems: 'center' },
  modalConfirmText:{ color: '#fff', fontWeight: '600' },
});
