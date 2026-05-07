#include "arduino_stub.h"
#include <unity.h>
#include "ZoneController.h"
#include "../../src/ZoneController.cpp"

static ZoneController zones;

void setUp() {
    zones = ZoneController();
}

void tearDown() {}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

void test_all_zones_idle_on_init() {
    for (uint8_t i = 1; i <= MAX_ZONES; i++) {
        const Zone* z = zones.getZone(i);
        TEST_ASSERT_NOT_NULL(z);
        TEST_ASSERT_EQUAL(ZoneStatus::IDLE, z->status);
        TEST_ASSERT_EQUAL(0, z->runtimeSeconds);
    }
}

void test_zone_ids_are_correct_on_init() {
    for (uint8_t i = 1; i <= MAX_ZONES; i++) {
        TEST_ASSERT_EQUAL(i, zones.getZone(i)->id);
    }
}

void test_no_zones_running_on_init() {
    TEST_ASSERT_FALSE(zones.isAnyZoneRunning());
}

// ---------------------------------------------------------------------------
// startZone
// ---------------------------------------------------------------------------

void test_start_valid_zone() {
    TEST_ASSERT_TRUE(zones.startZone(1, 60));
    TEST_ASSERT_EQUAL(ZoneStatus::RUNNING, zones.getZone(1)->status);
    TEST_ASSERT_EQUAL(60, zones.getZone(1)->runtimeSeconds);
}

void test_start_zone_sets_any_running() {
    zones.startZone(3, 30);
    TEST_ASSERT_TRUE(zones.isAnyZoneRunning());
}

void test_start_invalid_zone_id_zero() {
    TEST_ASSERT_FALSE(zones.startZone(0, 60));
}

void test_start_invalid_zone_id_too_high() {
    TEST_ASSERT_FALSE(zones.startZone(MAX_ZONES + 1, 60));
}

void test_start_multiple_zones() {
    TEST_ASSERT_TRUE(zones.startZone(1, 10));
    TEST_ASSERT_TRUE(zones.startZone(2, 20));
    TEST_ASSERT_EQUAL(ZoneStatus::RUNNING, zones.getZone(1)->status);
    TEST_ASSERT_EQUAL(ZoneStatus::RUNNING, zones.getZone(2)->status);
    TEST_ASSERT_EQUAL(ZoneStatus::IDLE,    zones.getZone(3)->status);
}

// ---------------------------------------------------------------------------
// stopZone
// ---------------------------------------------------------------------------

void test_stop_running_zone() {
    zones.startZone(2, 60);
    TEST_ASSERT_TRUE(zones.stopZone(2));
    TEST_ASSERT_EQUAL(ZoneStatus::IDLE, zones.getZone(2)->status);
    TEST_ASSERT_EQUAL(0, zones.getZone(2)->runtimeSeconds);
}

void test_stop_idle_zone_is_safe() {
    TEST_ASSERT_TRUE(zones.stopZone(1));
    TEST_ASSERT_EQUAL(ZoneStatus::IDLE, zones.getZone(1)->status);
}

void test_stop_invalid_zone_id() {
    TEST_ASSERT_FALSE(zones.stopZone(0));
    TEST_ASSERT_FALSE(zones.stopZone(MAX_ZONES + 1));
}

void test_stop_clears_any_running_flag() {
    zones.startZone(1, 60);
    TEST_ASSERT_TRUE(zones.isAnyZoneRunning());
    zones.stopZone(1);
    TEST_ASSERT_FALSE(zones.isAnyZoneRunning());
}

// ---------------------------------------------------------------------------
// stopAll
// ---------------------------------------------------------------------------

void test_stop_all_clears_all_zones() {
    zones.startZone(1, 10);
    zones.startZone(3, 20);
    zones.startZone(5, 30);
    TEST_ASSERT_TRUE(zones.stopAll());
    for (uint8_t i = 1; i <= MAX_ZONES; i++) {
        TEST_ASSERT_EQUAL(ZoneStatus::IDLE, zones.getZone(i)->status);
        TEST_ASSERT_EQUAL(0, zones.getZone(i)->runtimeSeconds);
    }
    TEST_ASSERT_FALSE(zones.isAnyZoneRunning());
}

