import { useEffect, useRef, useState } from 'react';
import { View, Text, FlatList, ActivityIndicator, StyleSheet, RefreshControl, Alert } from 'react-native';
import { Stack } from 'expo-router';
import { useControllerConnection } from '@/context/ControllerConnection';

type LogEntry = { ts: number; zone: number; duration: number; source: string };

const SOURCE_LABELS: Record<string, string> = {
  scheduler: 'Schedule', REST: 'REST', BLE: 'BLE', CLI: 'CLI',
};

export default function LogsScreen() {
  const { execCommand, connecting, connected, zones } = useControllerConnection();
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [entries, setEntries]       = useState<LogEntry[]>([]);

  const zoneNames: Record<number, string> = {};
  for (const z of zones) zoneNames[z.id] = z.name;

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
      const data = await execCommand('get_log', { n: 20 });
      setEntries((data as LogEntry[]).slice().reverse());
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to load log');
    } finally {
      setLoading(false);
    }
  }

  async function handleRefresh() {
    loadedRef.current = false; // allow reload on refresh
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  function formatTs(epoch: number): string {
    return new Date(epoch * 1000).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  function formatDuration(secs: number): string {
    const m = Math.floor(secs / 60), s = secs % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  }

  if (connecting || loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#1a56db" /></View>;
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Activity Log' }} />
      {entries.length === 0 ? (
        <View style={styles.center}><Text style={styles.emptyText}>No activity recorded yet.</Text></View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(_, i) => String(i)}
          contentContainerStyle={{ paddingBottom: 32 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          renderItem={({ item: e }) => (
            <View style={styles.entry}>
              <View style={styles.entryLeft}>
                <Text style={styles.zoneName}>{zoneNames[e.zone] ?? `Zone ${e.zone}`}</Text>
                <Text style={styles.entryMeta}>Ran for {formatDuration(e.duration)}  ·  {SOURCE_LABELS[e.source] ?? e.source}</Text>
              </View>
              <Text style={styles.entryTime}>{formatTs(e.ts)}</Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: '#f0f4f8' },
  center:     { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText:  { color: '#9ca3af', fontSize: 15 },
  entry:      { backgroundColor: '#fff', marginHorizontal: 16, marginTop: 10, borderRadius: 10, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  entryLeft:  { flex: 1, marginRight: 12 },
  zoneName:   { fontSize: 15, fontWeight: '600', color: '#111827' },
  entryMeta:  { fontSize: 12, color: '#6b7280', marginTop: 3 },
  entryTime:  { fontSize: 12, color: '#9ca3af', textAlign: 'right' },
});
