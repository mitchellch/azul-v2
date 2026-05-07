#pragma once
#include <Arduino.h>
#include <time.h>

class TimeManager {
public:
    void begin();
    bool isSynced() const;
    bool getLocalTime(struct tm& out) const;
    time_t now() const;

    void setTzOffset(int32_t utcOffsetSec, int32_t dstSec);
    int32_t getTzOffset() const  { return _tzOffset; }
    int32_t getDstOffset() const { return _dstOffset; }

    // Returns days since Unix epoch for today (local time)
    uint32_t todayAsDaysSinceEpoch() const;

    // Convert ISO date string "YYYY-MM-DD" to days since epoch; returns 0 on error
    static uint32_t isoDateToDays(const char* iso);

    // Convert days since epoch to ISO date string "YYYY-MM-DD" (buf must be ≥11)
    static void daysToIsoDate(uint32_t days, char* buf);

private:
    int32_t _tzOffset  = 0;
    int32_t _dstOffset = 0;

    void loadFromNvs();
    void applyTz();
};
