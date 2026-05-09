import { Schedule, ScheduleRun } from '@prisma/client';

// Shape the firmware/mobile app expects
export type ScheduleRunPayload = {
  zone_id: number;
  day_mask: number;
  hour: number;
  minute: number;
  duration_seconds: number;
  interval_days?: number;
};

export type SchedulePayload = {
  uuid: string;
  name: string;
  start_date: string;
  end_date: string | null;
  runs: ScheduleRunPayload[];
};

export function toPayload(schedule: Schedule & { runs: ScheduleRun[] }): SchedulePayload {
  return {
    uuid:       schedule.uuid,
    name:       schedule.name,
    start_date: schedule.startDate,
    end_date:   schedule.endDate ?? null,
    runs: schedule.runs.map(r => ({
      zone_id:          r.zoneNumber,
      day_mask:         r.dayMask,
      hour:             r.hour,
      minute:           r.minute,
      duration_seconds: r.durationSeconds,
      ...(r.intervalDays !== 1 && { interval_days: r.intervalDays }),
    })),
  };
}
