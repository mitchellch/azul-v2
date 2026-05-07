#pragma once
#ifdef UNIT_TEST
#include "arduino_stub.h"
#else
#include <Arduino.h>
#endif

#define MAX_RUNS_PER_SCHEDULE  24
#define SCHEDULE_RING_SIZE      5
#define AUDIT_RING_SIZE       256
#define CHANGELOG_RING_SIZE    32
#define MAX_ZONES               8

// Bit positions for dayMask: bit 0 = Sunday ... bit 6 = Saturday (tm_wday order)
#define DAY_SUN  (1 << 0)
#define DAY_MON  (1 << 1)
#define DAY_TUE  (1 << 2)
#define DAY_WED  (1 << 3)
#define DAY_THU  (1 << 4)
#define DAY_FRI  (1 << 5)
#define DAY_SAT  (1 << 6)
#define DAY_ALL  0x7F

struct ScheduleRun {
    uint8_t  zoneId;
    uint8_t  dayMask;
    uint8_t  hour;
    uint8_t  minute;
    uint16_t durationSeconds;
    uint8_t  _pad[2];
};
static_assert(sizeof(ScheduleRun) == 8, "ScheduleRun must be 8 bytes");

struct Schedule {
    char     uuid[37];
    char     name[32];
    uint32_t startDate;   // days since Unix epoch (Jan 1 1970 = day 0)
    uint32_t endDate;     // inclusive; 0xFFFFFFFF = open-ended
    uint8_t  runCount;
    uint8_t  _pad[3];
    ScheduleRun runs[MAX_RUNS_PER_SCHEDULE];
};

// All-zeros UUID marks the keepalive schedule
#define KEEPALIVE_UUID "00000000-0000-0000-0000-000000000000"

// Sources for audit log entries
enum class AuditSource : uint8_t {
    SCHEDULER = 0,
    MANUAL_REST = 1,
    MANUAL_BLE = 2,
    MANUAL_CLI = 3
};

struct AuditEntry {
    uint32_t    timestamp;        // Unix epoch seconds (UTC)
    uint8_t     zoneId;
    uint8_t     source;           // AuditSource
    uint16_t    durationSeconds;
};
static_assert(sizeof(AuditEntry) == 8, "AuditEntry must be 8 bytes");

enum class ChangeOp : uint8_t { CREATE = 0, UPDATE = 1, DELETED = 2, ACTIVATE = 3 };

struct ChangeEntry {
    uint32_t  timestamp;
    char      uuid[8];            // first 8 hex chars of schedule UUID
    ChangeOp  op;
    uint8_t   _pad[3];
};
static_assert(sizeof(ChangeEntry) == 16, "ChangeEntry must be 16 bytes");
