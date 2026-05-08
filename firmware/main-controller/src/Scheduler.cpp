#include "Scheduler.h"
#include "Logger.h"

// Keepalive: all zones, 5 min each at 06:00 every day
static void buildKeepaliveSchedule(Schedule& s) {
    memset(&s, 0, sizeof(s));
    strlcpy(s.uuid, KEEPALIVE_UUID, sizeof(s.uuid));
    strlcpy(s.name, "Keepalive", sizeof(s.name));
    s.startDate = 0;
    s.endDate   = 0xFFFFFFFF;
    s.runCount  = MAX_ZONES;
    for (uint8_t i = 0; i < MAX_ZONES; i++) {
        s.runs[i].zoneId          = i + 1;
        s.runs[i].dayMask         = DAY_ALL;
        s.runs[i].hour            = 6;
        s.runs[i].minute          = 0;
        s.runs[i].durationSeconds = 300; // 5 minutes
    }
}

Scheduler::Scheduler(TimeManager& time, ZoneController& zones,
                     ScheduleStore& store, AuditLog& audit, ChangeLog& changelog)
    : _time(time), _zones(zones), _store(store), _audit(audit), _changelog(changelog),
      _activeLoaded(false), _usingKeepalive(false),
      _lastFiredDay(-1), _lastFiredHour(-1), _lastFiredMin(-1)
{
    memset(_runQueue, 0, sizeof(_runQueue));
}

void Scheduler::begin() {
    loadActiveSchedule();
}

void Scheduler::loadActiveSchedule() {
    char activeUuid[37] = {0};
    _store.getActiveUuid(activeUuid);

    if (activeUuid[0] != '\0') {
        if (_store.getByUuid(activeUuid, _active)) {
            _activeLoaded   = true;
            _usingKeepalive = false;
            Logger::log("[Scheduler] Loaded schedule: %s", _active.name);
            return;
        }
        // UUID stored but schedule missing — data loss, fall back to keepalive
        Logger::log("[Scheduler] Active schedule missing — using keepalive as fallback");
        buildKeepaliveSchedule(_active);
        _activeLoaded   = true;
        _usingKeepalive = true;
        return;
    }

    // No active schedule set — idle, no watering
    _activeLoaded   = false;
    _usingKeepalive = false;
    Logger::log("[Scheduler] No schedule configured");
}

void Scheduler::tick() {
    if (!_activeLoaded) return;
    if (!_time.isSynced()) return;

    struct tm now;
    if (!_time.getLocalTime(now)) return;

    processQueue();
    checkAndFireRuns(now);
}

void Scheduler::checkAndFireRuns(const struct tm& now) {
    uint32_t today = _time.todayAsDaysSinceEpoch();

    // Only fire if within schedule date range
    if (today < _active.startDate || today > _active.endDate) return;

    for (uint8_t i = 0; i < _active.runCount; i++) {
        const ScheduleRun& r = _active.runs[i];
        if (!runsToday(r, now)) continue;
        if (r.hour != (uint8_t)now.tm_hour) continue;
        if (r.minute != (uint8_t)now.tm_min) continue;

        // Dedup: don't fire same run twice in the same minute
        if (now.tm_yday  == _lastFiredDay &&
            now.tm_hour  == _lastFiredHour &&
            now.tm_min   == _lastFiredMin) continue;

        _lastFiredDay  = now.tm_yday;
        _lastFiredHour = now.tm_hour;
        _lastFiredMin  = now.tm_min;

        enqueueRun(r.zoneId, r.durationSeconds, AuditSource::SCHEDULER);
    }
}

void Scheduler::processQueue() {
    if (_zones.isAnyZoneRunning()) return;

    for (uint8_t i = 0; i < 2; i++) {
        if (_runQueue[i].pending) {
            _runQueue[i].pending = false;
            _zones.startZone(_runQueue[i].zoneId, _runQueue[i].durationSec);
            _audit.append(_runQueue[i].zoneId, _runQueue[i].durationSec,
                          AuditSource::SCHEDULER);
            Logger::log("[Scheduler] Started zone %d for %ds",
                        _runQueue[i].zoneId, _runQueue[i].durationSec);
            return; // one at a time
        }
    }
}

