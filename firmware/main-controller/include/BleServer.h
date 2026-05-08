#pragma once
#include <NimBLEDevice.h>
#include "ZoneController.h"
#include "AuditLog.h"
#include "ZoneQueue.h"

#define AZUL_BLE_SERVICE_UUID        "12345678-1234-1234-1234-1234567890ab"
#define AZUL_BLE_CHAR_STATUS_UUID    "12345678-1234-1234-1234-1234567890b1"
#define AZUL_BLE_CHAR_ZONE_CMD_UUID  "12345678-1234-1234-1234-1234567890b2"
#define AZUL_BLE_CHAR_ZONE_DATA_UUID "12345678-1234-1234-1234-1234567890b3"

class BleServer {
public:
  BleServer(ZoneController& zones, AuditLog& audit, ZoneQueue& queue);
  void begin();
  bool isConnected() const;
  void notifyStatus();

private:
  ZoneController& _zones;
  AuditLog&       _audit;
  ZoneQueue&      _queue;
  NimBLECharacteristic* _statusChar;
  NimBLECharacteristic* _zoneDataChar;

  String buildStatusJson() const;
  String buildZoneDataJson() const;
};
