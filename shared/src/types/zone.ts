export type ZoneStatus = 'idle' | 'running' | 'error';

export interface Zone {
  id: string;
  controllerId: string;
  name: string;
  status: ZoneStatus;
  runtimeSeconds: number | null;
  createdAt: string;
  updatedAt: string;
}
