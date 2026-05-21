#include "ZoneQueue.h"
#include "Logger.h"

ZoneQueue::ZoneQueue(ZoneController& zones, AuditLog& audit)
    : _zones(zones), _audit(audit), _head(0), _tail(0), _count(0) {
    memset(_queue, 0, sizeof(_queue));
}

bool ZoneQueue::enqueue(uint8_t zoneId, uint16_t durationSeconds, AuditSource source) {
    if (zoneId < 1 || zoneId > MAX_ZONES) return false;
    if (_count >= ZONE_QUEUE_DEPTH) {
        Logger::log("[Queue] Full — zone %d request dropped", zoneId);
        return false;
    }
    _queue[_tail] = {zoneId, durationSeconds, (uint8_t)source};
    _tail = (_tail + 1) % ZONE_QUEUE_DEPTH;
    _count++;
    return true;
}

bool ZoneQueue::dequeue(QueueEntry& out) {
    if (_count == 0) return false;
    out = _queue[_head];
    _head = (_head + 1) % ZONE_QUEUE_DEPTH;
    _count--;
    return true;
}

bool ZoneQueue::cancel(uint8_t zoneId) {
    // If the zone is currently running, stop it (next tick will start the next entry)
    const Zone* z = _zones.getZone(zoneId);
    if (z && z->status == ZoneStatus::RUNNING) {
        _zones.stopZone(zoneId);
        if (onZoneStop) onZoneStop(zoneId);
        Logger::log("[Queue] Stopped running zone %d", zoneId);
        return true;
    }

    // Search the queue for a pending entry and remove it
    for (uint8_t i = 0; i < _count; i++) {
        uint8_t idx = (_head + i) % ZONE_QUEUE_DEPTH;
        if (_queue[idx].zoneId == zoneId) {
            // Shift remaining entries down
            for (uint8_t j = i; j < _count - 1; j++) {
                uint8_t cur  = (_head + j)     % ZONE_QUEUE_DEPTH;
                uint8_t next = (_head + j + 1) % ZONE_QUEUE_DEPTH;
                _queue[cur] = _queue[next];
            }
            _tail = (_tail - 1 + ZONE_QUEUE_DEPTH) % ZONE_QUEUE_DEPTH;
            _count--;
            Logger::log("[Queue] Cancelled pending zone %d", zoneId);
            return true;
        }
    }
    return false;
}

void ZoneQueue::cancelAll() {
    // Fire stop event for any running zone before clearing
    for (uint8_t i = 1; i <= MAX_ZONES; i++) {
        const Zone* z = _zones.getZone(i);
        if (z && z->status == ZoneStatus::RUNNING) {
            if (onZoneStop) onZoneStop(i);
        }
    }
    _zones.stopAll();
    _head  = 0;
    _tail  = 0;
    _count = 0;
    Logger::log("[Queue] Cleared");
}

void ZoneQueue::tick() {
    bool running = _zones.isAnyZoneRunning();

    // Detect zone completion — was running last tick, now idle
    if (!running && _wasRunning) {
        if (onZoneStop) onZoneStop(_lastRunningZone);
    }
    _wasRunning = running;
    if (running) {
        // Track which zone is running so we can report it on stop
        for (uint8_t i = 0; i < MAX_ZONES; i++) {
            if (_zones.getZone(i + 1)->status == ZoneStatus::RUNNING) {
                _lastRunningZone = i + 1;
                break;
            }
        }
        return;
    }

    // Dequeue and start the next entry
    QueueEntry entry;
    if (dequeue(entry)) {
        _zones.startZone(entry.zoneId, entry.durationSeconds, entry.source);
        _audit.append(entry.zoneId, entry.durationSeconds, (AuditSource)entry.source);
        Logger::log("[Queue] Starting zone %d (%ds) — %d remaining",
                    entry.zoneId, entry.durationSeconds, _count);
        if (onZoneStart) onZoneStart(entry.zoneId, entry.durationSeconds, entry.source);
    }
}

uint8_t ZoneQueue::getPending(QueueEntry* buf, uint8_t maxCount) const {
    uint8_t n = min(maxCount, _count);
    for (uint8_t i = 0; i < n; i++) {
        buf[i] = _queue[(_head + i) % ZONE_QUEUE_DEPTH];
    }
    return n;
}
