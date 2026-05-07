#include "AuditLog.h"
#include <Preferences.h>
#include <time.h>

static const char* NVS_NS       = "audit";
static const char* KEY_HEAD     = "head";
static const char* KEY_COUNT    = "count";
static const char* KEY_ENTRIES  = "entries";

void AuditLog::begin() {
    _head       = 0;
    _count      = 0;
    _dirtyCount = 0;
    memset(_ring, 0, sizeof(_ring));
    loadFromNvs();
}

void AuditLog::append(uint8_t zoneId, uint16_t durationSec,
                      AuditSource source, uint32_t ts) {
    if (ts == 0) {
        time_t t;
        ::time(&t);
        ts = (t > 1000000000L) ? (uint32_t)t : 0;
    }

    AuditEntry& e = _ring[_head % AUDIT_RING_SIZE];
    e.timestamp       = ts;
    e.zoneId          = zoneId;
    e.source          = (uint8_t)source;
    e.durationSeconds = durationSec;

    _head = (_head + 1) % AUDIT_RING_SIZE;
    if (_count < AUDIT_RING_SIZE) _count++;

    _dirtyCount++;
    if (_dirtyCount >= FLUSH_THRESHOLD) {
        flush();
    }
}

uint16_t AuditLog::getRecent(AuditEntry* buf, uint16_t maxCount) const {
    uint16_t n = min(maxCount, _count);
    for (uint16_t i = 0; i < n; i++) {
        // Walk backwards from head
        int16_t idx = ((int16_t)_head - 1 - i + AUDIT_RING_SIZE) % AUDIT_RING_SIZE;
        buf[i] = _ring[idx];
    }
    return n;
}

void AuditLog::flush() {
    if (_dirtyCount == 0) return;
    persistToNvs();
    _dirtyCount = 0;
}

void AuditLog::formatEntry(const AuditEntry& e, char* out, size_t outLen) {
    time_t t = (time_t)e.timestamp;
    struct tm tm;
    gmtime_r(&t, &tm);
    snprintf(out, outLen, "%02d%02d%02d%02d%02d:%d:%d",
             tm.tm_year % 100, tm.tm_mon + 1, tm.tm_mday,
             tm.tm_hour, tm.tm_min,
             e.zoneId, e.durationSeconds);
}

void AuditLog::loadFromNvs() {
    Preferences prefs;
    prefs.begin(NVS_NS, true);
    _head  = prefs.getUShort(KEY_HEAD,  0);
    _count = prefs.getUShort(KEY_COUNT, 0);
    if (_count > 0) {
        prefs.getBytes(KEY_ENTRIES, _ring, sizeof(_ring));
    }
    prefs.end();
}

void AuditLog::persistToNvs() {
    Preferences prefs;
    prefs.begin(NVS_NS, false);
    prefs.putUShort(KEY_HEAD,  _head);
    prefs.putUShort(KEY_COUNT, _count);
    prefs.putBytes(KEY_ENTRIES, _ring, sizeof(_ring));
    prefs.end();
}
