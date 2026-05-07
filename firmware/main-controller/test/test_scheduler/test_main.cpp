#include "arduino_stub.h"
#include <unity.h>
#include "ScheduleModel.h"

// Inline the TimeManager static helpers for host-side testing
// (avoids pulling in NVS/WiFi/SNTP hardware dependencies)
#include <ctime>

namespace TimeManager {
    static uint32_t isoDateToDays(const char* iso) {
        if (!iso || strlen(iso) < 10) return 0;
        struct tm t = {};
        t.tm_year  = atoi(iso) - 1900;
        t.tm_mon   = atoi(iso + 5) - 1;
        t.tm_mday  = atoi(iso + 8);
        t.tm_isdst = -1;
        time_t epoch = mktime(&t);
        if (epoch < 0) return 0;
        return (uint32_t)(epoch / 86400);
    }
    static void daysToIsoDate(uint32_t days, char* buf) {
        time_t t = (time_t)days * 86400;
        struct tm tm;
        gmtime_r(&t, &tm);
        snprintf(buf, 11, "%04d-%02d-%02d",
                 tm.tm_year + 1900, tm.tm_mon + 1, tm.tm_mday);
    }
}

// Inline audit format helper for testing (avoids AuditLog NVS dependencies)
static void formatAuditEntry(const AuditEntry& e, char* out, size_t outLen) {
    time_t t = (time_t)e.timestamp;
    struct tm tm;
    gmtime_r(&t, &tm);
    snprintf(out, outLen, "%02d%02d%02d%02d%02d:%d:%d",
             tm.tm_year % 100, tm.tm_mon + 1, tm.tm_mday,
             tm.tm_hour, tm.tm_min,
             e.zoneId, e.durationSeconds);
}

void setUp() {}
void tearDown() {}

// ---------------------------------------------------------------------------
// ScheduleModel struct layout
// ---------------------------------------------------------------------------

void test_schedule_run_size() {
    TEST_ASSERT_EQUAL(8, sizeof(ScheduleRun));
}

void test_audit_entry_size() {
    TEST_ASSERT_EQUAL(8, sizeof(AuditEntry));
}

void test_change_entry_size() {
    TEST_ASSERT_EQUAL(16, sizeof(ChangeEntry));
}

// ---------------------------------------------------------------------------
// TimeManager::isoDateToDays
// ---------------------------------------------------------------------------

void test_iso_date_epoch() {
    // Jan 1 1970 = day 0
    TEST_ASSERT_EQUAL(0, TimeManager::isoDateToDays("1970-01-01"));
}

void test_iso_date_known_date() {
    // Jan 1 2026 — verify it's a plausible large number of days
    uint32_t days = TimeManager::isoDateToDays("2026-01-01");
    TEST_ASSERT_GREATER_THAN(20000u, days); // 56 years * ~365 days
    TEST_ASSERT_LESS_THAN(25000u, days);
}

void test_iso_date_roundtrip() {
    const char* iso = "2026-06-15";
    uint32_t days = TimeManager::isoDateToDays(iso);
    char buf[11];
    TimeManager::daysToIsoDate(days, buf);
    TEST_ASSERT_EQUAL_STRING(iso, buf);
}

void test_iso_date_invalid_returns_zero() {
    TEST_ASSERT_EQUAL(0, TimeManager::isoDateToDays(nullptr));
    TEST_ASSERT_EQUAL(0, TimeManager::isoDateToDays(""));
    TEST_ASSERT_EQUAL(0, TimeManager::isoDateToDays("bad"));
}

void test_iso_date_ordering() {
    uint32_t d1 = TimeManager::isoDateToDays("2026-01-01");
    uint32_t d2 = TimeManager::isoDateToDays("2026-06-01");
    uint32_t d3 = TimeManager::isoDateToDays("2026-12-31");
    TEST_ASSERT_GREATER_THAN(d1, d2);
    TEST_ASSERT_GREATER_THAN(d2, d3);
}

// ---------------------------------------------------------------------------
// Schedule model helpers
// ---------------------------------------------------------------------------

void test_day_mask_constants() {
    TEST_ASSERT_EQUAL(0x7F, DAY_ALL);
    TEST_ASSERT_EQUAL(1,    DAY_SUN);
    TEST_ASSERT_EQUAL(64,   DAY_SAT);
}

void test_schedule_run_day_matching() {
    ScheduleRun r;
    r.dayMask = DAY_MON | DAY_WED | DAY_FRI;

    // tm_wday: 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
    TEST_ASSERT_TRUE(r.dayMask  & (1 << 1)); // Monday
    TEST_ASSERT_FALSE(r.dayMask & (1 << 2)); // Tuesday
    TEST_ASSERT_TRUE(r.dayMask  & (1 << 3)); // Wednesday
    TEST_ASSERT_FALSE(r.dayMask & (1 << 4)); // Thursday
    TEST_ASSERT_TRUE(r.dayMask  & (1 << 5)); // Friday
    TEST_ASSERT_FALSE(r.dayMask & (1 << 0)); // Sunday
}

