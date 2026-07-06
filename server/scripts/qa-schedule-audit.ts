/**
 * QA Schedule Audit
 *
 * Compares actual zone_start events from the last N days against
 * the active schedule to identify missed or unexpected runs.
 *
 * Usage:
 *   npx tsx scripts/qa-schedule-audit.ts <mac> [days=7]
 *
 * Example:
 *   npx tsx scripts/qa-schedule-audit.ts AC:15:18:D3:7A:BC 7
 */

import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type ScheduleRun = {
  zoneNumber: number;
  dayMask: number;
  hour: number;
  minute: number;
  durationSeconds: number;
  intervalDays: number;
};

type EventRow = {
  action: string;
  metadata: any;
  createdAt: Date;
};

function dayMaskToDays(mask: number): number[] {
  const days: number[] = [];
  for (let i = 0; i < 7; i++) {
    if (mask & (1 << i)) days.push(i);
  }
  return days;
}

function formatTime(h: number, m: number): string {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function formatDuration(secs: number): string {
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m${secs % 60 ? ` ${secs % 60}s` : ''}`;
}

async function main() {
  const mac = process.argv[2];
  const days = parseInt(process.argv[3] ?? '7');

  if (!mac) {
    console.error('Usage: npx tsx scripts/qa-schedule-audit.ts <mac> [days=7]');
    process.exit(1);
  }

  console.log(`\n📋 Schedule Audit: ${mac} (last ${days} days)\n`);
  console.log('='.repeat(60));

  // Find device
  const device = await db.device.findUnique({ where: { mac } });
  if (!device) { console.error(`Device not found: ${mac}`); process.exit(1); }

  // Get active schedule
  const schedule = await db.schedule.findFirst({
    where: { deviceId: device.id, active: true },
    include: { runs: true },
  });

  if (!schedule) {
    console.log('\n⚠️  No active schedule found for this device.');
    console.log('   Cannot compare — showing raw events only.\n');
  } else {
    console.log(`\nActive Schedule: "${schedule.name}"`);
    console.log(`Date range: ${schedule.startDate} → ${schedule.endDate ?? 'open-ended'}`);
    console.log(`Runs: ${schedule.runs.length}\n`);

    console.log('Expected runs:');
    for (const run of schedule.runs) {
      const days = dayMaskToDays(run.dayMask);
      const dayStr = days.map(d => DAY_NAMES[d]).join(', ');
      console.log(`  Zone ${run.zoneNumber} | ${formatTime(run.hour, run.minute)} | ${formatDuration(run.durationSeconds)} | ${dayStr}${run.intervalDays > 1 ? ` (every ${run.intervalDays} days)` : ''}`);
    }
    console.log('');
  }

  // Get actual events
  const since = new Date();
  since.setDate(since.getDate() - days);

  const events = await db.eventLog.findMany({
    where: {
      deviceId: device.id,
      category: 'zone',
      createdAt: { gte: since },
    },
    orderBy: { createdAt: 'asc' },
  }) as unknown as EventRow[];

  console.log('-'.repeat(60));
  console.log(`\nActual zone events (${events.length} total):\n`);

  if (events.length === 0) {
    console.log('  No events recorded in this period.\n');
  } else {
    // Group by day
    const byDay = new Map<string, EventRow[]>();
    for (const e of events) {
      const dayKey = e.createdAt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      if (!byDay.has(dayKey)) byDay.set(dayKey, []);
      byDay.get(dayKey)!.push(e);
    }

    for (const [day, dayEvents] of byDay) {
      console.log(`  ${day}:`);
      for (const e of dayEvents) {
        const meta = e.metadata as any;
        const time = e.createdAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
        const zone = meta?.zone ?? '?';
        const dur = meta?.duration ? formatDuration(meta.duration) : '';
        const source = meta?.source ?? '';
        const icon = e.action === 'zone_start' ? '▶' : '■';
        console.log(`    ${icon} ${time} Zone ${zone} ${e.action === 'zone_start' ? 'started' : 'stopped'} ${dur} [${source}]`);
      }
    }
    console.log('');
  }

  // Compare: expected vs actual
  if (schedule && events.length > 0) {
    console.log('-'.repeat(60));
    console.log('\nSchedule Compliance:\n');

    let expectedCount = 0;
    let matchedCount = 0;
    const missed: string[] = [];
    const unexpected: string[] = [];

    // Build expected runs for each day in the window
    const startDate = new Date(Math.max(since.getTime(), new Date(schedule.startDate).getTime()));
    const endDate = schedule.endDate ? new Date(Math.min(Date.now(), new Date(schedule.endDate).getTime())) : new Date();

    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dow = d.getDay(); // 0=Sun

      for (const run of schedule.runs) {
        if (!(run.dayMask & (1 << dow))) continue;

        // Check interval_days (skip days based on interval from schedule start)
        if (run.intervalDays > 1) {
          const schedStart = new Date(schedule.startDate);
          const daysSinceStart = Math.floor((d.getTime() - schedStart.getTime()) / 86400000);
          if (daysSinceStart % run.intervalDays !== 0) continue;
        }

        expectedCount++;
        const expectedTime = new Date(d);
        expectedTime.setHours(run.hour, run.minute, 0, 0);

        // Look for a matching event (within 5-minute tolerance)
        const match = events.find(e => {
          if (e.action !== 'zone_start') return false;
          const meta = e.metadata as any;
          if (meta?.zone !== run.zoneNumber) return false;
          const diff = Math.abs(e.createdAt.getTime() - expectedTime.getTime());
          return diff < 5 * 60 * 1000; // 5 min tolerance
        });

        if (match) {
          matchedCount++;
        } else {
          const dayStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
          missed.push(`  Zone ${run.zoneNumber} @ ${formatTime(run.hour, run.minute)} on ${dayStr}`);
        }
      }
    }

    // Check for unexpected runs (not matching any schedule entry)
    const scheduledStarts = events.filter(e => {
      if (e.action !== 'zone_start') return false;
      const meta = e.metadata as any;
      return meta?.source === 'scheduler';
    });

    const manualStarts = events.filter(e => {
      if (e.action !== 'zone_start') return false;
      const meta = e.metadata as any;
      return meta?.source !== 'scheduler';
    });

    const compliance = expectedCount > 0 ? ((matchedCount / expectedCount) * 100).toFixed(1) : 'N/A';

    console.log(`  Expected runs:  ${expectedCount}`);
    console.log(`  Matched:        ${matchedCount}`);
    console.log(`  Missed:         ${missed.length}`);
    console.log(`  Manual runs:    ${manualStarts.length}`);
    console.log(`  Compliance:     ${compliance}%`);

    if (missed.length > 0) {
      console.log('\n  ❌ Missed runs:');
      missed.forEach(m => console.log(`  ${m}`));
    }

    if (manualStarts.length > 0) {
      console.log('\n  ℹ️  Manual activations (not from schedule):');
      for (const e of manualStarts) {
        const meta = e.metadata as any;
        const time = e.createdAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
        const dayStr = e.createdAt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        console.log(`    Zone ${meta?.zone} @ ${time} on ${dayStr} [${meta?.source}]`);
      }
    }

    if (missed.length === 0 && expectedCount > 0) {
      console.log('\n  ✅ All scheduled runs executed as expected.');
    }
    console.log('');
  }

  await db.$disconnect();
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
