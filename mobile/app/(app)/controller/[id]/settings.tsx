import { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator, StyleSheet,
  Alert, ScrollView, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import * as Location from 'expo-location';
import { useControllerConnection } from '@/context/ControllerConnection';
import { useControllerStore } from '@/store/controllers';

type TimeData = {
  epoch: number; synced: boolean;
  tz_offset: number; tz_dst: number; tz_name: string; tz_offset_str: string;
  lat?: number; lon?: number;
};

type StatusData = {
  firmware: string; build: string; mac: string; claimed: boolean;
  uptime_seconds: number;
  temperature_c: number; temperature_f: number;
  zones_running: boolean; ntp_synced: boolean;
  ram_free: number; ram_total?: number;
  active_schedule_name?: string;
  wifi_ssid?: string;
};

export default function SettingsScreen() {
  const { execCommand, connecting, connected } = useControllerConnection();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const ctrl = useControllerStore(s => s.controllers.find(c => c.id === id));
  const { updateController } = useControllerStore();

  const [loading, setLoading]     = useState(true);
  const [syncing, setSyncing]     = useState(false);
  const [savingWifi, setSavingWifi] = useState(false);
  const [timeData, setTimeData]   = useState<TimeData | null>(null);
  const [status, setStatus]       = useState<StatusData | null>(null);

  // Controller name editing
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput]     = useState(ctrl?.name ?? '');

  // WiFi editing
  const [wifiSsid, setWifiSsid]         = useState('');
  const [wifiPassword, setWifiPassword] = useState('');
  const [showWifiForm, setShowWifiForm] = useState(false);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (connected && !loadedRef.current) {
      loadedRef.current = true;
      load();
    }
  }, [connected]);

  async function load(): Promise<void> {
    setLoading(true);
    try {
      const [t, s] = await Promise.all([
        execCommand('get_time'),
        execCommand('get_status'),
      ]);
      setTimeData(t as TimeData);
      setStatus(s as StatusData);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to load status');
    } finally {
      setLoading(false);
    }
  }

  async function handleSyncFromPhone() {
    setSyncing(true);
    try {
      const tz     = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const offset = -new Date().getTimezoneOffset() * 60;
      const epoch  = Math.floor(Date.now() / 1000);

      // Try to get GPS — request permission, fail gracefully if denied
      let lat: number | undefined;
      let lon: number | undefined;
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          lat = pos.coords.latitude;
          lon = pos.coords.longitude;
        }
      } catch { /* GPS unavailable — sync time/timezone only */ }

      await execCommand('set_time', {
        epoch, tz_offset: offset, tz_dst: 0, tz_name: tz,
        ...(lat !== undefined && { lat, lon }),
      });
      const t = await execCommand('get_time');
      setTimeData(t as TimeData);

      const msg = lat !== undefined
        ? `Time, timezone, and GPS synced.`
        : `Time and timezone synced. (Location permission denied — GPS not synced.)`;
      Alert.alert('Synced', msg);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }

  function handleSaveName() {
    const trimmed = nameInput.trim();
    if (!trimmed) { Alert.alert('Name required'); return; }
    if (ctrl) updateController(ctrl.deviceId, { name: trimmed });
    setEditingName(false);
  }

  async function handleSaveWifi() {
    if (!wifiSsid.trim()) { Alert.alert('SSID required'); return; }
    setSavingWifi(true);
    try {
      await execCommand('set_wifi', { ssid: wifiSsid.trim(), password: wifiPassword });
      setShowWifiForm(false);
      setWifiSsid('');
      setWifiPassword('');
      Alert.alert('Saved', 'WiFi credentials saved. Controller will connect on next reboot.');
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to save WiFi');
    } finally {
      setSavingWifi(false);
    }
  }

  function formatUptime(secs: number): string {
    const d = Math.floor(secs / 86400);
    const h = Math.floor((secs % 86400) / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }

  function formatRam(free: number, total?: number): string {
    const kb = Math.round(free / 1024);
    if (total) {
      const pct = Math.round((free / total) * 100);
      return `${kb} KB (${pct}% free)`;
    }
    return `${kb} KB`;
  }

  if (connecting || loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#1a56db" /></View>;
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 48 }}>
        <Stack.Screen options={{ title: 'Settings' }} />

        {/* Controller name */}
        <Text style={styles.sectionHeader}>Controller Name</Text>
        <View style={styles.card}>
          {editingName ? (
            <View style={styles.nameEditRow}>
              <TextInput
                style={styles.nameInput}
                value={nameInput}
                onChangeText={setNameInput}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleSaveName}
                maxLength={32}
              />
              <TouchableOpacity style={styles.saveNameBtn} onPress={handleSaveName}>
                <Text style={styles.saveNameText}>Save</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelNameBtn} onPress={() => { setNameInput(ctrl?.name ?? ''); setEditingName(false); }}>
                <Text style={styles.cancelNameText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.nameRow} onPress={() => { setNameInput(ctrl?.name ?? ''); setEditingName(true); }}>
              <Text style={styles.nameText}>{ctrl?.name ?? 'Azul Controller'}</Text>
              <Text style={styles.editChevron}>✏</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* WiFi */}
        <Text style={styles.sectionHeader}>WiFi</Text>
        <View style={styles.card}>
          {showWifiForm ? (
            <>
              <Text style={styles.wifiLabel}>Network Name (SSID)</Text>
              <TextInput style={styles.textInput} value={wifiSsid} onChangeText={setWifiSsid} placeholder="Network name" autoCapitalize="none" />
              <Text style={[styles.wifiLabel, { marginTop: 10 }]}>Password</Text>
              <TextInput style={styles.textInput} value={wifiPassword} onChangeText={setWifiPassword} placeholder="Password" secureTextEntry autoCapitalize="none" />
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
                <TouchableOpacity style={[styles.button, { flex: 1 }, savingWifi && styles.buttonDisabled]} onPress={handleSaveWifi} disabled={savingWifi}>
                  {savingWifi ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Save</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={[styles.button, styles.buttonSecondary, { flex: 1 }]} onPress={() => setShowWifiForm(false)}>
                  <Text style={styles.buttonSecondaryText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              {status?.wifi_ssid ? (
                <Row label="Network" value={status.wifi_ssid} />
              ) : null}
              <TouchableOpacity style={styles.logLink} onPress={() => {
                setWifiSsid(status?.wifi_ssid ?? '');
                setShowWifiForm(true);
              }}>
                <Text style={styles.logLinkText}>Update WiFi Credentials</Text>
                <Text style={styles.logLinkChevron}>›</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Device Status */}
        <Text style={styles.sectionHeader}>Device Status</Text>
        <View style={styles.card}>
          {status && (
            <>
              <Row label="Build"       value={status.build} />
              <Row label="Firmware"    value={status.firmware} />
              <Row label="MAC"         value={status.mac} />
              <Row label="Memory"      value={formatRam(status.ram_free, status.ram_total)} />
              <Row label="NTP"         value={status.ntp_synced ? 'Synced' : 'Not synced'} />
              <Row label="Schedule"    value={status.active_schedule_name ?? 'None'} />
              <Row label="Temperature" value={`${status.temperature_c.toFixed(1)}°C  /  ${status.temperature_f.toFixed(1)}°F`} />
              <Row label="Uptime"      value={formatUptime(status.uptime_seconds)} />
              <Row label="Zones"       value={status.zones_running ? 'Running' : 'Idle'} />
            </>
          )}
          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={() => { loadedRef.current = false; load(); }}
            disabled={loading}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Refresh Status</Text>}
          </TouchableOpacity>
        </View>

        {/* Time */}
        <Text style={styles.sectionHeader}>Time</Text>
        <View style={styles.card}>
          {timeData && (
            <>
              <Row label="Controller time" value={
                timeData.epoch
                  ? new Date(timeData.epoch * 1000).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
                  : '—'
              } />
              <Row label="Timezone"   value={`${timeData.tz_name} (${timeData.tz_offset_str})`} />
              <Row label="NTP synced" value={timeData.synced ? 'Yes' : 'No'} />
              {timeData.lat !== undefined && (
                <Row label="GPS" value={`${timeData.lat.toFixed(5)}, ${timeData.lon?.toFixed(5)}`} />
              )}
            </>
          )}
          <TouchableOpacity style={[styles.button, syncing && styles.buttonDisabled]} onPress={handleSyncFromPhone} disabled={syncing}>
            {syncing ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sync from Phone</Text>}
          </TouchableOpacity>
        </View>

        {/* Activity */}
        <Text style={styles.sectionHeader}>Activity</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.logLink} onPress={() => router.push(`/(app)/controller/${id}/logs` as any)}>
            <Text style={styles.logLinkText}>View Activity Log</Text>
            <Text style={styles.logLinkChevron}>›</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={rowStyles.row}>
      <Text style={rowStyles.label}>{label}</Text>
      <Text style={rowStyles.value}>{value}</Text>
    </View>
  );
}

