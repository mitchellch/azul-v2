/**
 * One-time data migration: walk every existing Schedule and materialize it as
 * one or more Programs. Idempotent: skips devices that already have a Program.
 *
 * Strategy: within a Schedule, runs are grouped by (dayMask, intervalDays)
 * because those are Program-scope in the new model. Each group becomes one
 * Program. Within a group, each unique (hour, minute) becomes a
 * ProgramStartTime; each zone (deduped by zoneNumber, ordered by hour:minute
 * first-appearance) becomes a ProgramZone.
 *
 * Run: `npx tsx server/scripts/migrate-schedules-to-programs.ts`
 */
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

type RunKey = string; // "dayMask:intervalDays"
type Run = {
  zoneNumber: number; dayMask: number; intervalDays: number;
  hour: number; minute: number; durationSeconds: number;
};

function groupKey(r: Run): RunKey {
  return `${r.dayMask}:${r.intervalDays}`;
}

async function migrate() {
  const devices = await db.device.findMany({
    include: { schedules: { include: { runs: true } }, programs: { select: { id: true } } },
  });

  let programsCreated = 0;
  let devicesSkipped  = 0;

  for (const device of devices) {
    if (device.programs.length > 0) {
      devicesSkipped++;
      continue;
    }
    for (const schedule of device.schedules) {
      // Group runs by (dayMask, intervalDays) — one Program per group.
      const groups = new Map<RunKey, Run[]>();
      for (const r of schedule.runs) {
        const run: Run = {
          zoneNumber:      r.zoneNumber,
          dayMask:         r.dayMask,
          intervalDays:    r.intervalDays,
          hour:            r.hour,
          minute:          r.minute,
          durationSeconds: r.durationSeconds,
        };
        const k = groupKey(run);
        const list = groups.get(k) ?? [];
        list.push(run);
        groups.set(k, list);
      }

      const suffixNeeded = groups.size > 1;
      let groupIdx = 0;
      for (const [, runs] of groups) {
        groupIdx++;

        // Unique start times.
        const seenTimes = new Set<string>();
        const startTimes: { hour: number; minute: number }[] = [];
        for (const r of runs.sort((a, b) => (a.hour * 60 + a.minute) - (b.hour * 60 + b.minute))) {
          const k = `${r.hour}:${r.minute}`;
          if (seenTimes.has(k)) continue;
          seenTimes.add(k);
          startTimes.push({ hour: r.hour, minute: r.minute });
        }

        // Zones deduped by zoneNumber, ordered by first-appearance start time.
        const seenZones = new Set<number>();
        const zones: { zoneNumber: number; durationSeconds: number; order: number }[] = [];
        for (const r of runs.sort((a, b) => (a.hour * 60 + a.minute) - (b.hour * 60 + b.minute))) {
          if (seenZones.has(r.zoneNumber)) continue;
          seenZones.add(r.zoneNumber);
          zones.push({
            zoneNumber:      r.zoneNumber,
            durationSeconds: r.durationSeconds,
            order:           zones.length,
          });
        }

        const first = runs[0];
        const programName = suffixNeeded
          ? `${schedule.name} #${groupIdx}`
          : schedule.name;

        await db.program.create({
          data: {
            deviceId:     device.id,
            name:         programName,
            dayMask:      first.dayMask,
            intervalDays: first.intervalDays,
            startDate:    schedule.startDate,
            endDate:      schedule.endDate,
            active:       schedule.active,
            startTimes:   { create: startTimes },
            zones:        { create: zones },
          },
        });
        programsCreated++;
      }
    }
  }

  console.log(`Migration complete. Programs created: ${programsCreated}. Devices skipped (already had programs): ${devicesSkipped}.`);
  await db.$disconnect();
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
