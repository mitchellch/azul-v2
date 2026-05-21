/**
 * Event Log Archival Script
 *
 * Run monthly via cron (e.g., 1st of each month at 03:00 UTC):
 *   0 3 1 * * cd /path/to/server && npx tsx scripts/archive-events.ts
 *
 * What it does:
 * 1. Identifies partitions older than RETENTION_DAYS (default: 30)
 * 2. Exports each old partition to S3 as gzipped JSON Lines
 * 3. Drops the exported partition from Postgres
 * 4. Creates partitions for the next 3 months (ensures future writes never fail)
 *
 * Required env vars:
 *   DATABASE_URL        — Postgres connection string
 *   AWS_REGION          — e.g., "us-west-2"
 *   EVENT_LOG_BUCKET    — S3 bucket name
 *   AWS credentials via standard SDK chain (env, instance role, etc.)
 */

import { PrismaClient } from '@prisma/client';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { gzipSync } from 'node:zlib';

const RETENTION_DAYS = parseInt(process.env.EVENT_LOG_RETENTION_DAYS ?? '30');
const BUCKET = process.env.EVENT_LOG_BUCKET;
const REGION = process.env.AWS_REGION ?? 'us-west-2';
const BATCH_SIZE = 5000;

const db = new PrismaClient();
const s3 = BUCKET ? new S3Client({ region: REGION }) : null;

async function main() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);
  const cutoffMonth = `${cutoff.getFullYear()}_${String(cutoff.getMonth() + 1).padStart(2, '0')}`;

  console.log(`[archive] Retention: ${RETENTION_DAYS} days. Archiving partitions before ${cutoffMonth}`);

  // Find partitions that are candidates for archival
  const partitions = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename LIKE 'event_log_%'
    ORDER BY tablename
  `;

  for (const { tablename } of partitions) {
    const match = tablename.match(/^event_log_(\d{4}_\d{2})$/);
    if (!match) continue;
    const partMonth = match[1];
    if (partMonth >= cutoffMonth) continue;

    console.log(`[archive] Processing ${tablename} (${partMonth})`);

    // Export rows
    const lines: string[] = [];
    let offset = 0;
    while (true) {
      const rows = await db.$queryRawUnsafe<any[]>(
        `SELECT * FROM "${tablename}" ORDER BY created_at LIMIT ${BATCH_SIZE} OFFSET ${offset}`
      );
      if (rows.length === 0) break;
      for (const row of rows) lines.push(JSON.stringify(row));
      offset += rows.length;
    }

    if (lines.length === 0) {
      console.log(`[archive] ${tablename} is empty, dropping`);
    } else {
      console.log(`[archive] ${tablename}: ${lines.length} events`);

      // Upload to S3
      if (s3 && BUCKET) {
        const key = `event-log/${partMonth}.jsonl.gz`;
        const body = gzipSync(Buffer.from(lines.join('\n') + '\n'));
        await s3.send(new PutObjectCommand({
          Bucket: BUCKET,
          Key: key,
          Body: body,
          ContentType: 'application/x-ndjson',
          ContentEncoding: 'gzip',
        }));
        console.log(`[archive] Uploaded s3://${BUCKET}/${key} (${(body.length / 1024).toFixed(1)} KB)`);
      } else {
        console.log(`[archive] S3 not configured — skipping upload (set EVENT_LOG_BUCKET)`);
      }
    }

    // Drop the partition
    await db.$executeRawUnsafe(`DROP TABLE IF EXISTS "${tablename}"`);
    console.log(`[archive] Dropped ${tablename}`);
  }

  // Ensure partitions exist for the next 3 months
  for (let i = 0; i <= 3; i++) {
    const d = new Date();
    d.setMonth(d.getMonth() + i);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const partName = `event_log_${y}_${String(m).padStart(2, '0')}`;
    const start = `${y}-${String(m).padStart(2, '0')}-01`;
    const nextM = m === 12 ? 1 : m + 1;
    const nextY = m === 12 ? y + 1 : y;
    const end = `${nextY}-${String(nextM).padStart(2, '0')}-01`;

    await db.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "${partName}" PARTITION OF event_log FOR VALUES FROM ('${start}') TO ('${end}')`
    );
  }
  console.log('[archive] Future partitions ensured. Done.');

  await db.$disconnect();
}

main().catch(err => {
  console.error('[archive] Fatal:', err);
  process.exit(1);
});
