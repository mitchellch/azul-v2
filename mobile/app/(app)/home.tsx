import { useRef, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Image, Alert, Switch, ActivityIndicator } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { logout } from '@/services/auth';
import { useAuthStore } from '@/store/auth';
import { useControllerStore, Controller } from '@/store/controllers';
import { connect, disconnect, sendCommand } from '@/services/ble';

export default function HomeScreen() {
  const router     = useRouter();
  const { user, clearSession } = useAuthStore();
  const { controllers, removeController, updateController } = useControllerStore();
  const [togglingId,  setTogglingId]  = useState<string | null>(null);
  const swipeRefs = useRef<Map<string, Swipeable | null>>(new Map());

  async function handleLogout() {
    await logout();
    clearSession();
  }

  function formatLastSeen(ts?: number): string {
    if (!ts) return 'Never connected';
    const diff = Date.now() - ts;
    if (diff < 60_000)   return 'Just now';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return `${Math.floor(diff / 86_400_000)}d ago`;
  }

  async function handlePauseToggle(item: Controller) {
    setTogglingId(item.id);
    let device;
    try {
      device = await connect(item.deviceId);
      if (item.paused) {
        // Restore previously active schedule
        if (item.pausedScheduleUuid) {
          await sendCommand(device, 'activate_schedule', { uuid: item.pausedScheduleUuid }, item.ownerSub);
        }
        updateController(item.deviceId, { paused: false, pausedScheduleUuid: undefined });
      } else {
        // Remember current active schedule then deactivate
        let activeUuid: string | undefined;
        try {
          const active = await sendCommand(device, 'get_active_schedule', undefined, item.ownerSub) as any;
          activeUuid = active?.uuid;
        } catch { /* no active schedule — that's fine */ }
        await sendCommand(device, 'deactivate_schedule', undefined, item.ownerSub);
        updateController(item.deviceId, { paused: true, pausedScheduleUuid: activeUuid });
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not reach controller');
    } finally {
      if (device) disconnect(device).catch(() => {});
      setTogglingId(null);
    }
  }

  function confirmDelete(item: Controller) {
    swipeRefs.current.get(item.id)?.close();
    Alert.alert(
      `Remove "${item.name}"`,
      'How would you like to remove this controller?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove from app only',
          onPress: () => removeController(item.deviceId),
        },
        {
          text: 'Unclaim & Remove',
          style: 'destructive',
          onPress: () => unclaimAndRemove(item),
        },
      ]
    );
  }

  async function unclaimAndRemove(item: Controller) {
    setTogglingId(item.id);
    let device;
    try {
      device = await connect(item.deviceId);
      await sendCommand(device, 'unclaim', undefined, item.ownerSub);
    } catch { /* remove locally regardless */ } finally {
      if (device) disconnect(device).catch(() => {});
      removeController(item.deviceId);
      setTogglingId(null);
    }
  }

  function renderController({ item }: { item: Controller }) {
    const isToggling = togglingId === item.id;

    const renderRightActions = () => (
      <TouchableOpacity
        style={styles.swipeDeleteBtn}
        onPress={() => confirmDelete(item)}
      >
        <Text style={styles.swipeDeleteText}>🗑{'\n'}Remove</Text>
      </TouchableOpacity>
    );

    return (
      <Swipeable
        ref={ref => { swipeRefs.current.set(item.id, ref); }}
        renderRightActions={renderRightActions}
        rightThreshold={60}
        overshootRight={false}
      >
        <TouchableOpacity
          style={styles.controllerRow}
          onPress={() => router.push(`/(app)/controller/${item.id}/schedules` as any)}
          activeOpacity={0.85}
        >
          <View style={styles.controllerInfo}>
            <Text style={styles.controllerName}>{item.name}</Text>
            <Text style={styles.controllerSeen}>{formatLastSeen(item.lastSeen)}</Text>
            {item.paused && <Text style={styles.pausedBadge}>Schedules paused</Text>}
          </View>

          {isToggling ? (
            <ActivityIndicator size="small" color="#1a56db" />
          ) : (
            <Switch
              value={!item.paused}
              onValueChange={() => handlePauseToggle(item)}
              trackColor={{ true: '#1a56db', false: '#d1d5db' }}
              thumbColor="#fff"
              style={{ marginLeft: 8 }}
            />
          )}
        </TouchableOpacity>
      </Swipeable>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Controllers',
          headerRight: () => (
            <TouchableOpacity onPress={() => router.push('/(app)/scan')} style={styles.addButton}>
              <Text style={styles.addButtonText}>+</Text>
            </TouchableOpacity>
          ),
        }}
      />

      <View style={styles.userRow}>
        {user?.picture && <Image source={{ uri: user.picture }} style={styles.avatar} />}
        <View>
          <Text style={styles.greeting}>Welcome{user?.name ? `, ${user.name.split(' ')[0]}` : ''}!</Text>
          <Text style={styles.email}>{user?.email}</Text>
        </View>
      </View>

      {controllers.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No controllers yet</Text>
          <Text style={styles.emptySubtitle}>Tap + to add your first controller</Text>
          <TouchableOpacity style={styles.addFirstButton} onPress={() => router.push('/(app)/scan')}>
            <Text style={styles.addFirstButtonText}>Add Controller</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={controllers}
          keyExtractor={(c) => c.id}
          renderItem={renderController}
          style={styles.list}
          contentContainerStyle={{ paddingBottom: 16 }}
        />
      )}

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutText}>Sign Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#f0f4f8', padding: 20 },
  userRow:     { flexDirection: 'row', alignItems: 'center', marginBottom: 24, gap: 14 },
  avatar:      { width: 48, height: 48, borderRadius: 24 },
  greeting:    { fontSize: 17, fontWeight: '600', color: '#111827' },
  email:       { fontSize: 13, color: '#6b7280', marginTop: 1 },
  addButton:   { marginRight: 4, paddingHorizontal: 8 },
  addButtonText: { color: '#fff', fontSize: 26, fontWeight: '400', lineHeight: 30 },
  list:        { flex: 1 },
  controllerRow: {
    backgroundColor: '#fff', borderRadius: 10, padding: 16, marginBottom: 10,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  controllerInfo: { flex: 1 },
  controllerName: { fontSize: 16, fontWeight: '600', color: '#111827' },
  controllerSeen: { fontSize: 12, color: '#9ca3af', marginTop: 3 },
  pausedBadge:    { fontSize: 11, color: '#f59e0b', fontWeight: '600', marginTop: 3 },
  swipeDeleteBtn:  { backgroundColor: '#dc2626', justifyContent: 'center', alignItems: 'center', width: 80, borderRadius: 10, marginBottom: 10 },
  swipeDeleteText: { color: '#fff', fontWeight: '700', fontSize: 12, textAlign: 'center' },
  emptyState:     { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyTitle:     { fontSize: 18, fontWeight: '600', color: '#374151', marginBottom: 8 },
  emptySubtitle:  { fontSize: 14, color: '#9ca3af', marginBottom: 32 },
  addFirstButton: { backgroundColor: '#1a56db', borderRadius: 8, paddingVertical: 12, paddingHorizontal: 32 },
  addFirstButtonText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  logoutButton:   { marginTop: 8, paddingVertical: 12, alignItems: 'center', borderTopWidth: 1, borderTopColor: '#e5e7eb' },
  logoutText:     { color: '#6b7280', fontSize: 14 },
});
