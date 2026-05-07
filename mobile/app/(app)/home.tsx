import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { logout } from '@/services/auth';
import { useAuthStore } from '@/store/auth';

export default function HomeScreen() {
  const { user, clearSession } = useAuthStore();

  async function handleLogout() {
    await logout();
    clearSession();
  }

  return (
    <View style={styles.container}>
      {user?.picture && (
        <Image source={{ uri: user.picture }} style={styles.avatar} />
      )}
      <Text style={styles.greeting}>Welcome{user?.name ? `, ${user.name}` : ''}!</Text>
      <Text style={styles.email}>{user?.email}</Text>

      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>Controllers will appear here</Text>
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutText}>Sign Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f4f8',
    alignItems: 'center',
    padding: 24,
    paddingTop: 48,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    marginBottom: 16,
  },
  greeting: {
    fontSize: 22,
    fontWeight: '600',
    color: '#111827',
  },
  email: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
    marginBottom: 32,
  },
  placeholder: {
    flex: 1,
    width: '100%',
    backgroundColor: '#e5e7eb',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    color: '#9ca3af',
    fontSize: 15,
  },
  logoutButton: {
    marginTop: 24,
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  logoutText: {
    color: '#374151',
    fontSize: 15,
  },
});
