#pragma once
#include <ESPAsyncWebServer.h>
#include <AsyncJson.h>
#include "ZoneController.h"
#include "Scheduler.h"
#include "AuditLog.h"
#include "ChangeLog.h"
#include "TimeManager.h"
#include "NvsDump.h"
#include "ZoneQueue.h"
#include "MqttManager.h"

class RestServer {
public:
  RestServer(ZoneController& zones, Scheduler& scheduler,
             AuditLog& audit, ChangeLog& changelog, TimeManager& time,
             ZoneQueue& queue, MqttManager& mqtt);
  void begin();

private:
  AsyncWebServer  _server;
  ZoneController& _zones;
  Scheduler&      _scheduler;
  AuditLog&       _audit;
  ChangeLog&      _changelog;
  TimeManager&    _time;
  ZoneQueue&      _queue;
  MqttManager&    _mqtt;

  void registerRoutes();

  // Zones
  void handleGetStatus(AsyncWebServerRequest* req);
  void handleGetZones(AsyncWebServerRequest* req);
  void handleGetZone(AsyncWebServerRequest* req);
  void handleStartZone(AsyncWebServerRequest* req, JsonVariant& body);
  void handleStopZone(AsyncWebServerRequest* req);
  void handleStopAll(AsyncWebServerRequest* req);
  void handleUpdateZone(AsyncWebServerRequest* req, JsonVariant& body);

  // Schedules
  void handleGetSchedules(AsyncWebServerRequest* req);
  void handleGetActiveSchedule(AsyncWebServerRequest* req);
  void handleGetSchedule(AsyncWebServerRequest* req);
  void handleCreateSchedule(AsyncWebServerRequest* req, JsonVariant& body);
  void handleUpdateSchedule(AsyncWebServerRequest* req, JsonVariant& body);
  void handleDeleteSchedule(AsyncWebServerRequest* req);
  void handleActivateSchedule(AsyncWebServerRequest* req);

  // Logs
  void handleGetLog(AsyncWebServerRequest* req);
  void handleGetChangeLog(AsyncWebServerRequest* req);

  // MQTT config
  void handleSetMqttConfig(AsyncWebServerRequest* req, JsonVariant& body);

  // Time
  void handleGetTime(AsyncWebServerRequest* req);
  void handleSetTime(AsyncWebServerRequest* req, JsonVariant& body);
  void handleGetNvsDump(AsyncWebServerRequest* req);

  // Helpers
  void scheduleToJson(const Schedule& s, JsonObject& obj) const;
  bool jsonToSchedule(const JsonVariant& body, Schedule& s, char* errOut) const;
};
