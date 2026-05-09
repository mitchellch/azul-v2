import { useEffect, useState } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  ActivityIndicator, StyleSheet, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Stack } from 'expo-router';
import { useControllerConnection } from '@/context/ControllerConnection';

type ZoneItem = { id: number; name: string; originalName: string; dirty: boolean };

export default function ZoneSettingsScreen() {
  const { execCommand, connecting, zones: liveZones } = useControllerConnection();
  const [saving, setSaving] = useState<number | null>(null);
  const [items, setItems]   = useState<ZoneItem[]>([]);

  useEffect(() => {
    if (liveZones.length > 0) {
      setItems(liveZones.map(z => ({ id: z.id, name: z.name, originalName: z.name, dirty: false })));
    }
  }, [liveZones.length]);

  function handleChangeName(zoneId: number, text: string) {
    setItems(prev => prev.map(z =>
      z.id === zoneId ? { ...z, name: text, dirty: text !== z.originalName } : z
    ));
  }

  async function handleSave(zone: ZoneItem) {
    if (!zone.dirty) return;
    setSaving(zone.id);
    try {
      await execCommand('update_zone', { id: zone.id, name: zone.name });
      setItems(prev => prev.map(z =>
        z.id === zone.id ? { ...z, originalName: z.name, dirty: false } : z
      ));
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to save');
    } finally {
      setSaving(null);
    }
  }

  if (connecting) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#1a56db" /></View>;
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.container}>
        <Stack.Screen options={{ title: 'Zone Names' }} />
        <FlatList
          data={items}
          keyExtractor={z => String(z.id)}
          contentContainerStyle={{ paddingBottom: 32 }}
          renderItem={({ item: z }) => (
            <View style={styles.row}>
              <Text style={styles.zoneLabel}>Zone {z.id}</Text>
              <TextInput
                style={[styles.input, z.dirty && styles.inputDirty]}
                value={z.name}
                onChangeText={t => handleChangeName(z.id, t)}
                maxLength={31}
                returnKeyType="done"
                onSubmitEditing={() => handleSave(z)}
              />
              <TouchableOpacity
                style={[styles.saveBtn, (!z.dirty || saving === z.id) && styles.saveBtnDisabled]}
                onPress={() => handleSave(z)}
                disabled={!z.dirty || saving === z.id}
              >
                {saving === z.id
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.saveBtnText}>Save</Text>}
              </TouchableOpacity>
            </View>
          )}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: '#f0f4f8', padding: 16 },
  center:         { flex: 1, alignItems: 'center', justifyContent: 'center' },
  row:            { backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 10, flexDirection: 'row', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  zoneLabel:      { fontSize: 13, color: '#6b7280', width: 52 },
  input:          { flex: 1, fontSize: 15, color: '#111827', borderBottomWidth: 1, borderBottomColor: '#e5e7eb', paddingVertical: 4, marginRight: 10 },
  inputDirty:     { borderBottomColor: '#1a56db' },
  saveBtn:        { backgroundColor: '#1a56db', borderRadius: 6, paddingVertical: 6, paddingHorizontal: 12 },
  saveBtnDisabled:{ backgroundColor: '#d1d5db' },
  saveBtnText:    { color: '#fff', fontWeight: '600', fontSize: 13 },
});
