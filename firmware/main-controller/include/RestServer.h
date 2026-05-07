#pragma once
#include <ESPAsyncWebServer.h>
#include "ZoneController.h"

class RestServer {
public:
  RestServer(ZoneController& zones);
  void begin();

private:
  AsyncWebServer _server;
  ZoneController& _zones;

  void registerRoutes();

  // GET /api/status
  void handleGetStatus(AsyncWebServerRequest* req);
  // GET /api/zones
  void handleGetZones(AsyncWebServerRequest* req);
  // GET /api/zones/:id
  void handleGetZone(AsyncWebServerRequest* req);
  // POST /api/zones/:id/start  body: {"duration":60}
  void handleStartZone(AsyncWebServerRequest* req, JsonVariant& body);
  // POST /api/zones/:id/stop
  void handleStopZone(AsyncWebServerRequest* req);
  // POST /api/zones/stop-all
  void handleStopAll(AsyncWebServerRequest* req);
  // PUT /api/zones/:id  body: {"name":"Front Lawn"}
  void handleUpdateZone(AsyncWebServerRequest* req, JsonVariant& body);
};
