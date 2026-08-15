import { db } from '../db/client';
import { HttpError } from '../middleware/errorHandler';
import { bumpAndPushConfig } from './configSync';
import { ScheduleRunPayload, SchedulePayload } from './scheduleSerializer';

// Firmware supports at most this many schedule runs. Cap enforced here so the
// user gets a 409 the moment they build a program list that would overflow.
export const FIRMWARE_RUN_CAP = 48;

// One Program compiled into ScheduleRun-shaped rows. A Program produces
// (startTimes × zones) runs — one per zone per start time — with each zone
// slotted after the previous one on the same start time.
type CompilerRun = {
  zoneNumber:      number;
  dayMask:         number;
  intervalDays:    number;
  hour:            number;
  minute:          number;
  durationSeconds: number;
};

export type CompileResult = {
  runs:      CompilerRun[];
  programCount: number;
};

// Returns YYYY-MM-DD in the server's local timezone. Programs' startDate /
// endDate are wall-clock date strings, so we compare against the same shape.
function today(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Fetch active-and-in-window programs for a device and expand them into
// firmware-shaped runs. Pure with respect to the DB (read-only).
export async function compileProgramsForDevice(deviceId: string): Promise<CompileResult> {
  const now = today();
  const programs = await db.program.findMany({
    where: {
      deviceId,
      active:    true,
      startDate: { lte: now },
      OR: [{ endDate: null }, { endDate: { gte: now } }],
    },
    include: {
      startTimes: true,
      zones:      { orderBy: { order: 'asc' } },
    },
  });

  const runs: CompilerRun[] = [];
  for (const program of programs) {
    for (const st of program.startTimes) {
      const baseMinutes = st.hour * 60 + st.minute;
      let offsetMinutes = 0;

      for (const z of program.zones) {
        const totalMinutes = baseMinutes + offsetMinutes;
        if (totalMinutes >= 24 * 60) {
          throw new HttpError(400,
            `Program "${program.name}" crosses midnight: start ${st.hour}:${String(st.minute).padStart(2,'0')} ` +
            `with zone ${z.zoneNumber} offset ${offsetMinutes}min lands at ${Math.floor(totalMinutes/60)}:${String(totalMinutes%60).padStart(2,'0')}. ` +
            `Split into two programs or shorten earlier durations.`);
        }
        runs.push({
          zoneNumber:      z.zoneNumber,
          dayMask:         program.dayMask,
          intervalDays:    program.intervalDays,
          hour:            Math.floor(totalMinutes / 60),
          minute:          totalMinutes % 60,
          durationSeconds: z.durationSeconds,
        });
        offsetMinutes += Math.ceil(z.durationSeconds / 60);
      }
    }
  }

  return { runs, programCount: programs.length };
}

// Deterministic uuid for the single per-device compiled Schedule row. Every
// device gets exactly one; program mutations rewrite its runs in place.
export function syntheticScheduleUuid(deviceId: string): string {
  return `compiled-${deviceId}`;
}

// Compile programs, upsert the synthetic Schedule row, and push config to
// the firmware via the existing config/push channel. Non-synthetic Schedule
// rows for this device are deleted — they were migration-time artifacts and
// have no user-facing surface post-Programs.
export async function syncCompiledProgramsToFirmware(mac: string, deviceId: string): Promise<SchedulePayload | null> {
  const { runs } = await compileProgramsForDevice(deviceId);

  if (runs.length > FIRMWARE_RUN_CAP) {
    throw new HttpError(409,
      `Programs compile to ${runs.length} runs; firmware supports at most ${FIRMWARE_RUN_CAP}. ` +
      `Reduce start times, zones, or split across date windows.`);
  }

  const uuid = syntheticScheduleUuid(deviceId);
  const startDate = today();

  // Drop legacy Schedule rows so buildConfigBlob only surfaces the synthetic.
  await db.schedule.deleteMany({
    where: { deviceId, NOT: { uuid } },
  });

  if (runs.length === 0) {
    // No active programs — remove the synthetic too so firmware ends up with
    // an empty schedule list.
    await db.schedule.deleteMany({ where: { deviceId, uuid } });
    await bumpAndPushConfig(mac, deviceId);
    return null;
  }

  // Upsert synthetic Schedule; recreate runs each time (simpler than diffing).
  const existing = await db.schedule.findUnique({ where: { uuid } });
  if (existing) {
    await db.scheduleRun.deleteMany({ where: { scheduleId: existing.id } });
    await db.schedule.update({
      where: { id: existing.id },
      data: {
        name:      '__programs__',
        startDate,
        endDate:   null,
        active:    true,
        runs: {
          create: runs.map(r => ({
            zoneNumber:      r.zoneNumber,
            dayMask:         r.dayMask,
            hour:            r.hour,
            minute:          r.minute,
            durationSeconds: r.durationSeconds,
            intervalDays:    r.intervalDays,
          })),
        },
      },
    });
  } else {
    await db.schedule.create({
      data: {
        deviceId,
        uuid,
        name:      '__programs__',
        startDate,
        endDate:   null,
        active:    true,
        runs: {
          create: runs.map(r => ({
            zoneNumber:      r.zoneNumber,
            dayMask:         r.dayMask,
            hour:            r.hour,
            minute:          r.minute,
            durationSeconds: r.durationSeconds,
            intervalDays:    r.intervalDays,
          })),
        },
      },
    });
  }

  await bumpAndPushConfig(mac, deviceId);

  const payload: SchedulePayload = {
    uuid,
    name:       '__programs__',
    start_date: startDate,
    end_date:   null,
    active:     true,
    runs: runs.map<ScheduleRunPayload>(r => ({
      zone_id:          r.zoneNumber,
      day_mask:         r.dayMask,
      hour:             r.hour,
      minute:           r.minute,
      duration_seconds: r.durationSeconds,
      ...(r.intervalDays !== 1 && { interval_days: r.intervalDays }),
    })),
  };
  return payload;
}
