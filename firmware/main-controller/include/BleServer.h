#pragma once
#include <NimBLEDevice.h>
#include <ArduinoJson.h>
#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>
#include <functional>
#include "ZoneController.h"
#include "Scheduler.h"
#include "AuditLog.h"
#include "TimeManager.h"
#include "ClaimManager.h"
#include "ZoneQueue.h"

#define AZUL_BLE_SERVICE_UUID        "12345678-1234-1234-1234-1234567890ab"
#define AZUL_BLE_CHAR_STATUS_UUID    "12345678-1234-1234-1234-1234567890b1"
#define AZUL_BLE_CHAR_CMD_UUID       "12345678-1234-1234-1234-1234567890b2"
#define AZUL_BLE_CHAR_ZONE_DATA_UUID "12345678-1234-1234-1234-1234567890b3"
#define AZUL_BLE_CHAR_RESPONSE_UUID  "12345678-1234-1234-1234-1234567890b4"
#define AZUL_BLE_CHAR_PIN_UUID       "12345678-1234-1234-1234-1234567890b5"

#define BLE_CHUNK_SIZE   180
#define BLE_CMD_MAX_LEN  2048  // max reassembled command bytes

struct BleCommand {
    char payload[BLE_CMD_MAX_LEN];
    uint16_t len;
};

class BleServer {
public:
  BleServer(ZoneController& zones, AuditLog& audit, ZoneQueue& queue,
            Scheduler& scheduler, ClaimManager& claimMgr, TimeManager& time);
  void begin();
  bool isConnected() const;
  void notifyStatus();

  // Called from loop() — drains the command queue and processes on Arduino task
  void tick();

  // Called by BleCommandCallback from NimBLE task — only enqueues, never notifies
  void enqueueCommand(const char* data, uint16_t len);

  // Optional callback: fired after any BLE schedule mutation so MQTT can re-publish immediately
  std::function<void()> onScheduleChanged;

private:
  ZoneController& _zones;
  AuditLog&       _audit;
  ZoneQueue&      _queue;
  Scheduler&      _scheduler;
  ClaimManager&   _claimMgr;
  TimeManager&    _time;

  NimBLECharacteristic* _statusChar    = nullptr;
  NimBLECharacteristic* _zoneDataChar  = nullptr;
  NimBLECharacteristic* _responseChar  = nullptr;
  NimBLECharacteristic* _pinChar       = nullptr;
  QueueHandle_t         _cmdQueue      = nullptr;

  // Write accumulation buffer — fixed, lives in BSS (not NimBLE task stack)
  char     _writeAccum[BLE_CMD_MAX_LEN];
  uint16_t _writeAccumLen = 0;

  void dispatch(const char* id, const char* cmd,
                const JsonVariant& data, const char* authToken);

  // Command handlers — each serializes its response into `out`
  void handleGetDeviceInfo(const char* id);
  void handleClaim        (const char* id, const JsonVariant& data);
  void handleUnclaim      (const char* id, const char* authToken);
  void handleGetStatus    (const char* id);
  void handleGetTime      (const char* id);
  void handleSetTime      (const char* id, const JsonVariant& data);
  void handleGetZones     (const char* id);
  void handleUpdateZone   (const char* id, const JsonVariant& data);
  void handleStartZone    (const char* id, const JsonVariant& data);
  void handleStopZone     (const char* id, const JsonVariant& data);
  void handleStopAll      (const char* id);
  void handleGetSchedules (const char* id);
  void handleGetSchedule  (const char* id, const JsonVariant& data);
  void handleGetActiveSchedule(const char* id);
  void handleCreateSchedule(const char* id, const JsonVariant& data);
  void handleUpdateSchedule(const char* id, const JsonVariant& data);
  void handleDeleteSchedule(const char* id, const JsonVariant& data);
  void handleActivateSchedule  (const char* id, const JsonVariant& data);
  void handleDeactivateSchedule(const char* id);
  void handleGetLog       (const char* id, const JsonVariant& data);
  void handleSetWifi      (const char* id, const JsonVariant& data);

  void pushZoneData(); // immediately notify b3 after zone mutations

  // Response helpers
  void sendOk     (const char* id);
  void sendError  (const char* id, const char* msg);
  void sendPayload(const char* id, const String& dataJson);
  void sendChunked(const char* id, const String& payload);

  // Shared serializers (mirrors RestServer helpers)
  void   scheduleToJson(const Schedule& s, JsonObject& obj) const;
  bool   jsonToSchedule(const JsonVariant& body, Schedule& s, char* errOut) const;

  String buildStatusJson()   const;
  String buildZoneDataJson() const;
};
