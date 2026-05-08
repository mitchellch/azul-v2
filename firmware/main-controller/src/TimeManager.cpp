#include "TimeManager.h"
#include "Logger.h"
#include <Preferences.h>
#include <esp_sntp.h>
#include <ArduinoJson.h>

void TimeManager::begin() {
    loadFromNvs();
    applyTz();
    configTime(_tzOffset + _dstOffset, 0, "pool.ntp.org", "time.nist.gov");
    Logger::log("[Time] NTP sync started (tz=%s offset=%ds)", _tzName, _tzOffset + _dstOffset);
}

bool TimeManager::isSynced() const {
    if (_everSynced) return true;
    if (now() > 1577836800L) { // Jan 1 2020 UTC
        _everSynced = true;
        return true;
    }
    return false;
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
    if (t < 1000000000L) return 0;
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
    _tzManual  = true;
    strlcpy(_tzName, "", sizeof(_tzName)); // clear name — manually set offsets have no IANA name

    Preferences prefs;
    prefs.begin("aztime", false);
    prefs.putInt("tz_offset", _tzOffset);
    prefs.putInt("tz_dst",    _dstOffset);
    prefs.putString("tz_name", "");
    prefs.putBool("tz_manual", true);
    prefs.end();

    applyTz();
}


void TimeManager::formatOffset(char* buf) const {
    int32_t total = _tzOffset + _dstOffset;
    int h = abs(total) / 3600;
    int m = abs(total % 3600) / 60;
    snprintf(buf, 7, "%+03d:%02d", total < 0 ? -h : h, m);
    // Ensure sign is present
    if (total >= 0) buf[0] = '+';
}

void TimeManager::setTzName(const char* name) {
    strlcpy(_tzName, name, sizeof(_tzName));
    Preferences prefs;
    prefs.begin("aztime", false);
    prefs.putString("tz_name", _tzName);
    prefs.end();
}

bool TimeManager::parseOffset(const char* str, int32_t& outSeconds) {
    if (!str || (str[0] != '+' && str[0] != '-')) return false;
    int h = 0, m = 0;
    // Accept +HH:MM or +HH or +H
    if (sscanf(str + 1, "%d:%d", &h, &m) < 1) return false;
    outSeconds = (h * 3600 + m * 60) * (str[0] == '-' ? -1 : 1);
    return true;
}

uint32_t TimeManager::isoDateToDays(const char* iso) {
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
    _tzManual  = prefs.getBool("tz_manual", false);
    String name = prefs.getString("tz_name", "UTC");
    strlcpy(_tzName, name.c_str(), sizeof(_tzName));
    prefs.end();
}

void TimeManager::applyTz() {
    configTime(_tzOffset + _dstOffset, 0, "pool.ntp.org", "time.nist.gov");
}
