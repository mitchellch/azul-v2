#include "BleServer.h"
#include "version.h"
#include "Logger.h"
#include <ArduinoJson.h>

// Command characteristic write handler
class ZoneCmdCallback : public NimBLECharacteristicCallbacks {
public:
  ZoneCmdCallback(ZoneController& zones) : _zones(zones) {}

  void onWrite(NimBLECharacteristic* chr) override {
    std::string val = chr->getValue();
    if (val.empty()) return;

    // Expected JSON: {"cmd":"start","zone":1,"duration":60}
    //                {"cmd":"stop","zone":1}
    //                {"cmd":"stop-all"}
    JsonDocument doc;
    if (deserializeJson(doc, val.c_str()) != DeserializationError::Ok) {
      Logger::log("[BLE] Invalid JSON command");
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
      Logger::log("[BLE] Unknown command: %s", cmd);
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
  String statusJson = buildStatusJson();
  _statusChar->setValue((uint8_t*)statusJson.c_str(), statusJson.length());
  _statusChar->createDescriptor("2901")->setValue("Status");

  // Zone command characteristic — write only
  NimBLECharacteristic* cmdChar = service->createCharacteristic(
    AZUL_BLE_CHAR_ZONE_CMD_UUID,
    NIMBLE_PROPERTY::WRITE
  );
  cmdChar->setCallbacks(new ZoneCmdCallback(_zones));
  cmdChar->createDescriptor("2901")->setValue("Zone Command");

  // Zone data characteristic — read only
  _zoneDataChar = service->createCharacteristic(
    AZUL_BLE_CHAR_ZONE_DATA_UUID,
    NIMBLE_PROPERTY::READ
  );
  String zoneJson = buildZoneDataJson();
  _zoneDataChar->setValue((uint8_t*)zoneJson.c_str(), zoneJson.length());
  _zoneDataChar->createDescriptor("2901")->setValue("Zone Data");

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
  _statusChar->setValue((uint8_t*)json.c_str(), json.length());
  _statusChar->notify();

  if (_zoneDataChar) {
    String zoneJson = buildZoneDataJson();
    _zoneDataChar->setValue((uint8_t*)zoneJson.c_str(), zoneJson.length());
  }
}

String BleServer::buildStatusJson() const {
  JsonDocument doc;
  float tempC = temperatureRead();
  doc["firmware"] = fwVersionFull().c_str();
  doc["build"] = FW_BUILD_DATE " " FW_BUILD_TIME;
  doc["uptime"] = millis() / 1000;
  doc["temperature_c"] = tempC;
  doc["temperature_f"] = tempC * 9.0f / 5.0f + 32.0f;
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
