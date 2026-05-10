#pragma once
#include <Arduino.h>
#include <functional>
#include "ZoneController.h"
#include "AuditLog.h"

#define ZONE_QUEUE_DEPTH 16

struct QueueEntry {
    uint8_t  zoneId;
    uint16_t durationSeconds;
    uint8_t  source; // AuditSource
};

// All zone start requests go through the queue — both manual and scheduled.
// The processor drains one entry at a time, starting the next when the
// current zone goes idle.
//
// stop-all clears the queue and stops the running zone.
// stop <id> removes the zone from the queue if pending, or stops it if running.

class ZoneQueue {
public:
    ZoneQueue(ZoneController& zones, AuditLog& audit);

    // Enqueue a zone start request. Returns false if queue is full.
    bool enqueue(uint8_t zoneId, uint16_t durationSeconds,
                 AuditSource source = AuditSource::MANUAL_REST);

    // Remove a specific zone from the queue (or stop it if running).
    // Returns true if the zone was found and removed/stopped.
    bool cancel(uint8_t zoneId);

    // Clear queue and stop running zone.
    void cancelAll();

    // Call from main loop — starts next queued zone when current finishes.
    void tick();

    // Optional callback: called when a zone transitions from queued → running.
    std::function<void(uint8_t, uint16_t, uint8_t)> onZoneStart;

    // Optional callback: called when a running zone stops (timer expired or cancelled).
    std::function<void()> onZoneStop;

    uint8_t count() const { return _count; }
    bool    isEmpty() const { return _count == 0; }

    // Fill buf with up to maxCount pending entries (not including running).
    // Returns number filled.
    uint8_t getPending(QueueEntry* buf, uint8_t maxCount) const;

private:
    ZoneController& _zones;
    AuditLog&       _audit;

    QueueEntry _queue[ZONE_QUEUE_DEPTH];
    uint8_t    _head;        // next to dequeue
    uint8_t    _tail;        // next to enqueue
    uint8_t    _count;
    bool       _wasRunning = false;

    bool dequeue(QueueEntry& out);
};
