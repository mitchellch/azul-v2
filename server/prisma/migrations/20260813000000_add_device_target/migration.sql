-- Add `target` column to devices — firmware target family the device runs.
-- Future values: "zone-extender", etc. All existing rows are main-controllers,
-- so the DEFAULT handles the backfill in a single statement.
ALTER TABLE "devices"
  ADD COLUMN "target" TEXT NOT NULL DEFAULT 'main-controller';
