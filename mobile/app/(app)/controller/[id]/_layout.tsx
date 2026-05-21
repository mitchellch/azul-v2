import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import PagerView from 'react-native-pager-view';
import { useAuthStore } from '@/store/auth';
import { useControllerStore } from '@/store/controllers';
import { ControllerConnectionProvider } from '@/context/ControllerConnection';
import { CloudControllerConnectionProvider } from '@/context/CloudControllerConnection';
import { getConnectionStatus } from '@/services/cloudApi';

// Import screen components directly so they render inside the pager
import SchedulesScreen from './schedules';
import ManualScreen from './index';
import SettingsScreen from './settings';

export const unstable_settings = { initialRouteName: 'index' };

const TABS = [
  { label: 'Schedules', component: SchedulesScreen },
  { label: 'Zones',     component: ManualScreen },
  { label: 'Settings',  component: SettingsScreen },
] as const;

const INITIAL_PAGE = 1; // Manual tab

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

  return mode === 'cloud' ? (
    <CloudControllerConnectionProvider mac={mac} ownerSub={ownerSub}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: true }} />
      <ControllerShell id={id} ctrlName={ctrl.name} />
    </CloudControllerConnectionProvider>
  ) : (
    <ControllerConnectionProvider controllerId={id} ownerSub={ownerSub}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: true }} />
      <ControllerShell id={id} ctrlName={ctrl.name} />
    </ControllerConnectionProvider>
  );
}

function ControllerShell({ id, ctrlName }: { id: string; ctrlName: string }) {
  const router = useRouter();
  const pagerRef = useRef<PagerView>(null);
  const [activePage, setActivePage] = useState(INITIAL_PAGE);

  return (
    <View style={{ flex: 1 }}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={{ top: 16, bottom: 16, left: 24, right: 24 }}
        >
          <Text style={styles.homeIcon}>⌂</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{ctrlName}</Text>
        <View style={styles.backBtn} />
      </View>

      {/* Pager */}
      <PagerView
        ref={pagerRef}
        style={{ flex: 1 }}
        initialPage={INITIAL_PAGE}
        onPageSelected={e => setActivePage(e.nativeEvent.position)}
      >
        {TABS.map(({ component: Screen }, i) => (
          <View key={i} style={{ flex: 1 }}>
            <Screen />
          </View>
        ))}
      </PagerView>

      {/* Tab bar */}
      <View style={styles.navRow}>
        {TABS.map(({ label }, i) => {
          const active = activePage === i;
          return (
            <TouchableOpacity
              key={label}
              style={styles.navItem}
              onPress={() => pagerRef.current?.setPage(i)}
            >
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
  header:       { backgroundColor: '#1a56db', flexDirection: 'row', alignItems: 'center', paddingTop: 44, paddingBottom: 12, paddingHorizontal: 4 },
  backBtn:      { width: 60, height: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  homeIcon:     { color: '#fff', fontSize: 26, lineHeight: 32 },
  headerTitle:  { flex: 1, color: '#fff', fontSize: 17, fontWeight: '600', textAlign: 'center' },
  navRow:       { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#e5e7eb', backgroundColor: '#fff' },
  navItem:      { flex: 1, alignItems: 'center', paddingVertical: 12 },
  navLabel:     { fontSize: 13, color: '#9ca3af', fontWeight: '500' },
  navLabelActive: { color: '#1a56db', fontWeight: '700' },
  navIndicator: { marginTop: 4, height: 2, width: 24, backgroundColor: '#1a56db', borderRadius: 1 },
});
