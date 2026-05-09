export type Zone = {
  id: string;
  deviceId: string;
  number: number;
  name: string;
};

export type ZoneStatus = 'idle' | 'running' | 'pending';

export type ZoneLiveState = Zone & {
  status: ZoneStatus;
  runtimeSeconds: number;
};
