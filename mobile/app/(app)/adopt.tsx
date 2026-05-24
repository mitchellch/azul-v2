import { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator, StyleSheet,
  Alert, TextInput, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { connect, disconnect, readPin, sendCommand } from '@/services/ble';
import { claimDevice } from '@/services/cloudApi';
import { Device } from 'react-native-ble-plx';
import * as Location from 'expo-location';
import { useAuthStore } from '@/store/auth';
import { useControllerStore } from '@/store/controllers';

type Step = 'connecting' | 'confirm' | 'claiming' | 'wifi_setup' | 'error';

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export default function AdoptScreen() {
  const { deviceId, deviceName } = useLocalSearchParams<{ deviceId: string; deviceName: string }>();
  const router = useRouter();
  const { user } = useAuthStore();
  const { addController } = useControllerStore();

  const [step, setStep]               = useState<Step>('connecting');
  const [pin, setPin]                 = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const deviceRef = useRef<Device | null>(null);

  // WiFi setup state
  const [ssid, setSsid]             = useState('');
  const [password, setPassword]     = useState('');
  const [savingWifi, setSavingWifi] = useState(false);
  const [networks, setNetworks]     = useState<{ ssid: string; rssi: number; secure: boolean }[]>([]);
  const [scanning, setScanning]     = useState(false);
  const [useCustomSsid, setUseCustomSsid] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const passwordRef = useRef<TextInput>(null);
  const scrollRef = useRef<ScrollView>(null);

  // Scan WiFi networks from the controller over BLE
  useEffect(() => {
    if (step !== 'wifi_setup' || !deviceRef.current) return;
    (async () => {
      setScanning(true);
      try {
        const result = await sendCommand(deviceRef.current!, 'scan_wifi', undefined, user?.sub) as any;
        const nets: { ssid: string; rssi: number; secure: boolean }[] = result?.networks ?? [];
        // Deduplicate by SSID, keep strongest signal
        const map = new Map<string, typeof nets[0]>();
        for (const n of nets) {
          if (!n.ssid) continue;
          const existing = map.get(n.ssid);
          if (!existing || n.rssi > existing.rssi) map.set(n.ssid, n);
        }
        const sorted = [...map.values()].sort((a, b) => b.rssi - a.rssi);
        setNetworks(sorted);
      } catch {
        // Scan failed — fall back to manual entry
        setUseCustomSsid(true);
      } finally {
        setScanning(false);
      }
    })();
  }, [step]);

  // Stored after claim succeeds, used when finishing
  const claimResult = useRef<{ controllerId: string; wifiMac: string; ctrlName: string; cloudId?: string } | null>(null);

  const connectingRef = useRef(false);
  useEffect(() => {
    if (connectingRef.current) return;
    connectingRef.current = true;
    doConnect();
    return () => { deviceRef.current && disconnect(deviceRef.current).catch(() => {}); };
  }, []);

  async function doConnect() {
    try {
      setStep('connecting');
      console.log(`[adopt] doConnect — connecting to ${deviceId}`);
      await new Promise(r => setTimeout(r, 500));
      const device = await connect(deviceId);
      console.log('[adopt] doConnect — connected, reading pin');
      deviceRef.current = device;

      const pinValue = await readPin(device);

      if (!pinValue) {
        const info = await sendCommand(device, 'get_device_info') as any;
        if (info?.claimed && user?.sub) {
          try {
            await sendCommand(device, 'get_status', undefined, user.sub);
            setStep('claiming');
            const wifiMac = info.mac ?? deviceId;
            let ctrlName = deviceName ?? 'Azul Controller';
            let cloudId: string | undefined;
            try {
              const resp = await Promise.race([
                claimDevice(wifiMac, ctrlName),
                new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8_000)),
              ]) as any;
              cloudId = resp.id;
              if (resp.name) ctrlName = resp.name;
            } catch { /* backend unavailable or timeout */ }
            claimResult.current = { controllerId: uuid(), wifiMac, ctrlName, cloudId };
            setStep('wifi_setup');
            return;
          } catch {
            setErrorMessage('This controller is claimed by a different account.');
            setStep('error');
            return;
          }
        }
        setErrorMessage('This controller is already claimed by another account.');
        setStep('error');
        return;
      }

      setPin(pinValue);
      setStep('confirm');
    } catch (e: any) {
      setErrorMessage(e?.message ?? 'Failed to connect.');
      setStep('error');
    }
  }

  async function doClaim() {
    if (!deviceRef.current || !user?.sub) return;
    try {
      setStep('claiming');
      await sendCommand(deviceRef.current, 'claim', { pin, owner_sub: user.sub });

      let wifiMac = deviceId;
      try {
        const info = await sendCommand(deviceRef.current, 'get_device_info') as any;
        if (info?.mac) wifiMac = info.mac;
      } catch { /* use BLE deviceId as fallback */ }

      let ctrlName = deviceName ?? 'Azul Controller';
      const controllerId = uuid();

      let cloudId: string | undefined;
      try {
        const resp = await Promise.race([
          claimDevice(wifiMac, ctrlName),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8_000)),
        ]) as any;
        cloudId = resp.id;
        if (resp.name) ctrlName = resp.name;
      } catch { /* offline, timeout, or backend unavailable */ }

      claimResult.current = { controllerId, wifiMac, ctrlName, cloudId };
      setStep('wifi_setup');
    } catch (e: any) {
      const msg = e?.message ?? '';
      setErrorMessage(
        msg.includes('invalid pin')
          ? 'Incorrect code — make sure you\'re connecting to the right controller.'
          : msg || 'Claim failed. Please try again.'
      );
      setStep('error');
    }
  }

  async function handleSaveWifi() {
    if (!ssid.trim()) { Alert.alert('SSID required'); return; }
    if (!deviceRef.current) { finishAdoption(); return; }
    setSavingWifi(true);
    try {
      await sendCommand(deviceRef.current, 'set_wifi', { ssid: ssid.trim(), password }, user?.sub);
      await provisionMqtt();
      await syncTimeAndLocation();
      finishAdoption();
    } catch (e: any) {
      Alert.alert('WiFi Error', e?.message ?? 'Failed to save WiFi. You can set it later in Settings.');
      finishAdoption();
    } finally {
      setSavingWifi(false);
    }
  }

  async function provisionMqtt() {
    if (!deviceRef.current) return;
    try {
      const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? '';
      const match = apiUrl.match(/\/\/([^:/]+)/);
      const host = match?.[1];
      if (!host) return;
      await sendCommand(deviceRef.current, 'set_mqtt', { host, port: 1883 }, user?.sub);
    } catch { /* non-fatal */ }
  }

  async function syncTimeAndLocation() {
    if (!deviceRef.current) return;
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const offset = -new Date().getTimezoneOffset() * 60;
      const epoch = Math.floor(Date.now() / 1000);
      let lat: number | undefined, lon: number | undefined;
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          lat = pos.coords.latitude; lon = pos.coords.longitude;
        }
      } catch { /* GPS unavailable */ }
      await sendCommand(deviceRef.current, 'set_time', {
        epoch, tz_offset: offset, tz_dst: 0, tz_name: tz,
        ...(lat !== undefined && { lat, lon }),
      }, user?.sub);
    } catch { /* non-fatal */ }
  }

  function handleSkipWifi() {
    finishAdoption();
  }

  function finishAdoption() {
    const r = claimResult.current;
    if (!r || !user?.sub) {
      console.warn('[adopt] finishAdoption bail — claimResult:', !!r, 'user:', !!user?.sub);
      return;
    }
    console.log(`[adopt] finishAdoption — adding ${r.ctrlName} mac=${r.wifiMac}`);
    addController({
      id: r.controllerId,
      deviceId,
      mac: r.wifiMac,
      name: r.ctrlName,
      ownerSub: user.sub,
      claimedAt: Date.now(),
      lastSeen: Date.now(),
      cloudId: r.cloudId,
      connectionMode: r.cloudId && ssid.trim() ? 'cloud' : 'ble',
    });
    router.replace('/(app)/home');
  }

  function doCancel() {
    deviceRef.current && disconnect(deviceRef.current).catch(() => {});
    router.back();
  }

  if (step === 'connecting') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1a56db" />
        <Text style={styles.statusText}>Connecting…</Text>
      </View>
    );
  }

  if (step === 'claiming') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1a56db" />
        <Text style={styles.statusText}>Claiming controller…</Text>
      </View>
    );
  }

  if (step === 'error') {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{errorMessage}</Text>
        <TouchableOpacity style={styles.button} onPress={doConnect}>
          <Text style={styles.buttonText}>Try Again</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.cancelButton} onPress={doCancel}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (step === 'wifi_setup') {
    const Wrapper = Platform.OS === 'ios' ? KeyboardAvoidingView : View;
    const wrapperProps = Platform.OS === 'ios'
      ? { style: { flex: 1, backgroundColor: '#f0f4f8' }, behavior: 'padding' as const }
      : { style: { flex: 1, backgroundColor: '#f0f4f8' } };
    return (
      <Wrapper {...wrapperProps}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.wifiContainer}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.heading}>Connect to WiFi</Text>
          <Text style={styles.subheading}>
            Select the network for this controller.
          </Text>

          {scanning ? (
            <View style={{ alignItems: 'center', marginVertical: 24 }}>
              <ActivityIndicator size="large" color="#1a56db" />
              <Text style={styles.statusText}>Scanning networks…</Text>
            </View>
          ) : (
            <>
              {/* SSID selection */}
              {networks.length > 0 && !useCustomSsid ? (
                <View style={styles.inputGroup}>
                  <View style={styles.picklist}>
                    {networks.map((net) => (
                      <TouchableOpacity
                        key={net.ssid}
                        style={[styles.picklistRow, ssid === net.ssid && styles.picklistRowSelected]}
                        onPress={() => { setSsid(net.ssid); setTimeout(() => passwordRef.current?.focus(), 100); }}
                      >
                        <Text style={[styles.picklistText, ssid === net.ssid && styles.picklistTextSelected]}>
                          {net.ssid}
                        </Text>
                        <Text style={styles.picklistSignal}>
                          {net.rssi > -50 ? '●●●' : net.rssi > -70 ? '●●○' : '●○○'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity
                      style={styles.picklistRow}
                      onPress={() => { setUseCustomSsid(true); setSsid(''); }}
                    >
                      <Text style={styles.picklistOther}>Other…</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View style={styles.inputGroup}>
                  <TextInput
                    style={styles.input}
                    value={ssid}
                    onChangeText={setSsid}
                    placeholder="Network name (SSID)"
                    placeholderTextColor="#9ca3af"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoFocus
                  />
                  {networks.length > 0 && (
                    <TouchableOpacity onPress={() => { setUseCustomSsid(false); setSsid(''); }}>
                      <Text style={styles.backToDetected}>← Back to list</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {/* Password field — always visible */}
              <View style={[styles.inputGroup, { marginTop: 16 }]}>
                <View style={styles.passwordRow}>
                  <TextInput
                    ref={passwordRef}
                    style={[styles.input, { flex: 1 }]}
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Password"
                    placeholderTextColor="#9ca3af"
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    onFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 400)}
                  />
                  <TouchableOpacity
                    style={styles.showPasswordBtn}
                    onPress={() => setShowPassword(!showPassword)}
                  >
                    <Text style={styles.showPasswordText}>{showPassword ? 'Hide' : 'Show'}</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <TouchableOpacity
                style={[styles.button, (!ssid.trim() || savingWifi) && styles.buttonDisabled]}
                onPress={handleSaveWifi}
                disabled={!ssid.trim() || savingWifi}
              >
                {savingWifi
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.buttonText}>Save & Continue</Text>}
              </TouchableOpacity>

              <TouchableOpacity style={styles.cancelButton} onPress={handleSkipWifi}>
                <Text style={styles.cancelText}>Skip — set up WiFi later</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </Wrapper>
    );
  }

  // step === 'confirm'
  const pinDigits = pin.split('');

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Confirm your controller</Text>
      <Text style={styles.subheading}>
        Make sure the code below matches what's shown on your controller's serial output.
      </Text>

      <View style={styles.pinRow}>
        {pinDigits.map((digit, i) => (
          <View key={i} style={styles.pinBox}>
            <Text style={styles.pinDigit}>{digit}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.deviceLabel}>{deviceName ?? 'Azul Controller'}</Text>

      <TouchableOpacity style={styles.button} onPress={doClaim}>
        <Text style={styles.buttonText}>Confirm &amp; Adopt</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.cancelButton} onPress={doCancel}>
        <Text style={styles.cancelText}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: '#f0f4f8',
    alignItems: 'center', justifyContent: 'center', padding: 32,
  },
  wifiContainer: {
    flexGrow: 1, backgroundColor: '#f0f4f8',
    padding: 32, paddingTop: 60, paddingBottom: 400,
  },
  center: {
    flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32,
    backgroundColor: '#f0f4f8',
  },
  heading:    { fontSize: 22, fontWeight: '700', color: '#111827', marginBottom: 12, textAlign: 'center' },
  subheading: { fontSize: 14, color: '#6b7280', textAlign: 'center', marginBottom: 32, lineHeight: 20 },
  statusText: { marginTop: 16, fontSize: 16, color: '#6b7280' },
  errorText:  { fontSize: 15, color: '#dc2626', textAlign: 'center', marginBottom: 24, lineHeight: 22 },
  deviceLabel:{ fontSize: 13, color: '#9ca3af', marginTop: 16, marginBottom: 40 },
  pinRow:     { flexDirection: 'row', gap: 10, marginBottom: 8 },
  pinBox: {
    width: 44, height: 56, borderRadius: 8,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, elevation: 3,
  },
  pinDigit: { fontSize: 28, fontWeight: '700', color: '#1a56db' },
  inputGroup: { width: '100%', marginBottom: 16 },
  input: {
    backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#d1d5db',
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: '#111827',
  },
  picklist: {
    backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#d1d5db',
    overflow: 'hidden',
  },
  picklistRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e5e7eb',
  },
  picklistRowSelected: { backgroundColor: '#eff6ff' },
  picklistText: { fontSize: 15, color: '#111827' },
  picklistTextSelected: { color: '#1a56db', fontWeight: '600' },
  picklistSignal: { fontSize: 12, color: '#9ca3af' },
  picklistOther: { fontSize: 15, color: '#6b7280', fontStyle: 'italic' },
  backToDetected: { color: '#1a56db', fontSize: 13, marginTop: 6 },
  passwordRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  showPasswordBtn: { paddingVertical: 12, paddingHorizontal: 8 },
  showPasswordText: { color: '#1a56db', fontSize: 14, fontWeight: '500' },
  button: {
    backgroundColor: '#1a56db', borderRadius: 8,
    paddingVertical: 14, paddingHorizontal: 40,
    width: '100%', alignItems: 'center', marginBottom: 12, marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText:   { color: '#fff', fontWeight: '600', fontSize: 16 },
  cancelButton: { paddingVertical: 10 },
  cancelText:   { color: '#6b7280', fontSize: 15 },
});
