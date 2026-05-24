import { useEffect, useRef, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  ActivityIndicator, StyleSheet, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Device } from 'react-native-ble-plx';
import { requestPermissions, scanForControllers, stopScan } from '@/services/ble';
import { useAuthStore } from '@/store/auth';
import { useControllerStore } from '@/store/controllers';

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export default function ScanScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { controllers, addController } = useControllerStore();
  const [scanning, setScanning]   = useState(false);
  const [devices, setDevices]     = useState<Device[]>([]);
  const [permDenied, setPermDenied] = useState(false);
  const [importing, setImporting] = useState(false);
  const seen = useRef<Set<string>>(new Set());
  const scanTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    startScan();
    return () => { stopScan(); if (scanTimer.current) clearTimeout(scanTimer.current); };
  }, []);

  async function startScan() {
    seen.current.clear();
    setDevices([]);
    setPermDenied(false);

    const granted = await requestPermissions();
    if (!granted) { setPermDenied(true); return; }

    const adopted = new Set(controllers.flatMap(c => [c.deviceId, c.mac].filter(Boolean)));
    console.log(`[Scan] filter: ${[...adopted].join(', ')} (${controllers.length} controllers)`);
    setScanning(true);
    scanForControllers((device) => {
      if (seen.current.has(device.id)) return;
      if (adopted.has(device.id)) {
        console.log(`[Scan] filtered out ${device.id} (already adopted)`);
        return;
      }
      seen.current.add(device.id);
      setDevices((prev) => [...prev, device]);
    }, 15_000);

    scanTimer.current = setTimeout(() => setScanning(false), 15_000);
  }

  function onSelectDevice(device: Device) {
    stopScan();
    setScanning(false);
    router.push({ pathname: '/(app)/adopt', params: { deviceId: device.id, deviceName: device.name ?? 'Azul Controller' } });
  }

  async function importFromCloud() {
    const { accessToken } = useAuthStore.getState();
    if (!accessToken) { Alert.alert('Not logged in'); return; }
    setImporting(true);
    try {
      const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000/api';
      const res = await fetch(`${API_URL}/devices`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const serverDevices: any[] = await res.json();
      const existing = new Set(controllers.map(c => c.mac));
      let added = 0;
      for (const d of serverDevices) {
        if (existing.has(d.mac)) continue;
        addController({
          id: uuid(),
          deviceId: d.mac,
          mac: d.mac,
          name: d.name ?? 'Azul Controller',
          ownerSub: user?.sub ?? '',
          claimedAt: Date.now(),
          lastSeen: d.lastSeenAt ? new Date(d.lastSeenAt).getTime() : undefined,
          cloudId: d.id,
          connectionMode: 'cloud',
        });
        added++;
      }
      if (added > 0) {
        router.replace('/(app)/home');
      } else {
        Alert.alert('No new controllers', 'All your cloud-registered controllers are already in the app.');
      }
    } catch (e: any) {
      Alert.alert('Import failed', e?.message ?? 'Could not reach server');
    } finally {
      setImporting(false);
    }
  }

  if (permDenied) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Bluetooth permission is required to find controllers.</Text>
        <TouchableOpacity style={styles.button} onPress={startScan}>
          <Text style={styles.buttonText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Looking for controllers…</Text>

      {scanning && <ActivityIndicator size="large" color="#1a56db" style={{ marginBottom: 24 }} />}

      {devices.length === 0 && !scanning && (
        <Text style={styles.emptyText}>No controllers found.</Text>
      )}

      <FlatList
        data={devices}
        keyExtractor={(d) => d.id}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.deviceRow} onPress={() => onSelectDevice(item)}>
            <View>
              <Text style={styles.deviceName}>{item.name ?? 'Azul Controller'}</Text>
              <Text style={styles.deviceId}>{item.id}</Text>
            </View>
            <Text style={styles.rssi}>{item.rssi ?? '—'} dBm</Text>
          </TouchableOpacity>
        )}
      />

      {!scanning && (
        <View style={{ gap: 12, marginTop: 16, alignItems: 'center' }}>
          <TouchableOpacity style={styles.button} onPress={startScan}>
            <Text style={styles.buttonText}>Scan Again</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.button, { backgroundColor: '#374151' }]} onPress={importFromCloud} disabled={importing}>
            {importing
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.buttonText}>Import from Cloud</Text>}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f4f8', padding: 16 },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  heading:   { fontSize: 18, fontWeight: '600', color: '#111827', marginBottom: 16 },
  emptyText: { color: '#6b7280', textAlign: 'center', marginTop: 32 },
  errorText: { color: '#dc2626', textAlign: 'center', marginBottom: 24 },
  deviceRow: {
    backgroundColor: '#fff', borderRadius: 10, padding: 16,
    marginBottom: 10, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'space-between',
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  deviceName: { fontSize: 16, fontWeight: '600', color: '#111827' },
  deviceId:   { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  rssi:       { fontSize: 13, color: '#6b7280' },
  button: {
    backgroundColor: '#1a56db', borderRadius: 8,
    paddingVertical: 12, paddingHorizontal: 32, alignSelf: 'center',
  },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 15 },
});
