import { useEffect, useRef, ReactNode } from 'react';
import EventSource from 'react-native-sse';
import { useControllerStore, useCloudGradeStore } from '@/store/controllers';
import { useAuthStore } from '@/store/auth';
import { getConnectionStatus } from '@/services/cloudApi';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000/api';

// Opens one persistent SSE stream per cloud controller so the home screen
// gets instant offline/online updates via LWT without polling.
export function CloudGradeMonitor({ children }: { children: ReactNode }) {
  const controllers     = useControllerStore(s => s.controllers);
  const updateController = useControllerStore(s => s.updateController);
  const setGrade        = useCloudGradeStore(s => s.setGrade);
  const sseRefs         = useRef<Map<string, EventSource>>(new Map());

  useEffect(() => {
    const cloudCtrls = controllers.filter(c => c.connectionMode === 'cloud' && c.mac);
    const activeIds  = new Set(cloudCtrls.map(c => c.id));

    // Close streams for controllers no longer in cloud mode
    for (const [id, es] of sseRefs.current) {
      if (!activeIds.has(id)) { es.close(); sseRefs.current.delete(id); }
    }

    const { accessToken } = useAuthStore.getState();
    if (!accessToken) return;

    for (const ctrl of cloudCtrls) {
      if (sseRefs.current.has(ctrl.id)) continue; // already open

      // Seed grade from REST immediately
      getConnectionStatus(ctrl.mac!).then(s => setGrade(ctrl.id, s.grade)).catch(() => {});

      const es = new EventSource(`${API_URL}/devices/${ctrl.mac}/stream`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      es.addEventListener('message', (e: any) => {
        try {
          const event = JSON.parse(e.data);
          if (event.type === 'connection') {
            setGrade(ctrl.id, event.online ? 'good' : 'offline');
          } else if (event.type === 'status') {
            setGrade(ctrl.id, 'good');
          } else if (event.type === 'snapshot' && event.device?.name) {
            const local = useControllerStore.getState().controllers.find(c => c.id === ctrl.id);
            if (local && local.name !== event.device.name) {
              updateController(local.deviceId, { name: event.device.name });
            }
          }
        } catch { /* ignore */ }
      });

      es.addEventListener('error', () => {
        // On error, remove so it gets re-opened next render cycle
        sseRefs.current.delete(ctrl.id);
      });

      sseRefs.current.set(ctrl.id, es);
    }

    return () => {
      // Only close streams for controllers that were removed this cycle
    };
  }, [controllers.map(c => `${c.id}:${c.connectionMode}`).join(',')]);

  // Cleanup all on unmount
  useEffect(() => {
    return () => {
      for (const es of sseRefs.current.values()) es.close();
      sseRefs.current.clear();
    };
  }, []);

  return <>{children}</>;
}
