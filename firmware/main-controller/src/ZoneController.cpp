#include "ZoneController.h"
#ifndef UNIT_TEST
#include "Logger.h"
#include <Preferences.h>
static const char* NVS_NS = "zones";
#endif

ZoneController::ZoneController() : _lastTickMs(0) {
  for (uint8_t i = 0; i < MAX_ZONES; i++) {
    _zones[i].id = i + 1;
    snprintf(_zones[i].name, sizeof(_zones[i].name), "Zone %d", i + 1);
    _zones[i].status = ZoneStatus::IDLE;
    _zones[i].runtimeSeconds = 0;
  }
}

bool ZoneController::startZone(uint8_t zoneId, uint32_t durationSeconds) {
  if (zoneId < 1 || zoneId > MAX_ZONES) return false;
  Zone& z = _zones[zoneId - 1];
  z.status = ZoneStatus::RUNNING;
  z.runtimeSeconds = durationSeconds;
  return true;
}

bool ZoneController::stopZone(uint8_t zoneId) {
  if (zoneId < 1 || zoneId > MAX_ZONES) return false;
  Zone& z = _zones[zoneId - 1];
  z.status = ZoneStatus::IDLE;
  z.runtimeSeconds = 0;
  return true;
}

bool ZoneController::stopAll() {
  for (uint8_t i = 0; i < MAX_ZONES; i++) {
    _zones[i].status = ZoneStatus::IDLE;
    _zones[i].runtimeSeconds = 0;
  }
  return true;
}

const Zone* ZoneController::getZone(uint8_t zoneId) const {
  if (zoneId < 1 || zoneId > MAX_ZONES) return nullptr;
  return &_zones[zoneId - 1];
}

void ZoneController::begin() {
#ifndef UNIT_TEST
  Preferences prefs;
  prefs.begin(NVS_NS, true);
  char key[4];
  for (uint8_t i = 0; i < MAX_ZONES; i++) {
    snprintf(key, sizeof(key), "z%d", i + 1);
    String stored = prefs.getString(key, "");
    if (stored.length() > 0) {
      strlcpy(_zones[i].name, stored.c_str(), sizeof(_zones[i].name));
    }
  }
  prefs.end();
#endif
}

void ZoneController::setZoneName(uint8_t zoneId, const char* name) {
  if (zoneId < 1 || zoneId > MAX_ZONES) return;
  strlcpy(_zones[zoneId - 1].name, name, sizeof(_zones[zoneId - 1].name));
#ifndef UNIT_TEST
  Preferences prefs;
  prefs.begin(NVS_NS, false);
  char key[4];
  snprintf(key, sizeof(key), "z%d", zoneId);
  prefs.putString(key, name);
  prefs.end();
#endif
}

void ZoneController::tick() {
  unsigned long now = millis();
  if (_lastTickMs == 0) { _lastTickMs = now; return; }

  uint32_t elapsed = (now - _lastTickMs) / 1000;
  if (elapsed == 0) return;
  _lastTickMs = now;

  for (uint8_t i = 0; i < MAX_ZONES; i++) {
    if (_zones[i].status == ZoneStatus::RUNNING) {
      if (_zones[i].runtimeSeconds <= elapsed) {
        _zones[i].runtimeSeconds = 0;
        _zones[i].status = ZoneStatus::IDLE;
#ifndef UNIT_TEST
        Logger::log("[Zone %d] Timer expired", _zones[i].id);
#endif
      } else {
        _zones[i].runtimeSeconds -= elapsed;
      }
    }
  }
}

bool ZoneController::isAnyZoneRunning() const {
  for (uint8_t i = 0; i < MAX_ZONES; i++) {
    if (_zones[i].status == ZoneStatus::RUNNING) return true;
  }
  return false;
}
