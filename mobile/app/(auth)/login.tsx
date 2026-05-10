import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { login, register, parseIdToken } from '@/services/auth';
import { useAuthStore } from '@/store/auth';

export default function LoginScreen() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setSession = useAuthStore((s) => s.setSession);

  async function handleAuth(fn: typeof login) {
    setLoading(true);
    setError(null);
    try {
      const credentials = await fn();
      const userInfo = parseIdToken(credentials.idToken);
      setSession(userInfo as any, credentials.accessToken);
    } catch (e: any) {
      if (e?.error !== 'a0.session.user_cancelled') {
        setError(e?.error_description ?? e?.error ?? e?.message ?? 'Login failed.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Azul</Text>
      <Text style={styles.subtitle}>Smart Irrigation Control</Text>

      {error && <Text style={styles.error}>{error}</Text>}

      <TouchableOpacity style={styles.button} onPress={() => handleAuth(login)} disabled={loading}>
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Sign In</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity style={styles.buttonOutline} onPress={() => handleAuth(register)} disabled={loading}>
        <Text style={styles.buttonOutlineText}>Create Account</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f4f8',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#1a56db',
    letterSpacing: 2,
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
    marginTop: 8,
    marginBottom: 48,
  },
  button: {
    backgroundColor: '#1a56db',
    paddingVertical: 14,
    paddingHorizontal: 48,
    borderRadius: 8,
    minWidth: 200,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  error: {
    color: '#ef4444',
    marginBottom: 16,
    textAlign: 'center',
  },
  buttonOutline: {
    borderWidth: 1.5,
    borderColor: '#1a56db',
    paddingVertical: 14,
    paddingHorizontal: 48,
    borderRadius: 8,
    minWidth: 200,
    alignItems: 'center',
    marginTop: 12,
  },
  buttonOutlineText: {
    color: '#1a56db',
    fontSize: 16,
    fontWeight: '600',
  },
});
