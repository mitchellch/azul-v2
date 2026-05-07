#pragma once
#include "ScheduleModel.h"

class ChangeLog {
public:
    void begin();
    void append(const char* uuid, ChangeOp op, uint32_t ts = 0);
    uint8_t getRecent(ChangeEntry* buf, uint8_t maxCount) const;

private:
    ChangeEntry _ring[CHANGELOG_RING_SIZE];
    uint8_t     _head;
    uint8_t     _count;

    void loadFromNvs();
    void persistToNvs();
};
