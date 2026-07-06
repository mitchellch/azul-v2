import { View, TouchableOpacity, StyleSheet, Text } from 'react-native';

const SWATCHES = [
  { hex: '#6b7280', label: 'Gray' },
  { hex: '#ef4444', label: 'Red' },
  { hex: '#f97316', label: 'Orange' },
  { hex: '#eab308', label: 'Yellow' },
  { hex: '#22c55e', label: 'Green' },
  { hex: '#3b82f6', label: 'Blue' },
  { hex: '#6366f1', label: 'Indigo' },
  { hex: '#a855f7', label: 'Purple' },
  { hex: '#ec4899', label: 'Pink' },
  { hex: '#14b8a6', label: 'Teal' },
  { hex: '#84cc16', label: 'Lime' },
  { hex: '#78716c', label: 'Stone' },
];

type Props = {
  selected: string | null;
  onSelect: (color: string) => void;
};

export function ColorPicker({ selected, onSelect }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>Zone Color</Text>
      <View style={styles.grid}>
        {SWATCHES.map(s => (
          <TouchableOpacity
            key={s.hex}
            onPress={() => onSelect(s.hex)}
            accessibilityLabel={s.label}
            accessibilityRole="button"
            style={[
              styles.swatch,
              { backgroundColor: s.hex },
              selected === s.hex && styles.swatchSelected,
            ]}
          >
            {selected === s.hex && <Text style={styles.check}>✓</Text>}
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

export { SWATCHES };

const styles = StyleSheet.create({
  container: { marginTop: 12 },
  label: { fontSize: 13, fontWeight: '500', color: '#6b7280', marginBottom: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  swatch: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: 'transparent',
  },
  swatchSelected: { borderColor: '#111827' },
  check: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
