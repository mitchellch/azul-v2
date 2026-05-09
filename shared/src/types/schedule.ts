export type ScheduleRun = {
  zone_id: number;
  day_mask: number;
  hour: number;
  minute: number;
  duration_seconds: number;
  interval_days?: number;
};

export type Schedule = {
  uuid: string;
  name: string;
  start_date: string;
  end_date: string | null;
  active?: boolean;
  runs: ScheduleRun[];
};
