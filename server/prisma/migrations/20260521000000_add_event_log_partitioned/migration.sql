-- Event log: partitioned by month for efficient archival and pruning.
-- Prisma schema has the model for client access; this migration creates
-- the actual partitioned table structure.

-- Parent table (partitioned by range on created_at)
CREATE TABLE event_log (
  id          UUID         NOT NULL DEFAULT gen_random_uuid(),
  device_id   UUID         NOT NULL REFERENCES devices(id),
  category    TEXT         NOT NULL,  -- "zone" | "schedule" | "config" | "system"
  action      TEXT         NOT NULL,  -- specific event type
  metadata    JSONB,                  -- event-specific payload
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Indexes on the parent (inherited by all partitions)
CREATE INDEX idx_event_log_device_created ON event_log (device_id, created_at DESC);
CREATE INDEX idx_event_log_created ON event_log (created_at DESC);

-- Create partitions for the current month and next 2 months.
-- The archival cron creates future partitions and drops old ones.
DO $$
DECLARE
  m_start DATE;
  m_end   DATE;
  part_name TEXT;
BEGIN
  FOR i IN 0..2 LOOP
    m_start := date_trunc('month', now()) + (i || ' months')::interval;
    m_end   := m_start + '1 month'::interval;
    part_name := 'event_log_' || to_char(m_start, 'YYYY_MM');
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I PARTITION OF event_log FOR VALUES FROM (%L) TO (%L)',
      part_name, m_start, m_end
    );
  END LOOP;
END $$;
