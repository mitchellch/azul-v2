import { Stack } from 'expo-router';

export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#1a56db' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '600' },
      }}
    />
  );
}
