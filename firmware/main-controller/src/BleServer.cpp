#include "BleServer.h"
#include "version.h"
#include <ArduinoJson.h>

// Command characteristic write handler
class ZoneCmdCallback : public NimBLECharacteristicCallbacks {
public:
  ZoneCmdCallback(ZoneController& zones) : _zones(zones) {}

  void onWrite(NimBLECharacteristic* chr, NimBLEConnInfo& info) override {
    std::string val = chr->getValue();
    if (val.empty()) return;

    // Expected JSON: {"cmd":"start","zone":1,"duration":60}
    //                {"cmd":"stop","zone":1}
    //                {"cmd":"stop-all"}
    JsonDocument doc;
    if (deserializeJson(doc, val.c_str()) != DeserializationError::Ok) {
      Serial.println("[BLE] Invalid JSON command");
      return;
    }

    const char* cmd = doc["cmd"] | "";
    if (strcmp(cmd, "start") == 0) {
      uint8_t zone = doc["zone"] | 0;
      uint32_t duration = doc["duration"] | 60;
      _zones.startZone(zone, duration);
    } else if (strcmp(cmd, "stop") == 0) {
      uint8_t zone = doc["zone"] | 0;
      _zones.stopZone(zone);
    } else if (strcmp(cmd, "stop-all") == 0) {
      _zones.stopAll();
    } else {
      Serial.printf("[BLE] Unknown command: %s\n", cmd);
    }
  }

private:
  ZoneController& _zones;
};

BleServer::BleServer(ZoneController& zones)
  : _zones(zones), _statusChar(nullptr), _zoneDataChar(nullptr) {}

void BleServer::begin() {
  NimBLEDevice::init("Azul-Controller");
  NimBLEDevice::setPower(ESP_PWR_LVL_P9);

  NimBLEServer* server = NimBLEDevice::createServer();
  NimBLEService* service = server->createService(AZUL_BLE_SERVICE_UUID);

  // Status characteristic — read + notify
  _statusChar = service->createCharacteristic(
    AZUL_BLE_CHAR_STATUS_UUID,
    NIMBLE_PROPERTY::READ | NIMBLE_PROPERTY::NOTIFY
  );
  _statusChar->setValue(buildStatusJson().c_str());

  // Zone command characteristic — write only
  NimBLECharacteristic* cmdChar = service->createCharacteristic(
    AZUL_BLE_CHAR_ZONE_CMD_UUID,
    NIMBLE_PROPERTY::WRITE
  );
  cmdChar->setCallbacks(new ZoneCmdCallback(_zones));

  // Zone data characteristic — read only
  _zoneDataChar = service->createCharacteristic(
    AZUL_BLE_CHAR_ZONE_DATA_UUID,
    NIMBLE_PROPERTY::READ
  );
  _zoneDataChar->setValue(buildZoneDataJson().c_str());

  service->start();

  NimBLEAdvertising* adv = NimBLEDevice::getAdvertising();
  adv->addServiceUUID(AZUL_BLE_SERVICE_UUID);
  adv->start();

  Serial.println("[BLE] Server started, advertising as 'Azul-Controller'");
}

bool BleServer::isConnected() const {
  return NimBLEDevice::getServer()->getConnectedCount() > 0;
}

void BleServer::notifyStatus() {
  if (!_statusChar) return;
  String json = buildStatusJson();
  _statusChar->setValue(json.c_str());
  _statusChar->notify();

  if (_zoneDataChar) {
    _zoneDataChar->setValue(buildZoneDataJson().c_str());
  }
}

String BleServer::buildStatusJson() const {
  JsonDocument doc;
  doc["firmware"] = FW_VERSION_FULL;
  doc["uptime"] = millis() / 1000;
  doc["zones_running"] = _zones.isAnyZoneRunning();
  String out;
  serializeJson(doc, out);
  return out;
}

String BleServer::buildZoneDataJson() const {
  JsonDocument doc;
  JsonArray arr = doc.to<JsonArray>();
  for (uint8_t i = 0; i < _zones.getZoneCount(); i++) {
    const Zone* z = _zones.getZone(i + 1);
    JsonObject obj = arr.add<JsonObject>();
    obj["id"] = z->id;
    obj["name"] = z->name;
    obj["status"] = (z->status == ZoneStatus::RUNNING) ? "running" : "idle";
    obj["runtime"] = z->runtimeSeconds;
  }
  String out;
  serializeJson(doc, out);
  return out;
}
