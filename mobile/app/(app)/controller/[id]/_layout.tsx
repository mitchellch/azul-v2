import { Stack, useLocalSearchParams, useRouter, usePathname } from 'expo-router';
import { useEffect } from 'react';
import { Alert } from 'react-native';
import { useAuthStore } from '@/store/auth';
import { useControllerStore } from '@/store/controllers';
import { ControllerConnectionProvider } from '@/context/ControllerConnection';
import { getConnectionStatus } from '@/services/cloudApi';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

export const unstable_settings = { initialRouteName: 'index' };

export default function ControllerLayout() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuthStore();
  const ctrl = useControllerStore(s => s.controllers.find(c => c.id === id));

  useEffect(() => {
    if (!ctrl?.mac) return;
    getConnectionStatus(ctrl.mac).then(status => {
      if (status.grade === 'offline') {
        Alert.alert(
          'Controller Offline',
          'This controller has not been seen recently. Check its WiFi connection.',
          [{ text: 'OK' }]
        );
      } else if (status.recommendLocalMode) {
        Alert.alert(
          'Connection Unstable',
          `The connection to this controller is ${status.grade}. Would you like to connect locally over Bluetooth instead?`,
          [
            { text: 'Use Bluetooth', style: 'default', onPress: () => {} },
            { text: 'Keep Using Cloud', style: 'cancel' },
          ]
        );
      }
    }).catch(() => {
      // Silently ignore — connection status is best-effort
    });
  }, [ctrl?.mac]);

  if (!ctrl) {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Text>Controller not found.</Text></View>;
  }

  const ownerSub = ctrl.ownerSub ?? user?.sub ?? '';

  return (
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
      // active when on the root controller screen (no sub-segment after the id)
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
