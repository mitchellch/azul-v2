#pragma once
#include "ScheduleModel.h"
#include "ScheduleStore.h"
#include "AuditLog.h"
#include "ChangeLog.h"
#include "ZoneController.h"
#include "TimeManager.h"

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
              ScheduleStore& store, AuditLog& audit, ChangeLog& changelog);

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
    TimeManager&   _time;
    ZoneController& _zones;
    ScheduleStore& _store;
    AuditLog&      _audit;
    ChangeLog&     _changelog;

    Schedule _active;
    bool     _activeLoaded;
    bool     _usingKeepalive;

    struct QueuedRun {
        uint8_t  zoneId;
        uint16_t durationSec;
        bool     pending;
    };
    QueuedRun _runQueue[2];

    // De-duplication: track last fired run
    int  _lastFiredDay;
    int  _lastFiredHour;
    int  _lastFiredMin;

    void loadActiveSchedule();
    void checkAndFireRuns(const struct tm& now);
    void processQueue();
    bool runsToday(const ScheduleRun& r, const struct tm& now) const;
    bool wouldOverlap(const Schedule& candidate) const;
    void buildKeepalive(Schedule& out) const;
    void enqueueRun(uint8_t zoneId, uint16_t durationSec, AuditSource source);
};