void test_schedule_date_range_no_overlap() {
    uint32_t s1_start = TimeManager::isoDateToDays("2026-01-01");
    uint32_t s1_end   = TimeManager::isoDateToDays("2026-05-31");
    uint32_t s2_start = TimeManager::isoDateToDays("2026-06-01");
    uint32_t s2_end   = TimeManager::isoDateToDays("2026-12-31");

    // Non-overlapping: s1.end < s2.start
    bool overlap = !(s1_end < s2_start || s1_start > s2_end);
    TEST_ASSERT_FALSE(overlap);
}

void test_schedule_date_range_overlap() {
    uint32_t s1_start = TimeManager::isoDateToDays("2026-01-01");
    uint32_t s1_end   = TimeManager::isoDateToDays("2026-06-30");
    uint32_t s2_start = TimeManager::isoDateToDays("2026-06-01"); // overlaps June
    uint32_t s2_end   = TimeManager::isoDateToDays("2026-12-31");

    bool overlap = !(s1_end < s2_start || s1_start > s2_end);
    TEST_ASSERT_TRUE(overlap);
}

void test_schedule_open_ended() {
    uint32_t today     = TimeManager::isoDateToDays("2026-06-15");
    uint32_t startDate = TimeManager::isoDateToDays("2026-01-01");
    uint32_t endDate   = 0xFFFFFFFF;

    // today is within range
    TEST_ASSERT_TRUE(today >= startDate);
    TEST_ASSERT_TRUE(today <= endDate);
}

void test_keepalive_uuid_is_all_zeros() {
    TEST_ASSERT_EQUAL_STRING("00000000-0000-0000-0000-000000000000", KEEPALIVE_UUID);
}

void test_audit_source_values() {
    TEST_ASSERT_EQUAL(0, (uint8_t)AuditSource::SCHEDULER);
    TEST_ASSERT_EQUAL(1, (uint8_t)AuditSource::MANUAL_REST);
    TEST_ASSERT_EQUAL(2, (uint8_t)AuditSource::MANUAL_BLE);
    TEST_ASSERT_EQUAL(3, (uint8_t)AuditSource::MANUAL_CLI);
}

// ---------------------------------------------------------------------------
// AuditLog compact format
// ---------------------------------------------------------------------------

void test_audit_format_entry() {
    AuditEntry e;
    // Use a known timestamp: 2026-05-07 14:30:00 UTC
    // mktime equivalent: strptime not available portably, use hardcoded value
    // 2026-05-07 = days since epoch: ~20580, seconds = 20580*86400 + 14*3600 + 30*60
    e.timestamp       = (uint32_t)(TimeManager::isoDateToDays("2026-05-07") * 86400ULL
                                   + 14*3600 + 30*60);
    e.zoneId          = 3;
    e.durationSeconds = 120;
    e.source          = 0;

    char buf[32];
    formatAuditEntry(e, buf, sizeof(buf));

    // Should start with 260507 (YY=26, MM=05, DD=07)
    TEST_ASSERT_EQUAL('2', buf[0]);
    TEST_ASSERT_EQUAL('6', buf[1]);
    TEST_ASSERT_EQUAL('0', buf[2]);
    TEST_ASSERT_EQUAL('5', buf[3]);
    TEST_ASSERT_EQUAL('0', buf[4]);
    TEST_ASSERT_EQUAL('7', buf[5]);
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

int main(int argc, char** argv) {
    UNITY_BEGIN();

    RUN_TEST(test_schedule_run_size);
    RUN_TEST(test_audit_entry_size);
    RUN_TEST(test_change_entry_size);

    RUN_TEST(test_iso_date_epoch);
    RUN_TEST(test_iso_date_known_date);
    RUN_TEST(test_iso_date_roundtrip);
    RUN_TEST(test_iso_date_invalid_returns_zero);
    RUN_TEST(test_iso_date_ordering);

    RUN_TEST(test_day_mask_constants);
    RUN_TEST(test_schedule_run_day_matching);
    RUN_TEST(test_schedule_date_range_no_overlap);
    RUN_TEST(test_schedule_date_range_overlap);
    RUN_TEST(test_schedule_open_ended);
    RUN_TEST(test_keepalive_uuid_is_all_zeros);
    RUN_TEST(test_audit_source_values);

    RUN_TEST(test_audit_format_entry);

    return UNITY_END();
}
