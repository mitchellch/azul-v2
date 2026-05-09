import { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { connect, disconnect, readPin, sendCommand } from '@/services/ble';
import { Device } from 'react-native-ble-plx';
import { useAuthStore } from '@/store/auth';
import { useControllerStore } from '@/store/controllers';

type Step = 'connecting' | 'confirm' | 'claiming' | 'error';

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

  useEffect(() => {
    doConnect();
    return () => { deviceRef.current && disconnect(deviceRef.current).catch(() => {}); };
  }, []);

  async function doConnect() {
    try {
      setStep('connecting');
      const device = await connect(deviceId);
      deviceRef.current = device;

      const pinValue = await readPin(device);

      if (!pinValue) {
        // Device is claimed — check if it belongs to this account
        const info = await sendCommand(device, 'get_device_info') as any;
        if (info?.claimed && user?.sub) {
          // Re-adopt: try a get_status with our sub as auth_token to verify ownership
          try {
            await sendCommand(device, 'get_status', undefined, user.sub);
            // Success — we are the owner, re-add without PIN
            setStep('claiming');
            addController({
              id: uuid(),
              deviceId,
              name: deviceName ?? 'Azul Controller',
              ownerSub: user.sub,
              claimedAt: Date.now(),
              lastSeen: Date.now(),
            });
            router.replace('/(app)/home');
            return;
          } catch {
            // Different owner
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
      addController({
        id: uuid(),
        deviceId,
        name: deviceName ?? 'Azul Controller',
        ownerSub: user.sub,
        claimedAt: Date.now(),
        lastSeen: Date.now(),
      });
      router.replace('/(app)/home');
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
  center: {
    flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32,
    backgroundColor: '#f0f4f8',
  },
  heading:    { fontSize: 22, fontWeight: '700', color: '#111827', marginBottom: 12, textAlign: 'center' },
  subheading: { fontSize: 14, color: '#6b7280', textAlign: 'center', marginBottom: 40, lineHeight: 20 },
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
  button: {
    backgroundColor: '#1a56db', borderRadius: 8,
    paddingVertical: 14, paddingHorizontal: 40,
    width: '100%', alignItems: 'center', marginBottom: 12,
  },
  buttonText:   { color: '#fff', fontWeight: '600', fontSize: 16 },
  cancelButton: { paddingVertical: 10 },
  cancelText:   { color: '#6b7280', fontSize: 15 },
});
