import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useAuthStore } from '@/store/auth';
import { refreshSession, parseIdToken } from '@/services/auth';

function AuthGuard() {
  const { user, setSession, clearSession } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const credentials = await refreshSession();
      if (credentials) {
        const userInfo = parseIdToken(credentials.idToken);
        setSession(userInfo as any, credentials.accessToken);
      } else {
        clearSession();
      }
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    if (!ready) return;
    const inAuthGroup = segments[0] === '(auth)';
    if (!user && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (user && inAuthGroup) {
      router.replace('/(app)/home');
    }
  }, [ready, user, segments]);

  return null;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthGuard />
      <Stack screenOptions={{ headerShown: false }} />
    </GestureHandlerRootView>
  );
}
