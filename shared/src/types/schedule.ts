export type DayOfWeek = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export type ScheduleFrequency = 'daily' | 'every-other-day' | 'specific-days';

export interface ScheduleRun {
  hour: number;
  minute: number;
  durationSeconds: number;
}

export interface Schedule {
  id: string;
  zoneId: string;
  name: string;
  enabled: boolean;
  frequency: ScheduleFrequency;
  days: DayOfWeek[];
  runs: ScheduleRun[];
  createdAt: string;
  updatedAt: string;
}
