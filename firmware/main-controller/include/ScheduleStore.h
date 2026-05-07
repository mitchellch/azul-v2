#pragma once
#include "ScheduleModel.h"

class ScheduleStore {
public:
    void begin();

    bool save(const Schedule& s);
    bool remove(const char* uuid);
    bool update(const Schedule& s);

    bool getAll(Schedule* out, uint8_t& count) const;
    bool getByUuid(const char* uuid, Schedule& out) const;

    bool setActiveUuid(const char* uuid);
    bool getActiveUuid(char* out37) const;

    uint8_t getVersion() const { return _version; }

    // Generate a new RFC 4122 v4 UUID into buf (must be ≥37 bytes)
    static void generateUuid(char* buf);

private:
    Schedule _cache[SCHEDULE_RING_SIZE];
    bool     _valid[SCHEDULE_RING_SIZE];
    uint8_t  _head;
    uint8_t  _version;

    void loadAll();
    void persistMeta();
    int  slotForUuid(const char* uuid) const;
    int  nextFreeSlot() const;
    void persistSlot(uint8_t slot);
};
