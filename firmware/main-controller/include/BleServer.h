#pragma once
#include <NimBLEDevice.h>
#include "ZoneController.h"

// Service UUID
#define AZUL_BLE_SERVICE_UUID        "12345678-1234-1234-1234-1234567890ab"

// Characteristic UUIDs
#define AZUL_BLE_CHAR_STATUS_UUID    "12345678-1234-1234-1234-1234567890b1"  // READ/NOTIFY
#define AZUL_BLE_CHAR_ZONE_CMD_UUID  "12345678-1234-1234-1234-1234567890b2"  // WRITE
#define AZUL_BLE_CHAR_ZONE_DATA_UUID "12345678-1234-1234-1234-1234567890b3"  // READ

class BleServer {
public:
  BleServer(ZoneController& zones);
  void begin();
  bool isConnected() const;

  // Call periodically to push status notifications to connected client
  void notifyStatus();

private:
  ZoneController& _zones;
  NimBLECharacteristic* _statusChar;
  NimBLECharacteristic* _zoneDataChar;

  String buildStatusJson() const;
  String buildZoneDataJson() const;
};
