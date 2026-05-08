#pragma once
#include <Arduino.h>
#include <time.h>

class TimeManager {
public:
    void begin();
    bool isSynced() const;
    bool getLocalTime(struct tm& out) const;
    time_t now() const;

    // Timezone management
    void setTzOffset(int32_t utcOffsetSec, int32_t dstSec);
    int32_t getTzOffset() const  { return _tzOffset; }
    int32_t getDstOffset() const { return _dstOffset; }
    const char* getTzName() const { return _tzName; }

    // Set timezone name independently (called after setTzOffset when client provides it)
    void setTzName(const char* name);

    // True if timezone was set manually via tz-set command or mobile app
    bool isTzManual() const { return _tzManual; }

    // Format current offset as "+HH:MM" or "-HH:MM" (buf must be ≥7)
    void formatOffset(char* buf) const;

    // Parse offset string "+HH:MM" or "-HH:MM" into seconds.
    // Returns true on success.
    static bool parseOffset(const char* str, int32_t& outSeconds);

    // Returns days since Unix epoch for today (local time)
    uint32_t todayAsDaysSinceEpoch() const;

    // Convert ISO date string "YYYY-MM-DD" to days since epoch; returns 0 on error
    static uint32_t isoDateToDays(const char* iso);

    // Convert days since epoch to ISO date string "YYYY-MM-DD" (buf must be ≥11)
    static void daysToIsoDate(uint32_t days, char* buf);

private:
    int32_t _tzOffset  = 0;
    int32_t _dstOffset = 0;
    char    _tzName[48] = "UTC";
    bool    _tzManual   = false;
    mutable bool _everSynced = false;

    void loadFromNvs();
    void applyTz();
};
