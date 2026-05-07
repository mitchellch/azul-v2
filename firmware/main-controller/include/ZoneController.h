#pragma once
#ifdef UNIT_TEST
#include "arduino_stub.h"
#else
#include <Arduino.h>
#endif

#define MAX_ZONES 8

enum class ZoneStatus { IDLE, RUNNING, ERROR };

struct Zone {
  uint8_t id;
  char name[32];
  ZoneStatus status;
  uint32_t runtimeSeconds;   // remaining seconds if running
};

class ZoneController {
public:
  ZoneController();

  bool startZone(uint8_t zoneId, uint32_t durationSeconds);
  bool stopZone(uint8_t zoneId);
  bool stopAll();

  const Zone* getZone(uint8_t zoneId) const;
  const Zone* getZones() const { return _zones; }
  uint8_t getZoneCount() const { return MAX_ZONES; }

  void setZoneName(uint8_t zoneId, const char* name);

  // Called from main loop to decrement running timers
  void tick();

  bool isAnyZoneRunning() const;

private:
  Zone _zones[MAX_ZONES];
  unsigned long _lastTickMs;
};
