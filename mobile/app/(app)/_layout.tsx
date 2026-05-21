import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { CloudGradeMonitor } from '@/context/CloudGradeMonitor';
import { useControllerStore } from '@/store/controllers';
import { useAuthStore } from '@/store/auth';
import { bleManager } from '@/lib/bleManager';
import { cloudManager } from '@/lib/cloudManager';

// Starts persistent connections for all controllers at login time.
// Connections outlive any individual screen — navigation never interrupts them.
function ConnectionStarter() {
  const controllers = useControllerStore(s => s.controllers);
  const user = useAuthStore(s => s.user);

  useEffect(() => {
    if (!user || controllers.length === 0) return;
    for (const ctrl of controllers) {
      const mac  = ctrl.mac ?? ctrl.deviceId;
      const mode = ctrl.connectionMode ?? 'ble';
      if (mode === 'ble') {
        cloudManager.stop(mac);
        bleManager.start(mac, ctrl.deviceId, ctrl.ownerSub ?? user.sub ?? '');
      } else if (mode === 'cloud' && mac) {
        bleManager.stop(mac);
        cloudManager.start(mac);
      }
    }
  }, [user, controllers]);

  return null;
}

export default function AppLayout() {
  return (
    <CloudGradeMonitor>
      <ConnectionStarter />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#1a56db' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: '600' },
        }}
      />
    </CloudGradeMonitor>
  );
}
