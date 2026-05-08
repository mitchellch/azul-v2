#include "ScheduleStore.h"
#include "Logger.h"
#include <Preferences.h>
#include <esp_random.h>

static const char* NVS_NS   = "sched";
static const char* KEY_HEAD  = "head";
static const char* KEY_VER   = "ver";
static const char* KEY_ACTIVE = "active";
static const char* SLOT_KEYS[SCHEDULE_RING_SIZE] = {"s0","s1","s2","s3","s4"};

void ScheduleStore::begin() {
    memset(_valid, 0, sizeof(_valid));
    _head = 0;
    _version = 0;
    loadAll();
}

void ScheduleStore::loadAll() {
    Preferences prefs;
    prefs.begin(NVS_NS, false);
    _head    = prefs.getUChar(KEY_HEAD, 0);
    _version = prefs.getUChar(KEY_VER,  0);

    for (uint8_t i = 0; i < SCHEDULE_RING_SIZE; i++) {
        size_t len = prefs.getBytesLength(SLOT_KEYS[i]);
        if (len == sizeof(Schedule)) {
            prefs.getBytes(SLOT_KEYS[i], &_cache[i], sizeof(Schedule));
            _valid[i] = (_cache[i].uuid[0] != '\0');
        } else {
            _valid[i] = false;
        }
    }
    prefs.end();
}

void ScheduleStore::persistMeta() {
    Preferences prefs;
    prefs.begin(NVS_NS, false);
    prefs.putUChar(KEY_HEAD, _head);
    prefs.putUChar(KEY_VER,  _version);
    prefs.end();
}

void ScheduleStore::persistSlot(uint8_t slot) {
    Preferences prefs;
    prefs.begin(NVS_NS, false);
    prefs.putBytes(SLOT_KEYS[slot], &_cache[slot], sizeof(Schedule));
    prefs.end();
}

int ScheduleStore::slotForUuid(const char* uuid) const {
    for (uint8_t i = 0; i < SCHEDULE_RING_SIZE; i++) {
        if (_valid[i] && strcmp(_cache[i].uuid, uuid) == 0) return i;
    }
    return -1;
}

int ScheduleStore::nextFreeSlot() const {
    for (uint8_t i = 0; i < SCHEDULE_RING_SIZE; i++) {
        if (!_valid[i]) return i;
    }
    // Ring full — evict the oldest (head + 1 wraps around)
    return (_head + 1) % SCHEDULE_RING_SIZE;
}

bool ScheduleStore::save(const Schedule& s) {
    int slot = nextFreeSlot();
    _cache[slot] = s;
    _valid[slot] = true;
    _head = slot;
    _version++;
    persistSlot(slot);
    persistMeta();
    return true;
}

bool ScheduleStore::remove(const char* uuid) {
    int slot = slotForUuid(uuid);
    if (slot < 0) return false;
    memset(&_cache[slot], 0, sizeof(Schedule));
    _valid[slot] = false;
    _version++;
    persistSlot(slot);
    persistMeta();
    return true;
}

bool ScheduleStore::update(const Schedule& s) {
    int slot = slotForUuid(s.uuid);
    if (slot < 0) return false;
    _cache[slot] = s;
    _version++;
    persistSlot(slot);
    persistMeta();
    return true;
}

bool ScheduleStore::getAll(Schedule* out, uint8_t& count) const {
    count = 0;
    for (uint8_t i = 0; i < SCHEDULE_RING_SIZE; i++) {
        if (_valid[i]) out[count++] = _cache[i];
    }
    return true;
}

bool ScheduleStore::getByUuid(const char* uuid, Schedule& out) const {
    int slot = slotForUuid(uuid);
    if (slot < 0) return false;
    out = _cache[slot];
    return true;
}

bool ScheduleStore::setActiveUuid(const char* uuid) {
    Preferences prefs;
    prefs.begin(NVS_NS, false);
    prefs.putString(KEY_ACTIVE, uuid);
    prefs.end();
    return true;
}

bool ScheduleStore::getActiveUuid(char* out37) const {
    Preferences prefs;
    prefs.begin(NVS_NS, false);
    String s = prefs.getString(KEY_ACTIVE, "");
    prefs.end();
    strlcpy(out37, s.c_str(), 37);
    return out37[0] != '\0';
}

void ScheduleStore::generateUuid(char* buf) {
    uint32_t r[4];
    r[0] = esp_random();
    r[1] = esp_random();
    r[2] = esp_random();
    r[3] = esp_random();

    // Set version 4 and variant bits
    r[1] = (r[1] & 0xFFFF0FFF) | 0x00004000; // version 4
    r[2] = (r[2] & 0x3FFFFFFF) | 0x80000000; // variant 10

    snprintf(buf, 37,
        "%08x-%04x-%04x-%04x-%04x%08x",
        r[0],
        (r[1] >> 16) & 0xFFFF,
        r[1] & 0xFFFF,
        (r[2] >> 16) & 0xFFFF,
        r[2] & 0xFFFF,
        r[3]);
}
