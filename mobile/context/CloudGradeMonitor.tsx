import { useEffect, ReactNode } from 'react';
import { useControllerStore, useCloudGradeStore } from '@/store/controllers';
import { getConnectionStatus } from '@/services/cloudApi';
import { cloudManager } from '@/lib/cloudManager';

// Tracks per-controller connection grade for the home-screen indicator.
// Uses cloudManager's SHARED SSE for online/offline transitions (via state
// subscription) and an initial REST seed for the server's fine-grained grade
// (good/degraded/poor). Does NOT open its own EventSource streams — doing so
// would spawn one OkHttp slot per mac and starve the fetch pool (regression
// of the 2026-08-13 fix — see cloudManager.ts comment on sharedSSE).
export function CloudGradeMonitor({ children }: { children: ReactNode }) {
  const controllers = useControllerStore(s => s.controllers);
  const setGrade    = useCloudGradeStore(s => s.setGrade);

  useEffect(() => {
    const cloudCtrls = controllers.filter(c => c.connectionMode === 'cloud' && c.mac);
    const unsubs: Array<() => void> = [];

    for (const ctrl of cloudCtrls) {
      const mac = ctrl.mac!;

      getConnectionStatus(mac)
        .then(s => setGrade(ctrl.id, s.grade))
        .catch(() => { /* offline flip handled by state subscription below */ });

      const unsubState = cloudManager.subscribeState(mac, (st) => {
        setGrade(ctrl.id, st.connected ? 'good' : 'offline');
      });
      unsubs.push(unsubState);
    }

    return () => { for (const u of unsubs) u(); };
  }, [controllers.map(c => `${c.id}:${c.connectionMode}`).join(',')]);

  return <>{children}</>;
}
