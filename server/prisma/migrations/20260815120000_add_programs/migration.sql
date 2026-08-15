-- CreateTable
CREATE TABLE "programs" (
    "id"            TEXT NOT NULL,
    "device_id"     TEXT NOT NULL,
    "name"          TEXT NOT NULL,
    "day_mask"      INTEGER NOT NULL,
    "interval_days" INTEGER NOT NULL DEFAULT 1,
    "start_date"    TEXT NOT NULL,
    "end_date"      TEXT,
    "active"        BOOLEAN NOT NULL DEFAULT false,
    "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "program_start_times" (
    "id"         TEXT NOT NULL,
    "program_id" TEXT NOT NULL,
    "hour"       INTEGER NOT NULL,
    "minute"     INTEGER NOT NULL,

    CONSTRAINT "program_start_times_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "program_zones" (
    "id"               TEXT NOT NULL,
    "program_id"       TEXT NOT NULL,
    "zone_number"      INTEGER NOT NULL,
    "duration_seconds" INTEGER NOT NULL,
    "order"            INTEGER NOT NULL,

    CONSTRAINT "program_zones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "programs_device_id_active_idx" ON "programs"("device_id", "active");

-- CreateIndex
CREATE INDEX "program_start_times_program_id_idx" ON "program_start_times"("program_id");

-- CreateIndex
CREATE INDEX "program_zones_program_id_idx" ON "program_zones"("program_id");

-- AddForeignKey
ALTER TABLE "programs"
    ADD CONSTRAINT "programs_device_id_fkey"
    FOREIGN KEY ("device_id") REFERENCES "devices"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program_start_times"
    ADD CONSTRAINT "program_start_times_program_id_fkey"
    FOREIGN KEY ("program_id") REFERENCES "programs"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program_zones"
    ADD CONSTRAINT "program_zones_program_id_fkey"
    FOREIGN KEY ("program_id") REFERENCES "programs"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
