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
    let cancelled = false;
    (async () => {
      // Stagger cloud loads: RN's OkHttp maxRequestsPerHost is 5. Firing N parallel
      // GETs at boot alongside the shared SSE fills the pool and any hang taints it.
      for (const ctrl of controllers) {
        if (cancelled) return;
        const mac  = ctrl.mac ?? ctrl.deviceId;
        const mode = ctrl.connectionMode ?? (ctrl.mac ? 'cloud' : 'ble');
        console.log(`[ConnectionStarter] ${ctrl.name} mac=${mac} mode=${mode}`);
        if (mode === 'cloud' && mac) {
          bleManager.stop(mac);
          cloudManager.start(mac);
          await new Promise(r => setTimeout(r, 600));
        } else {
          cloudManager.stop(mac);
          bleManager.start(mac, ctrl.deviceId, ctrl.ownerSub ?? user.sub ?? '');
        }
      }
      for (const ctrl of controllers) {
        if (!ctrl.connectionMode && ctrl.mac) {
          updateController(ctrl.deviceId, { connectionMode: 'cloud' });
        }
      }
      pendingQueue.flush().catch(() => {});
    })();
    return () => { cancelled = true; };
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
