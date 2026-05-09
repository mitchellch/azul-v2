export type AuditSource = 'scheduler' | 'manual_rest' | 'manual_ble' | 'manual_cli';

export type AuditEntry = {
  id: string;
  zoneNumber: number;
  startedAt: string;
  durationSeconds: number;
  source: AuditSource;
};
