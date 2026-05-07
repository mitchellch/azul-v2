#pragma once
#include "ScheduleModel.h"

class AuditLog {
public:
    void begin();
    void append(uint8_t zoneId, uint16_t durationSec,
                AuditSource source = AuditSource::SCHEDULER,
                uint32_t ts = 0); // ts=0 means use current time

    uint16_t getRecent(AuditEntry* buf, uint16_t maxCount) const;
    void flush();

    // Format: "YYMMDDHHmm:zone:duration"
    static void formatEntry(const AuditEntry& e, char* out, size_t outLen);

private:
    AuditEntry _ring[AUDIT_RING_SIZE];
    uint16_t   _head;
    uint16_t   _count;
    uint8_t    _dirtyCount;
    static constexpr uint8_t FLUSH_THRESHOLD = 8;

    void loadFromNvs();
    void persistToNvs();
};
