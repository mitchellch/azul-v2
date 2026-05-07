#include "ChangeLog.h"
#include <Preferences.h>
#include <time.h>

static const char* NVS_NS      = "chglog";
static const char* KEY_HEAD    = "head";
static const char* KEY_COUNT   = "count";
static const char* KEY_ENTRIES = "entries";

void ChangeLog::begin() {
    _head  = 0;
    _count = 0;
    memset(_ring, 0, sizeof(_ring));
    loadFromNvs();
}

void ChangeLog::append(const char* uuid, ChangeOp op, uint32_t ts) {
    if (ts == 0) {
        time_t t;
        ::time(&t);
        ts = (t > 1000000000L) ? (uint32_t)t : 0;
    }

    ChangeEntry& e = _ring[_head % CHANGELOG_RING_SIZE];
    e.timestamp = ts;
    // Store first 8 hex chars of uuid (first 4 bytes of uuid string)
    strlcpy(e.uuid, uuid, sizeof(e.uuid));
    e.op = op;
    memset(e._pad, 0, sizeof(e._pad));

    _head = (_head + 1) % CHANGELOG_RING_SIZE;
    if (_count < CHANGELOG_RING_SIZE) _count++;

    persistToNvs();
}

uint8_t ChangeLog::getRecent(ChangeEntry* buf, uint8_t maxCount) const {
    uint8_t n = min(maxCount, _count);
    for (uint8_t i = 0; i < n; i++) {
        int8_t idx = ((int8_t)_head - 1 - i + CHANGELOG_RING_SIZE) % CHANGELOG_RING_SIZE;
        buf[i] = _ring[idx];
    }
    return n;
}

void ChangeLog::loadFromNvs() {
    Preferences prefs;
    prefs.begin(NVS_NS, true);
    _head  = prefs.getUChar(KEY_HEAD,  0);
    _count = prefs.getUChar(KEY_COUNT, 0);
    if (_count > 0) {
        prefs.getBytes(KEY_ENTRIES, _ring, sizeof(_ring));
    }
    prefs.end();
}

void ChangeLog::persistToNvs() {
    Preferences prefs;
    prefs.begin(NVS_NS, false);
    prefs.putUChar(KEY_HEAD,  _head);
    prefs.putUChar(KEY_COUNT, _count);
    prefs.putBytes(KEY_ENTRIES, _ring, sizeof(_ring));
    prefs.end();
}
