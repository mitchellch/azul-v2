#include "TimeManager.h"
#include <Preferences.h>
#include <esp_sntp.h>

void TimeManager::begin() {
    loadFromNvs();
    applyTz();
    configTime(_tzOffset + _dstOffset, 0, "pool.ntp.org", "time.nist.gov");
    Serial.println("[Time] NTP sync started");
}

bool TimeManager::isSynced() const {
    return sntp_get_sync_status() == SNTP_SYNC_STATUS_COMPLETED;
}

bool TimeManager::getLocalTime(struct tm& out) const {
    time_t t = now();
    if (t == 0) return false;
    localtime_r(&t, &out);
    return true;
}

time_t TimeManager::now() const {
    time_t t;
    ::time(&t);
    if (t < 1000000000L) return 0; // not synced yet
    return t;
}

uint32_t TimeManager::todayAsDaysSinceEpoch() const {
    time_t t = now();
    if (t == 0) return 0;
    return (uint32_t)(t / 86400);
}

void TimeManager::setTzOffset(int32_t utcOffsetSec, int32_t dstSec) {
    _tzOffset  = utcOffsetSec;
    _dstOffset = dstSec;

    Preferences prefs;
    prefs.begin("aztime", false);
    prefs.putInt("tz_offset", _tzOffset);
    prefs.putInt("tz_dst",    _dstOffset);
    prefs.end();

    applyTz();
}

uint32_t TimeManager::isoDateToDays(const char* iso) {
    // Parse "YYYY-MM-DD"
    if (!iso || strlen(iso) < 10) return 0;
    struct tm t = {};
    t.tm_year = (atoi(iso) - 1900);
    t.tm_mon  = (atoi(iso + 5) - 1);
    t.tm_mday = atoi(iso + 8);
    t.tm_isdst = -1;
    time_t epoch = mktime(&t);
    if (epoch < 0) return 0;
    return (uint32_t)(epoch / 86400);
}

void TimeManager::daysToIsoDate(uint32_t days, char* buf) {
    time_t t = (time_t)days * 86400;
    struct tm tm;
    gmtime_r(&t, &tm);
    snprintf(buf, 11, "%04d-%02d-%02d",
             tm.tm_year + 1900, tm.tm_mon + 1, tm.tm_mday);
}

void TimeManager::loadFromNvs() {
    Preferences prefs;
    prefs.begin("aztime", false);
    _tzOffset  = prefs.getInt("tz_offset", 0);
    _dstOffset = prefs.getInt("tz_dst",    0);
    prefs.end();
}

void TimeManager::applyTz() {
    // configTime takes gmtOffset_sec, daylightOffset_sec
    configTime(_tzOffset, _dstOffset, "pool.ntp.org", "time.nist.gov");
}
