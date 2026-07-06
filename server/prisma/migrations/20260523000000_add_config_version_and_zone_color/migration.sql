-- Add configVersion to devices (monotonically increasing, bumped on every config mutation)
ALTER TABLE devices ADD COLUMN config_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE devices ADD COLUMN last_config_ack INTEGER DEFAULT NULL;

-- Add color to zones (user-selectable zone color, defaults to null = use palette default)
ALTER TABLE zones ADD COLUMN color TEXT DEFAULT NULL;
