import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { CloudGradeMonitor } from '@/context/CloudGradeMonitor';
import { useControllerStore } from '@/store/controllers';
import { useAuthStore } from '@/store/auth';
import { bleManager } from '@/lib/bleManager';
import { cloudManager } from '@/lib/cloudManager';
// import { configCache } from '@/lib/configCache';
import { pendingQueue } from '@/lib/pendingQueue';

// Starts persistent connections for all controllers at login time.
// Connections outlive any individual screen — navigation never interrupts them.
function ConnectionStarter() {
  const controllers = useControllerStore(s => s.controllers);
  const { updateController } = useControllerStore();
  const user = useAuthStore(s => s.user);

  useEffect(() => {
    if (!user || controllers.length === 0) return;
    console.log(`[ConnectionStarter] ${controllers.length} controllers, user=${user.sub?.slice(0,8)}`);
    for (const ctrl of controllers) {
      const mac  = ctrl.mac ?? ctrl.deviceId;
      const mode = ctrl.connectionMode ?? (ctrl.mac ? 'cloud' : 'ble');
      console.log(`[ConnectionStarter] ${ctrl.name} mac=${mac} mode=${mode}`);
      if (mode === 'cloud' && mac) {
        bleManager.stop(mac);
        cloudManager.start(mac);
      } else {
        cloudManager.stop(mac);
        bleManager.start(mac, ctrl.deviceId, ctrl.ownerSub ?? user.sub ?? '');
      }
    }
    // Persist auto-promoted modes (won't re-trigger since connectionMode is now set)
    for (const ctrl of controllers) {
      if (!ctrl.connectionMode && ctrl.mac) {
        updateController(ctrl.deviceId, { connectionMode: 'cloud' });
      }
    }
    // Flush any pending API calls
    pendingQueue.flush().catch(() => {});
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
