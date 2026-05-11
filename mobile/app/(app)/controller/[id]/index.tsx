import { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  ActivityIndicator, StyleSheet, Alert, Animated, useWindowDimensions,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { useLocalSearchParams, Stack } from 'expo-router';
import { useControllerStore } from '@/store/controllers';
import { useControllerConnection, ZoneData } from '@/context/ControllerConnection';
import { sliderToSeconds, secondsToSlider, formatDurationLabel } from '@/utils/durationSlider';

const ZONE_COLORS: Record<number, string> = {
  1: '#ffffff', 2: '#ff0000', 3: '#ff8000', 4: '#ffff00',
  5: '#00ff00', 6: '#0000ff', 7: '#4b0082', 8: '#9400d3',
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
  const opacity     = anim.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] });
  const translateY  = anim.interpolate({ inputRange: [0, 1], outputRange: [0, -3] });
  return (
    <Animated.Text style={{ opacity, transform: [{ translateY }], fontSize: 16, marginLeft: 4 }}>
      💦
    </Animated.Text>
  );
}

export default function ControllerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const ctrl   = useControllerStore(s => s.controllers.find(c => c.id === id));
  const { width } = useWindowDimensions();

  const { connecting, connected, reconnect, zones, status, execCommand, setZones } =
    useControllerConnection();

  const [durationSecs, setDurationSecs]             = useState(60);
  const [skipStopAllConfirm, setSkipStopAllConfirm] = useState(false);

  const COLS    = 2;
  const GAP     = 12;
  const PADDING = 16;
  const badgeSize = (width - PADDING * 2 - GAP * (COLS - 1)) / COLS;

  async function handleTapZone(zoneId: number) {
    const zone = zones.find(z => z.id === zoneId);
    if (!zone) return;
    if (zone.status === 'idle') {
      try {
        await execCommand('start_zone', { id: zoneId, duration: durationSecs });
        setZones(prev => prev.map(z =>
          z.id === zoneId ? { ...z, status: 'pending', runtime_seconds: durationSecs } : z
        ));
      } catch (e: any) {
        Alert.alert('Error', e?.message ?? 'Failed to start zone');
      }
    } else {
      try {
        await execCommand('stop_zone', { id: zoneId });
        setZones(prev => prev.map(z =>
          z.id === zoneId ? { ...z, status: 'idle', runtime_seconds: 0 } : z
        ));
      } catch (e: any) {
        Alert.alert('Error', e?.message ?? 'Failed to stop zone');
      }
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

  const anyRunning = zones.some(z => z.status === 'running' || z.status === 'pending');

  const rows: ZoneData[][] = [];
  for (let i = 0; i < zones.length; i += COLS) {
    rows.push(zones.slice(i, i + COLS));
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{
        title: ctrl?.name ?? 'Controller',
        headerRight: () => (
          <TouchableOpacity onPress={handleStopAll} style={styles.stopAllHeaderBtn} disabled={!connected || !anyRunning}>
            <Text style={[styles.stopAllHeaderText, (!connected || !anyRunning) && { opacity: 0.3 }]}>■ Stop All</Text>
          </TouchableOpacity>
        ),
      }} />

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
        {/* Shared duration slider */}
        <View style={styles.sliderCard}>
          <View style={styles.sliderHeader}>
            <Text style={styles.sliderLabel}>Duration</Text>
            <Text style={styles.sliderValue}>{formatDurationLabel(durationSecs)}</Text>
          </View>
          <Slider
            style={{ width: '100%', height: 40 }}
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
        </View>

        <Text style={styles.hint}>
          {anyRunning ? 'Tap a running zone to stop it.' : 'Tap a zone to run it for the selected duration.'}
        </Text>

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
                  activeOpacity={0.7}
                  onPress={() => connected && handleTapZone(z.id)}
                  style={[
                    styles.badge,
                    { width: badgeSize },
                    isRunning && styles.badgeRunning,
                    isPending && styles.badgePending,
                    !connected && styles.btnDisabled,
                  ]}
                >
                  <View style={styles.badgeHeader}>
                    <View style={[styles.zoneLed, { backgroundColor: ledColor }]} />
                    <Text style={styles.zoneName} numberOfLines={1}>{z.name}</Text>
                    {(isRunning || isPending) && <SprinklerIcon />}
                  </View>

                  <Text style={[
                    styles.badgeStatus,
                    isRunning && styles.badgeStatusRunning,
                    isPending && styles.badgeStatusPending,
                  ]}>
                    {isRunning ? `▶ ${formatRuntime(z.runtime_seconds)}` :
                     isPending ? '… Pending' : 'Tap to run'}
                  </Text>
                </TouchableOpacity>
              );
            })}
            {row.length < COLS && <View style={{ width: badgeSize }} />}
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
  sliderCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 12,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  sliderHeader:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  sliderLabel:    { fontSize: 13, color: '#6b7280', fontWeight: '500' },
  sliderValue:    { fontSize: 18, fontWeight: '700', color: '#1a56db' },
  sliderLabels:   { flexDirection: 'row', justifyContent: 'space-between', marginTop: -4 },
  sliderEndLabel: { fontSize: 11, color: '#9ca3af' },
  sliderMidLabel: { fontSize: 11, color: '#9ca3af' },
  hint:        { fontSize: 12, color: '#9ca3af', marginBottom: 10, textAlign: 'center' },
  gridRow:     { flexDirection: 'row', justifyContent: 'space-between' },
  badge: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  badgeRunning: { borderWidth: 1.5, borderColor: '#16a34a' },
  badgePending: { borderWidth: 1.5, borderColor: '#f59e0b' },
  badgeHeader:  { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  zoneLed:      { width: 12, height: 12, borderRadius: 6, marginRight: 7, borderWidth: 1, borderColor: '#e5e7eb', flexShrink: 0 },
  zoneName:     { fontSize: 14, fontWeight: '700', color: '#111827', flex: 1 },
  badgeStatus:  { fontSize: 12, color: '#9ca3af' },
  badgeStatusRunning: { color: '#16a34a', fontWeight: '600' },
  badgeStatusPending: { color: '#f59e0b', fontWeight: '600' },
  btnDisabled:  { opacity: 0.35 },
  stopAllHeaderBtn:  { marginRight: 8, paddingHorizontal: 8, paddingVertical: 4 },
  stopAllHeaderText: { color: '#fca5a5', fontWeight: '600', fontSize: 13 },
});
