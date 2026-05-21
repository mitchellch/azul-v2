import { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator, StyleSheet,
  Alert, ScrollView, TextInput, Platform, Switch, Keyboard, useWindowDimensions, Image,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Location from 'expo-location';
let ImagePicker: typeof import('expo-image-picker') | null = null;
try { ImagePicker = require('expo-image-picker'); } catch {}
import { useControllerConnection } from '@/context/ControllerConnection';
import { useControllerStore } from '@/store/controllers';
import { controllerStore } from '@/lib/controllerStore';
import { claimDevice, updateDeviceName, uploadZonePhoto, deleteZonePhoto } from '@/services/cloudApi';
import type { ConnectionMode } from '@/store/controllers';

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

type ZoneItem = { id: number; name: string; original: string; saving: boolean; photoUrl?: string | null };

export default function SettingsScreen() {
  const { height: screenHeight } = useWindowDimensions();
  const connection = useControllerConnection();
  const { execCommand, connecting, connected, zones: liveZones, status: ctxStatus } = connection;
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const ctrl = useControllerStore(s => s.controllers.find(c => c.id === id));
  const { updateController } = useControllerStore();
  const isCloudMode = (ctrl?.connectionMode ?? 'ble') === 'cloud';

  const [loading, setLoading]       = useState(true);
  const [syncing, setSyncing]       = useState(false);
  const [savingWifi, setSavingWifi] = useState(false);
  const [registeringCloud, setRegisteringCloud] = useState(false);
  const [timeData, setTimeData]     = useState<TimeData | null>(null);
  const [status, setStatus]         = useState<StatusData | null>(null);

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput]     = useState(ctrl?.name ?? '');
  const nameInputRef = useRef<TextInput>(null);

  const [wifiSsid, setWifiSsid]         = useState('');
  const [wifiPassword, setWifiPassword] = useState('');
  const [showWifiForm, setShowWifiForm] = useState(false);
  const loadedRef = useRef(false);

  // Zone name editor
  const [zoneNamesOpen, setZoneNamesOpen] = useState(false);
  const [zoneItems, setZoneItems]         = useState<ZoneItem[]>([]);

  const scrollRef       = useRef<ScrollView>(null);
  const zoneRowY        = useRef<Map<number, number>>(new Map());
  const zoneCardY       = useRef(0);
  const focusedZoneId   = useRef<number | null>(null);
  const [kbHeight, setKbHeight] = useState(0);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', e => {
      const kb = e.endCoordinates.height;
      setKbHeight(kb);
      const zoneId = focusedZoneId.current;
      if (zoneId === null) return;
      const rowY = zoneRowY.current.get(zoneId);
      if (rowY === undefined) return;
      const absoluteY = zoneCardY.current + rowY;
      // Visible height above keyboard, minus header + tab bar chrome (~140px)
      const visibleArea = screenHeight - kb - 140;
      // Scroll so the focused row sits at the bottom of the visible area, just above the keyboard
      scrollRef.current?.scrollTo({ y: Math.max(0, absoluteY - visibleArea + 60), animated: true });
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      setKbHeight(0);
    });
    return () => { show.remove(); hide.remove(); };
  }, []);

  useEffect(() => {
    if (liveZones.length > 0) {
      setZoneItems(prev => {
        if (prev.length > 0) return prev; // preserve in-progress edits
        return liveZones.map(z => ({ id: z.id, name: z.name || `Zone ${z.id}`, original: z.name || `Zone ${z.id}`, saving: false, photoUrl: (z as any).photoUrl }));
      });
    }
  }, [liveZones]);

  useEffect(() => {
    if (isCloudMode) return;
    if (connected && !loadedRef.current) {
      loadedRef.current = true;
      load();
    }
  }, [connected, isCloudMode]);

  async function load(): Promise<void> {
    if (isCloudMode) return;
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
      let lat: number | undefined, lon: number | undefined;
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          lat = pos.coords.latitude; lon = pos.coords.longitude;
        }
      } catch { /* GPS unavailable */ }
      await execCommand('set_time', { epoch, tz_offset: offset, tz_dst: 0, tz_name: tz, ...(lat !== undefined && { lat, lon }) });
      const t = await execCommand('get_time');
      setTimeData(t as TimeData);
      Alert.alert('Synced', lat !== undefined ? 'Time, timezone, and GPS synced.' : 'Time and timezone synced. (No GPS.)');
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }

  async function handleSaveName() {
    const trimmed = nameInput.trim();
    if (!trimmed) { Alert.alert('Name required'); return; }
    if (ctrl) updateController(ctrl.deviceId, { name: trimmed });
    setEditingName(false);
    if (ctrl?.mac) {
      updateDeviceName(ctrl.mac, trimmed).catch(() => {});
    }
  }

  async function handleSaveWifi() {
    if (!wifiSsid.trim()) { Alert.alert('SSID required'); return; }
    setSavingWifi(true);
    try {
      await execCommand('set_wifi', { ssid: wifiSsid.trim(), password: wifiPassword });
      setShowWifiForm(false); setWifiSsid(''); setWifiPassword('');
      Alert.alert('Saved', 'WiFi credentials saved. Controller will connect on next reboot.');
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to save WiFi');
    } finally {
      setSavingWifi(false);
    }
  }

  async function saveZoneName(z: ZoneItem) {
    const trimmed = z.name.trim();
    if (!trimmed || trimmed === z.original) return;
    setZoneItems(prev => prev.map(item => item.id === z.id ? { ...item, saving: true } : item));
    try {
      await execCommand('update_zone', { id: z.id, name: trimmed });
      setZoneItems(prev => prev.map(item =>
        item.id === z.id ? { ...item, original: trimmed, saving: false } : item
      ));
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to save');
      setZoneItems(prev => prev.map(item => item.id === z.id ? { ...item, saving: false } : item));
    }
  }

  async function handleZonePhoto(z: ZoneItem) {
    const mac = ctrl?.mac;
    if (!mac) { Alert.alert('Error', 'No MAC address'); return; }
    if (!ImagePicker) { Alert.alert('Rebuild Required', 'Run `npx expo run:android` to enable camera.'); return; }

    const storeKey = mac;
    const buttons: { text: string; style?: 'cancel' | 'destructive' | 'default'; onPress?: () => void }[] = [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Take Photo',
        onPress: () => pickPhoto(ImagePicker!.launchCameraAsync, mac, storeKey, z),
      },
      {
        text: 'Choose from Library',
        onPress: () => pickPhoto(ImagePicker!.launchImageLibraryAsync, mac, storeKey, z),
      },
    ];
    if (z.photoUrl) {
      buttons.push({
        text: 'Remove Photo',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteZonePhoto(mac, z.id);
            setZoneItems(prev => prev.map(item => item.id === z.id ? { ...item, photoUrl: null } : item));
            controllerStore.setZonePhoto(storeKey, z.id, null);
          } catch (e: any) { Alert.alert('Error', e?.message ?? 'Failed to remove photo'); }
        },
      });
    }

    Alert.alert('Zone Photo', `Set a photo for ${z.name}`, buttons);
  }

  async function pickPhoto(
    launch: typeof import('expo-image-picker').launchCameraAsync,
    mac: string, storeKey: string, z: ZoneItem,
  ) {
    const result = await launch({ mediaTypes: ['images'], quality: 0.7, allowsEditing: true, aspect: [16, 9] });
    if (result.canceled) return;
    const uri = result.assets[0].uri;
    try {
      const res = await uploadZonePhoto(mac, z.id, uri);
      setZoneItems(prev => prev.map(item => item.id === z.id ? { ...item, photoUrl: res.photoUrl } : item));
      controllerStore.setZonePhoto(storeKey, z.id, res.photoUrl);
    } catch (e: any) { Alert.alert('Error', e?.message ?? 'Upload failed'); }
  }

  function scrollToZone(zoneId: number) {
    focusedZoneId.current = zoneId;
    // keyboardDidShow will do the definitive scroll once keyboard height is known
  }

  function formatUptime(secs: number): string {
    const d = Math.floor(secs / 86400), h = Math.floor((secs % 86400) / 3600);
    const m = Math.floor((secs % 3600) / 60), s = secs % 60;
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }

  function formatRam(free: number, total?: number): string {
    const kb = Math.round(free / 1024);
    if (total) return `${kb} KB (${Math.round((free / total) * 100)}% free)`;
    return `${kb} KB`;
  }

  if (!isCloudMode && (connecting || loading)) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#1a56db" /></View>;
  }

  const mode = ctrl?.connectionMode ?? 'ble';

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 48 + kbHeight }}
      keyboardShouldPersistTaps="always"
    >
      {/* ── Controller ────────────────────────────────── */}
      <Text style={styles.sectionHeader}>Controller</Text>
      <View style={styles.card}>
        {/* Name */}
        {editingName ? (
          <View style={[styles.row, { gap: 8 }]}>
            <TextInput
              ref={nameInputRef}
              style={styles.nameInput}
              value={nameInput}
              onChangeText={setNameInput}
              returnKeyType="done"
              onSubmitEditing={handleSaveName}
              maxLength={32}
              selectTextOnFocus
            />
            <TouchableOpacity style={styles.inlineBtn} onPress={handleSaveName}>
              <Text style={styles.inlineBtnText}>Save</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setNameInput(ctrl?.name ?? ''); setEditingName(false); }}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.row} onPress={() => { setNameInput(ctrl?.name ?? ''); setEditingName(true); setTimeout(() => nameInputRef.current?.focus(), 150); }}>
            <Text style={styles.rowLabel}>Name</Text>
            <View style={styles.rowRight}>
              <Text style={styles.rowValue}>{ctrl?.name ?? 'Azul Controller'}</Text>
              <Text style={styles.chevron}>›</Text>
            </View>
          </TouchableOpacity>
        )}

        <View style={styles.divider} />

        {/* Connection mode */}
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Connection</Text>
          <View style={styles.rowRight}>
            <Text style={styles.rowValue}>{mode === 'cloud' ? 'Cloud' : 'Bluetooth'}</Text>
            <Switch
              value={mode === 'cloud'}
              onValueChange={(val: boolean) => {
                const newMode: ConnectionMode = val ? 'cloud' : 'ble';
                if (newMode === 'cloud' && !ctrl?.mac) {
                  Alert.alert('Not Available', 'Register this controller with the cloud first.');
                  return;
                }
                if (ctrl) updateController(ctrl.deviceId, { connectionMode: newMode });
              }}
              trackColor={{ false: '#d1d5db', true: '#1a56db' }}
              thumbColor="#fff"
              style={{ marginLeft: 8 }}
            />
          </View>
        </View>

        <View style={styles.divider} />

        {/* Cloud registration */}
        {ctrl?.cloudId ? (
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Cloud</Text>
            <View style={styles.rowRight}>
              <Text style={[styles.rowValue, { color: '#16a34a' }]}>✓ Registered</Text>
              {!isCloudMode && (
                <TouchableOpacity
                  style={{ marginLeft: 12 }}
                  disabled={registeringCloud}
                  onPress={async () => {
                    if (!ctrl) return;
                    setRegisteringCloud(true);
                    try {
                      let mac = ctrl.mac ?? ctrl.deviceId;
                      try { const s = await execCommand('get_status') as any; if (s?.mac) mac = s.mac; } catch { /* fallback */ }
                      const device = await claimDevice(mac, ctrl.name);
                      updateController(ctrl.deviceId, { cloudId: device.id, mac });
                      Alert.alert('Updated', `Re-registered with MAC ${mac}`);
                    } catch (e: any) {
                      Alert.alert('Error', e?.message ?? 'Re-registration failed.');
                    } finally {
                      setRegisteringCloud(false);
                    }
                  }}
                >
                  {registeringCloud
                    ? <ActivityIndicator color="#1a56db" size="small" />
                    : <Text style={styles.linkText}>Re-register</Text>}
                </TouchableOpacity>
              )}
            </View>
          </View>
        ) : (
          <View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Cloud</Text>
              <Text style={[styles.rowValue, { color: '#9ca3af' }]}>Not registered</Text>
            </View>
            <TouchableOpacity
              style={[styles.actionBtn, registeringCloud && styles.actionBtnDisabled, { marginTop: 10 }]}
              disabled={registeringCloud}
              onPress={async () => {
                if (!ctrl) return;
                setRegisteringCloud(true);
                try {
                  let mac = ctrl.mac ?? ctrl.deviceId;
                  try { const s = await execCommand('get_status') as any; if (s?.mac) mac = s.mac; } catch { /* fallback */ }
                  const device = await claimDevice(mac, ctrl.name);
                  updateController(ctrl.deviceId, { cloudId: device.id, mac });
                  Alert.alert('Registered', 'Controller is now linked to your cloud account.');
                } catch (e: any) {
                  Alert.alert('Error', e?.message ?? 'Registration failed.');
                } finally {
                  setRegisteringCloud(false);
                }
              }}
            >
              {registeringCloud
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.actionBtnText}>Register with Cloud</Text>}
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* ── Zone Names (collapsible) ───────────────────── */}
      <Text style={styles.sectionHeader}>Zones</Text>
      <View style={styles.card} onLayout={e => { zoneCardY.current = e.nativeEvent.layout.y; }}>
        {/* Collapse/expand header — only shown when collapsed */}
        {!zoneNamesOpen && (
          <TouchableOpacity
            style={styles.row}
            onPress={() => setZoneNamesOpen(true)}
          >
            <Text style={styles.rowLabel}>Tap to edit</Text>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        )}

        {/* Expanded editor */}
        {zoneNamesOpen && (
          zoneItems.length === 0 ? (
            <>
              <TouchableOpacity style={styles.row} onPress={() => setZoneNamesOpen(false)}>
                <Text style={[styles.rowLabel, { color: '#9ca3af' }]}>Tap to close</Text>
                <Text style={[styles.chevron, styles.chevronOpen]}>›</Text>
              </TouchableOpacity>
              <Text style={styles.emptyHint}>
                {isCloudMode ? 'Zone names load when connected.' : 'Connect via Bluetooth to load zones.'}
              </Text>
            </>
          ) : (
            <>
              {/* Collapse handle + single "Zone" column header */}
              <TouchableOpacity style={styles.row} onPress={() => setZoneNamesOpen(false)}>
                <Text style={[styles.rowLabel, { color: '#9ca3af' }]}>Tap to close</Text>
                <Text style={[styles.chevron, styles.chevronOpen]}>›</Text>
              </TouchableOpacity>
              <View style={styles.divider} />
              <View style={styles.zoneHeaderRow}>
                <Text style={styles.zoneHeaderNum}>#</Text>
                <Text style={styles.zoneHeaderLabel}>Zone Name</Text>
              </View>
              {zoneItems.map((z) => {
                const dirty = z.name !== z.original;
                return (
                  <View
                    key={z.id}
                    onLayout={e => { zoneRowY.current.set(z.id, e.nativeEvent.layout.y); }}
                  >
                    <View style={styles.divider} />
                    <View style={styles.zoneRow}>
                      <Text style={styles.zoneRowNum}>{z.id}</Text>
                      <TextInput
                        style={[styles.zoneInput, dirty && styles.zoneInputDirty]}
                        value={z.name}
                        onChangeText={text =>
                          setZoneItems(prev => prev.map(item =>
                            item.id === z.id ? { ...item, name: text } : item
                          ))
                        }
                        maxLength={31}
                        returnKeyType="done"
                        selectTextOnFocus
                        onFocus={() => scrollToZone(z.id)}
                        onSubmitEditing={() => saveZoneName(z)}
                      />
                      {z.saving ? (
                        <ActivityIndicator size="small" color="#1a56db" style={{ marginLeft: 8 }} />
                      ) : dirty ? (
                        <TouchableOpacity style={styles.zoneSaveBtn} onPress={() => saveZoneName(z)}>
                          <Text style={styles.zoneSaveBtnText}>Save</Text>
                        </TouchableOpacity>
                      ) : null}
                      <TouchableOpacity style={styles.zoneCameraBtn} onPress={() => handleZonePhoto(z)}>
                        {z.photoUrl ? (
                          <Image source={{ uri: `${(process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000/api').replace(/\/api$/, '')}${z.photoUrl}` }} style={styles.zoneCameraThumb} />
                        ) : (
                          <Text style={styles.zoneCameraIcon}>📷</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </>
          )
        )}
      </View>

      {/* ── Navigation ────────────────────────────────── */}
      <Text style={styles.sectionHeader}>Device</Text>
      <View style={styles.card}>
        <TouchableOpacity style={styles.row} onPress={() => router.push(`/(app)/controller/${id}/logs` as any)}>
          <Text style={styles.rowLabel}>Activity Log</Text>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>
      </View>

      {/* ── BLE-only sections ─────────────────────────── */}
      {isCloudMode ? (
        <Text style={styles.bleOnlyHint}>
          Switch to Bluetooth to configure WiFi, view device diagnostics, and sync time.
        </Text>
      ) : (
        <>
          {/* WiFi */}
          <Text style={styles.sectionHeader}>WiFi</Text>
          <View style={styles.card}>
            {showWifiForm ? (
              <>
                <Text style={styles.fieldLabel}>Network Name (SSID)</Text>
                <TextInput style={styles.textInput} value={wifiSsid} onChangeText={setWifiSsid} placeholder="Network name" autoCapitalize="none" />
                <Text style={[styles.fieldLabel, { marginTop: 10 }]}>Password</Text>
                <TextInput style={styles.textInput} value={wifiPassword} onChangeText={setWifiPassword} placeholder="Password" secureTextEntry autoCapitalize="none" />
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
                  <TouchableOpacity style={[styles.actionBtn, { flex: 1 }, savingWifi && styles.actionBtnDisabled]} onPress={handleSaveWifi} disabled={savingWifi}>
                    {savingWifi ? <ActivityIndicator color="#fff" /> : <Text style={styles.actionBtnText}>Save</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.actionBtn, styles.actionBtnSecondary, { flex: 1 }]} onPress={() => setShowWifiForm(false)}>
                    <Text style={styles.actionBtnSecondaryText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                {status?.wifi_ssid && (
                  <>
                    <View style={styles.row}>
                      <Text style={styles.rowLabel}>Network</Text>
                      <Text style={styles.rowValue}>{status.wifi_ssid}</Text>
                    </View>
                    <View style={styles.divider} />
                  </>
                )}
                <TouchableOpacity style={styles.row} onPress={() => { setWifiSsid(status?.wifi_ssid ?? ''); setShowWifiForm(true); }}>
                  <Text style={styles.linkText}>Update WiFi Credentials</Text>
                  <Text style={styles.chevron}>›</Text>
                </TouchableOpacity>
              </>
            )}
          </View>

          {/* Diagnostics */}
          {status && (
            <>
              <Text style={styles.sectionHeader}>Diagnostics</Text>
              <View style={styles.card}>
                <StatRow label="Firmware"    value={status.firmware} />
                <StatRow label="Build"       value={status.build} />
                <StatRow label="MAC"         value={status.mac} />
                <StatRow label="Memory"      value={formatRam(status.ram_free, status.ram_total)} />
                <StatRow label="Temperature" value={`${status.temperature_c.toFixed(1)}°C  /  ${status.temperature_f.toFixed(1)}°F`} />
                <StatRow label="Uptime"      value={formatUptime(status.uptime_seconds)} />
                <StatRow label="NTP"         value={status.ntp_synced ? 'Synced' : 'Not synced'} />
                <StatRow label="Schedule"    value={status.active_schedule_name ?? 'None'} last />
                <TouchableOpacity style={[styles.actionBtn, loading && styles.actionBtnDisabled, { marginTop: 14 }]} onPress={() => { loadedRef.current = false; load(); }} disabled={loading}>
                  {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.actionBtnText}>Refresh</Text>}
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* Time */}
          <Text style={styles.sectionHeader}>Time</Text>
          <View style={styles.card}>
            {timeData && (
              <>
                <StatRow label="Controller time" value={
                  timeData.epoch
                    ? new Date(timeData.epoch * 1000).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
                    : '—'
                } />
                <StatRow label="Timezone"   value={`${timeData.tz_name} (${timeData.tz_offset_str})`} />
                <StatRow label="NTP synced" value={timeData.synced ? 'Yes' : 'No'} />
                {timeData.lat !== undefined && (
                  <StatRow label="GPS" value={`${timeData.lat.toFixed(5)}, ${timeData.lon?.toFixed(5)}`} />
                )}
              </>
            )}
            <TouchableOpacity style={[styles.actionBtn, syncing && styles.actionBtnDisabled, { marginTop: 14 }]} onPress={handleSyncFromPhone} disabled={syncing}>
              {syncing ? <ActivityIndicator color="#fff" /> : <Text style={styles.actionBtnText}>Sync from Phone</Text>}
            </TouchableOpacity>
          </View>
        </>
      )}

      {(ctxStatus as any)?.firmware && (
        <View style={styles.firmwareRow}>
          <Text style={styles.firmwareLabel}>Firmware {(ctxStatus as any).firmware}</Text>
          {process.env.EXPO_PUBLIC_DEBUG_MODE === 'true' && (
            <View style={styles.debugBadge}>
              <Text style={styles.debugText}>DEBUG</Text>
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

function StatRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <>
      <View style={statStyles.row}>
        <Text style={statStyles.label}>{label}</Text>
        <Text style={statStyles.value}>{value}</Text>
      </View>
      {!last && <View style={styles.divider} />}
    </>
  );
}

const statStyles = StyleSheet.create({
  row:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  label: { fontSize: 14, color: '#6b7280' },
  value: { fontSize: 14, color: '#111827', fontWeight: '500', flexShrink: 1, textAlign: 'right', marginLeft: 16 },
});

const styles = StyleSheet.create({
  container:         { flex: 1, backgroundColor: '#f0f4f8', padding: 20 },
  center:            { flex: 1, alignItems: 'center', justifyContent: 'center' },
  sectionHeader:     { fontSize: 13, fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginTop: 20 },
  card:              { backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 4, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  divider:           { height: 1, backgroundColor: '#f3f4f6' },
  row:               { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 13 },
  rowLabel:          { fontSize: 15, color: '#374151', fontWeight: '500', flex: 1, marginRight: 8 },
  rowValue:          { fontSize: 15, color: '#111827', fontWeight: '500' },
  rowRight:          { flexDirection: 'row', alignItems: 'center' },
  chevron:           { fontSize: 20, color: '#d1d5db', marginLeft: 6 },
  chevronOpen:       { transform: [{ rotate: '90deg' }] },
  emptyHint:         { fontSize: 13, color: '#9ca3af', paddingVertical: 12 },
  linkText:          { fontSize: 15, color: '#1a56db', fontWeight: '500' },
  cancelText:        { fontSize: 14, color: '#6b7280' },
  nameInput:         { flex: 1, fontSize: 15, borderBottomWidth: 1, borderBottomColor: '#1a56db', paddingVertical: 4 },
  inlineBtn:         { backgroundColor: '#1a56db', borderRadius: 6, paddingVertical: 5, paddingHorizontal: 12 },
  inlineBtnText:     { color: '#fff', fontWeight: '600', fontSize: 13 },
  fieldLabel:        { fontSize: 13, color: '#6b7280', marginTop: 8, marginBottom: 4 },
  textInput:         { backgroundColor: '#f9fafb', borderRadius: 8, padding: 10, fontSize: 15, color: '#111827', borderWidth: 1, borderColor: '#e5e7eb' },
  actionBtn:         { backgroundColor: '#1a56db', borderRadius: 8, padding: 12, alignItems: 'center' },
  actionBtnDisabled: { opacity: 0.6 },
  actionBtnText:     { color: '#fff', fontWeight: '600', fontSize: 15 },
  actionBtnSecondary:     { backgroundColor: '#f3f4f6' },
  actionBtnSecondaryText: { color: '#374151', fontWeight: '600', fontSize: 15 },
  bleOnlyHint:       { fontSize: 13, color: '#9ca3af', textAlign: 'center', marginTop: 20, lineHeight: 20 },
  zoneHeaderRow:     { flexDirection: 'row', alignItems: 'center', paddingTop: 8, paddingBottom: 4 },
  zoneHeaderNum:     { fontSize: 11, color: '#9ca3af', fontWeight: '600', width: 28, textAlign: 'center' },
  zoneHeaderLabel:   { fontSize: 11, color: '#9ca3af', fontWeight: '600', marginLeft: 8 },
  zoneRow:           { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  zoneRowNum:        { fontSize: 14, color: '#6b7280', fontWeight: '600', width: 28, textAlign: 'center' },
  zoneInput:         { flex: 1, fontSize: 15, color: '#111827', borderBottomWidth: 1, borderBottomColor: '#e5e7eb', paddingVertical: 4, marginLeft: 8 },
  zoneInputDirty:    { borderBottomColor: '#1a56db' },
  zoneSaveBtn:       { marginLeft: 10, backgroundColor: '#1a56db', borderRadius: 6, paddingVertical: 5, paddingHorizontal: 10 },
  zoneSaveBtnText:   { color: '#fff', fontWeight: '600', fontSize: 12 },
  zoneCameraBtn:     { marginLeft: 8, width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  zoneCameraIcon:    { fontSize: 18 },
  zoneCameraThumb:   { width: 32, height: 18, borderRadius: 3 },
  firmwareRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 24, paddingHorizontal: 16, paddingBottom: 12 },
  firmwareLabel:     { fontSize: 11, color: '#c4c9d4' },
  debugBadge:        { backgroundColor: '#dc2626', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  debugText:         { color: '#fff', fontSize: 10, fontWeight: '700', letterSpacing: 1 },
});
