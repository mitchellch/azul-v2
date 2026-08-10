-- Firmware releases uploaded to the server, one row per (version, target).
CREATE TABLE "firmware_releases" (
  "id"            TEXT        NOT NULL,
  "version"       TEXT        NOT NULL,
  "target"        TEXT        NOT NULL,
  "file_path"     TEXT        NOT NULL,
  "sha256"        TEXT        NOT NULL,
  "size"          INTEGER     NOT NULL,
  "release_notes" TEXT,
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "firmware_releases_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "firmware_releases_version_target_key"
  ON "firmware_releases" ("version", "target");

-- Per-device OTA attempt tracking.
CREATE TABLE "device_ota_status" (
  "id"            TEXT        NOT NULL,
  "device_id"     TEXT        NOT NULL,
  "release_id"    TEXT        NOT NULL,
  "version"       TEXT        NOT NULL,
  "status"        TEXT        NOT NULL,
  "progress"      INTEGER     NOT NULL DEFAULT 0,
  "error"         TEXT,
  "started_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at"  TIMESTAMP(3),

  CONSTRAINT "device_ota_status_pkey"     PRIMARY KEY ("id"),
  CONSTRAINT "device_ota_status_device_fk" FOREIGN KEY ("device_id")
    REFERENCES "devices" ("id") ON DELETE CASCADE,
  CONSTRAINT "device_ota_status_release_fk" FOREIGN KEY ("release_id")
    REFERENCES "firmware_releases" ("id") ON DELETE RESTRICT
);

CREATE INDEX "device_ota_status_device_started_idx"
  ON "device_ota_status" ("device_id", "started_at" DESC);
