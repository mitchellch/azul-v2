#include "ZoneController.h"

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
  Serial.printf("[ZoneController] Zone %d started for %lu seconds\n", zoneId, durationSeconds);
  return true;
}

bool ZoneController::stopZone(uint8_t zoneId) {
  if (zoneId < 1 || zoneId > MAX_ZONES) return false;
  Zone& z = _zones[zoneId - 1];
  z.status = ZoneStatus::IDLE;
  z.runtimeSeconds = 0;
  Serial.printf("[ZoneController] Zone %d stopped\n", zoneId);
  return true;
}

bool ZoneController::stopAll() {
  for (uint8_t i = 0; i < MAX_ZONES; i++) {
    _zones[i].status = ZoneStatus::IDLE;
    _zones[i].runtimeSeconds = 0;
  }
  Serial.println("[ZoneController] All zones stopped");
  return true;
}

const Zone* ZoneController::getZone(uint8_t zoneId) const {
  if (zoneId < 1 || zoneId > MAX_ZONES) return nullptr;
  return &_zones[zoneId - 1];
}

void ZoneController::setZoneName(uint8_t zoneId, const char* name) {
  if (zoneId < 1 || zoneId > MAX_ZONES) return;
  strlcpy(_zones[zoneId - 1].name, name, sizeof(_zones[zoneId - 1].name));
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
        Serial.printf("[ZoneController] Zone %d timer expired\n", _zones[i].id);
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