void Scheduler::enqueueRun(uint8_t zoneId, uint16_t durationSec, AuditSource source) {
    for (uint8_t i = 0; i < 2; i++) {
        if (!_runQueue[i].pending) {
            _runQueue[i] = {zoneId, durationSec, true};
            return;
        }
    }
    Logger::log("[Scheduler] Queue full — dropping zone %d run", zoneId);
}

bool Scheduler::runsToday(const ScheduleRun& r, const struct tm& now) const {
    return (r.dayMask & (1 << now.tm_wday)) != 0;
}

bool Scheduler::wouldOverlap(const Schedule& candidate) const {
    Schedule all[SCHEDULE_RING_SIZE];
    uint8_t count = 0;
    _store.getAll(all, count);

    for (uint8_t i = 0; i < count; i++) {
        if (strcmp(all[i].uuid, candidate.uuid) == 0) continue;
        if (!(candidate.endDate < all[i].startDate ||
              candidate.startDate > all[i].endDate)) {
            return true;
        }
    }
    return false;
}

ValidationResult Scheduler::createSchedule(Schedule& s) {
    ScheduleStore::generateUuid(s.uuid);

    if (wouldOverlap(s)) {
        ValidationResult r;
        r.ok = false;
        snprintf(r.message, sizeof(r.message), "Date range overlaps existing schedule");
        return r;
    }

    _store.save(s);
    _changelog.append(s.uuid, ChangeOp::CREATE);
    return {true, ""};
}

ValidationResult Scheduler::updateSchedule(const Schedule& s) {
    Schedule existing;
    if (!_store.getByUuid(s.uuid, existing)) {
        return {false, "Schedule not found", 404};
    }

    if (wouldOverlap(s)) {
        return {false, "Date range overlaps existing schedule"};
    }

    _store.update(s);
    _changelog.append(s.uuid, ChangeOp::UPDATE);

    // Reload active if we just updated it
    char activeUuid[37] = {0};
    _store.getActiveUuid(activeUuid);
    if (strcmp(activeUuid, s.uuid) == 0) {
        _active = s;
    }

    return {true, ""};
}

ValidationResult Scheduler::deleteSchedule(const char* uuid) {
    char activeUuid[37] = {0};
    _store.getActiveUuid(activeUuid);
    if (strcmp(activeUuid, uuid) == 0) {
        // Deactivate before deleting
        deactivate();
    }

    if (!_store.remove(uuid)) {
        return {false, "Schedule not found", 404};
    }

    _changelog.append(uuid, ChangeOp::DELETED);
    return {true, ""};
}

ValidationResult Scheduler::activateSchedule(const char* uuid) {
    Schedule s;
    if (!_store.getByUuid(uuid, s)) {
        return {false, "Schedule not found", 404};
    }

    _store.setActiveUuid(uuid);
    _active         = s;
    _activeLoaded   = true;
    _usingKeepalive = false;
    _lastFiredDay   = -1; // reset dedup so new schedule fires correctly
    _lastFiredHour  = -1;
    _lastFiredMin   = -1;

    _changelog.append(uuid, ChangeOp::ACTIVATE);
    Logger::log("[Scheduler] Activated schedule: %s", s.name);
    return {true, ""};
}

const Schedule* Scheduler::getActiveSchedule() const {
    if (_activeLoaded) return &_active;
    return nullptr;
}

bool Scheduler::isKeepaliveActive() const {
    return _usingKeepalive;
}

bool Scheduler::getSchedule(const char* uuid, Schedule& out) const {
    return _store.getByUuid(uuid, out);
}

bool Scheduler::getAllSchedules(Schedule* out, uint8_t& count) const {
    return _store.getAll(out, count);
}

void Scheduler::deactivate() {
    _store.setActiveUuid("");
    _activeLoaded   = false;
    _usingKeepalive = false;
}

bool Scheduler::isTimeSynced() const {
    return _time.isSynced();
}
