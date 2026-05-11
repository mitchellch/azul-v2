import { Stack, useLocalSearchParams, useRouter, usePathname } from 'expo-router';
import { useEffect } from 'react';
import { Alert } from 'react-native';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useAuthStore } from '@/store/auth';
import { useControllerStore } from '@/store/controllers';
import { ControllerConnectionProvider } from '@/context/ControllerConnection';
import { CloudControllerConnectionProvider } from '@/context/CloudControllerConnection';
import { getConnectionStatus } from '@/services/cloudApi';

export const unstable_settings = { initialRouteName: 'index' };

export default function ControllerLayout() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuthStore();
  const ctrl = useControllerStore(s => s.controllers.find(c => c.id === id));
  const { updateController } = useControllerStore();

  const mode = ctrl?.connectionMode ?? 'ble';

  useEffect(() => {
    if (!ctrl?.mac || mode !== 'cloud') return;
    getConnectionStatus(ctrl.mac).then(status => {
      if (status.grade === 'offline') {
        Alert.alert(
          'Controller Offline',
          'This controller has not been seen recently. Switch to Bluetooth for local control.',
          [
            { text: 'Use Bluetooth', onPress: () => updateController(ctrl.deviceId, { connectionMode: 'ble' }) },
            { text: 'Keep Cloud', style: 'cancel' },
          ]
        );
      } else if (status.recommendLocalMode) {
        Alert.alert(
          'Connection Unstable',
          `The connection to this controller is ${status.grade}. Switch to Bluetooth for more reliable local control?`,
          [
            { text: 'Use Bluetooth', onPress: () => updateController(ctrl.deviceId, { connectionMode: 'ble' }) },
            { text: 'Keep Cloud', style: 'cancel' },
          ]
        );
      }
    }).catch(() => {});
  }, [ctrl?.mac, mode]);

  if (!ctrl) {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Text>Controller not found.</Text></View>;
  }

  const ownerSub = ctrl.ownerSub ?? user?.sub ?? '';
  const mac = ctrl.mac ?? ctrl.deviceId;

  return mode === 'cloud' && ctrl.mac ? (
    <CloudControllerConnectionProvider mac={mac} ownerSub={ownerSub}>
      <Stack.Screen options={{ headerShown: false }} />
      <ControllerShell id={id} />
    </CloudControllerConnectionProvider>
  ) : (
    <ControllerConnectionProvider controllerId={id} ownerSub={ownerSub}>
      <Stack.Screen options={{ headerShown: false }} />
      <ControllerShell id={id} />
    </ControllerConnectionProvider>
  );
}

function ControllerShell({ id }: { id: string }) {
  const router   = useRouter();
  const pathname = usePathname();

  const NAV_ITEMS = [
    { label: 'Schedules', segment: 'schedules' },
    { label: 'Manual',    segment: 'index' },
    { label: 'Settings',  segment: 'settings' },
  ] as const;

  function isActive(segment: string): boolean {
    if (segment === 'index') {
      return /\/[^/]+$/.test(pathname) && !['settings','zones','schedules','logs','zones'].some(s => pathname.endsWith(`/${s}`));
    }
    return pathname.endsWith(`/${segment}`);
  }

  function navigate(segment: string) {
    const path = segment === 'index'
      ? `/(app)/controller/${id}`
      : `/(app)/controller/${id}/${segment}`;
    router.replace(path as any);
  }

  return (
    <View style={{ flex: 1 }}>
      <Stack screenOptions={{
        headerStyle: { backgroundColor: '#1a56db' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '600' },
        headerTitleAlign: 'center',
      }} />
      <View style={styles.navRow}>
        {NAV_ITEMS.map(({ label, segment }) => {
          const active = isActive(segment);
          return (
            <TouchableOpacity key={label} style={styles.navItem} onPress={() => navigate(segment)}>
              <Text style={[styles.navLabel, active && styles.navLabelActive]}>{label}</Text>
              {active && <View style={styles.navIndicator} />}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  navRow:         { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#e5e7eb', backgroundColor: '#fff' },
  navItem:        { flex: 1, alignItems: 'center', paddingVertical: 12 },
  navLabel:       { fontSize: 13, color: '#9ca3af', fontWeight: '500' },
  navLabelActive: { color: '#1a56db', fontWeight: '700' },
  navIndicator:   { marginTop: 4, height: 2, width: 24, backgroundColor: '#1a56db', borderRadius: 1 },
});
