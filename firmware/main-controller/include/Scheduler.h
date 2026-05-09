#pragma once
#include "ScheduleModel.h"
#include "ScheduleStore.h"
#include "AuditLog.h"
#include "ChangeLog.h"
#include "ZoneController.h"
#include "TimeManager.h"
#include "ZoneQueue.h"

struct ValidationResult {
    bool ok;
    int  httpCode; // suggested HTTP status code when !ok (0 = default)
    char message[64];
    ValidationResult() : ok(false), httpCode(0) { message[0] = '\0'; }
    ValidationResult(bool o, const char* m, int code = 0) : ok(o), httpCode(code) {
        strlcpy(message, m, sizeof(message));
    }
};

class Scheduler {
public:
    Scheduler(TimeManager& time, ZoneController& zones,
              ScheduleStore& store, AuditLog& audit, ChangeLog& changelog,
              ZoneQueue& queue);

    void begin();
    void tick();

    // Schedule CRUD — return false with message on failure
    ValidationResult createSchedule(Schedule& s);   // generates UUID, saves
    ValidationResult updateSchedule(const Schedule& s);
    ValidationResult deleteSchedule(const char* uuid);
    ValidationResult activateSchedule(const char* uuid);
    void deactivate(); // clear active schedule (no watering)

    const Schedule* getActiveSchedule() const;
    bool isKeepaliveActive() const;
    bool getSchedule(const char* uuid, Schedule& out) const;
    bool getAllSchedules(Schedule* out, uint8_t& count) const;

    bool isTimeSynced() const;

private:
    TimeManager&    _time;
    ZoneController& _zones;
    ScheduleStore&  _store;
    AuditLog&       _audit;
    ChangeLog&      _changelog;
    ZoneQueue&      _queue;

    Schedule _active;
    bool     _activeLoaded;
    bool     _usingKeepalive;

    // De-duplication: bitmask of run indices fired today (reset at midnight)
    uint32_t _firedToday;   // bit i = run index i has been enqueued today
    int      _lastFiredDay; // day-of-year for midnight reset

    void loadActiveSchedule();
    void checkAndFireRuns(const struct tm& now);
    bool runsToday(const ScheduleRun& r, const struct tm& now, uint32_t today) const;
    bool wouldOverlap(const Schedule& candidate) const;
    void buildKeepalive(Schedule& out) const;
};