void test_stop_all_on_idle_controller_is_safe() {
    TEST_ASSERT_TRUE(zones.stopAll());
}

// ---------------------------------------------------------------------------
// setZoneName
// ---------------------------------------------------------------------------

void test_set_zone_name() {
    zones.setZoneName(1, "Front Lawn");
    TEST_ASSERT_EQUAL_STRING("Front Lawn", zones.getZone(1)->name);
}

void test_set_zone_name_invalid_id_is_safe() {
    zones.setZoneName(0, "Should not crash");
    zones.setZoneName(MAX_ZONES + 1, "Should not crash");
}

void test_set_zone_name_truncates_long_name() {
    // Zone name buffer is 32 bytes including null terminator
    zones.setZoneName(1, "This name is way too long and should be truncated by strlcpy");
    TEST_ASSERT_LESS_OR_EQUAL(31, strlen(zones.getZone(1)->name));
}

// ---------------------------------------------------------------------------
// getZone
// ---------------------------------------------------------------------------

void test_get_zone_invalid_id_returns_null() {
    TEST_ASSERT_NULL(zones.getZone(0));
    TEST_ASSERT_NULL(zones.getZone(MAX_ZONES + 1));
}

// ---------------------------------------------------------------------------
// tick — timer expiry
// ---------------------------------------------------------------------------

void test_tick_does_not_affect_idle_zones() {
    // Idle zones should never change status from a tick
    zones.tick();
    unsigned long start = millis();
    while (millis() - start < 1100) {}
    zones.tick();
    for (uint8_t i = 1; i <= MAX_ZONES; i++) {
        TEST_ASSERT_EQUAL(ZoneStatus::IDLE, zones.getZone(i)->status);
    }
}

void test_tick_expires_zone() {
    zones.startZone(1, 1); // 1 second duration
    zones.tick(); // seed _lastTickMs
    unsigned long start = millis();
    while (millis() - start < 1500) {} // wait 1.5 seconds
    zones.tick();
    TEST_ASSERT_EQUAL(ZoneStatus::IDLE, zones.getZone(1)->status);
    TEST_ASSERT_EQUAL(0, zones.getZone(1)->runtimeSeconds);
}

void test_tick_only_expires_correct_zone() {
    zones.startZone(1, 1);  // expires after 1s
    zones.startZone(2, 60); // should survive
    zones.tick(); // seed _lastTickMs
    unsigned long start = millis();
    while (millis() - start < 1500) {}
    zones.tick();
    TEST_ASSERT_EQUAL(ZoneStatus::IDLE,    zones.getZone(1)->status);
    TEST_ASSERT_EQUAL(ZoneStatus::RUNNING, zones.getZone(2)->status);
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

int main(int argc, char** argv) {
    UNITY_BEGIN();

    RUN_TEST(test_all_zones_idle_on_init);
    RUN_TEST(test_zone_ids_are_correct_on_init);
    RUN_TEST(test_no_zones_running_on_init);

    RUN_TEST(test_start_valid_zone);
    RUN_TEST(test_start_zone_sets_any_running);
    RUN_TEST(test_start_invalid_zone_id_zero);
    RUN_TEST(test_start_invalid_zone_id_too_high);
    RUN_TEST(test_start_multiple_zones);

    RUN_TEST(test_stop_running_zone);
    RUN_TEST(test_stop_idle_zone_is_safe);
    RUN_TEST(test_stop_invalid_zone_id);
    RUN_TEST(test_stop_clears_any_running_flag);

    RUN_TEST(test_stop_all_clears_all_zones);
    RUN_TEST(test_stop_all_on_idle_controller_is_safe);

    RUN_TEST(test_set_zone_name);
    RUN_TEST(test_set_zone_name_invalid_id_is_safe);
    RUN_TEST(test_set_zone_name_truncates_long_name);

    RUN_TEST(test_get_zone_invalid_id_returns_null);

    RUN_TEST(test_tick_does_not_affect_idle_zones);
    RUN_TEST(test_tick_expires_zone);
    RUN_TEST(test_tick_only_expires_correct_zone);

    return UNITY_END();
}