const rowStyles = StyleSheet.create({
  row:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  label: { fontSize: 14, color: '#6b7280' },
  value: { fontSize: 14, color: '#111827', fontWeight: '500', flexShrink: 1, textAlign: 'right', marginLeft: 16 },
});

const styles = StyleSheet.create({
  container:          { flex: 1, backgroundColor: '#f0f4f8', padding: 20 },
  center:             { flex: 1, alignItems: 'center', justifyContent: 'center' },
  sectionHeader:      { fontSize: 13, fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginTop: 16 },
  card:               { backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 16, paddingBottom: 16, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  nameRow:            { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14 },
  nameText:           { fontSize: 17, fontWeight: '600', color: '#111827' },
  editChevron:        { fontSize: 16, color: '#9ca3af' },
  nameEditRow:        { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
  nameInput:          { flex: 1, fontSize: 16, borderBottomWidth: 1, borderBottomColor: '#1a56db', paddingVertical: 4 },
  saveNameBtn:        { backgroundColor: '#1a56db', borderRadius: 6, paddingVertical: 6, paddingHorizontal: 12 },
  saveNameText:       { color: '#fff', fontWeight: '600', fontSize: 13 },
  cancelNameBtn:      { paddingVertical: 6, paddingHorizontal: 8 },
  cancelNameText:     { color: '#6b7280', fontSize: 13 },
  wifiLabel:          { fontSize: 13, color: '#6b7280', marginTop: 12, marginBottom: 4 },
  textInput:          { backgroundColor: '#f9fafb', borderRadius: 8, padding: 10, fontSize: 15, color: '#111827', borderWidth: 1, borderColor: '#e5e7eb' },
  button:             { marginTop: 14, backgroundColor: '#1a56db', borderRadius: 8, padding: 12, alignItems: 'center' },
  buttonDisabled:     { opacity: 0.6 },
  buttonText:         { color: '#fff', fontWeight: '600', fontSize: 15 },
  buttonSecondary:    { backgroundColor: '#f3f4f6' },
  buttonSecondaryText:{ color: '#374151', fontWeight: '600', fontSize: 15 },
  logLink:            { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 },
  logLinkText:        { fontSize: 15, color: '#1a56db', fontWeight: '500' },
  logLinkChevron:     { fontSize: 20, color: '#9ca3af' },
});
