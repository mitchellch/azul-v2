#include "RestServer.h"
#include "version.h"
#include <ArduinoJson.h>
#include <WiFi.h>

RestServer::RestServer(ZoneController& zones)
  : _server(80), _zones(zones) {}

void RestServer::begin() {
  registerRoutes();
  _server.begin();
  Serial.println("[REST] Server started on port 80");
}

void RestServer::registerRoutes() {
  // CORS preflight
  _server.onNotFound([](AsyncWebServerRequest* req) {
    if (req->method() == HTTP_OPTIONS) {
      AsyncWebServerResponse* res = req->beginResponse(204);
      res->addHeader("Access-Control-Allow-Origin", "*");
      res->addHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
      res->addHeader("Access-Control-Allow-Headers", "Content-Type");
      req->send(res);
    } else {
      req->send(404, "application/json", "{\"error\":\"Not found\"}");
    }
  });

  _server.on("/api/status", HTTP_GET, [this](AsyncWebServerRequest* req) {
    handleGetStatus(req);
  });

  // Specific routes before generic ones to ensure correct matching
  _server.on("/api/zones/stop-all", HTTP_POST, [this](AsyncWebServerRequest* req) {
    handleStopAll(req);
  });

  _server.on("^/api/zones/([0-9]+)/stop$", HTTP_POST, [this](AsyncWebServerRequest* req) {
    handleStopZone(req);
  });

  _server.on("^/api/zones/([0-9]+)$", HTTP_GET, [this](AsyncWebServerRequest* req) {
    handleGetZone(req);
  });

  _server.on("/api/zones", HTTP_GET, [this](AsyncWebServerRequest* req) {
    handleGetZones(req);
  });

  // Body-receiving routes
  auto* startHandler = new AsyncCallbackJsonWebHandler(
    "^/api/zones/([0-9]+)/start$",
    [this](AsyncWebServerRequest* req, JsonVariant& body) {
      handleStartZone(req, body);
    }
  );
  _server.addHandler(startHandler);

  auto* updateHandler = new AsyncCallbackJsonWebHandler(
    "^/api/zones/([0-9]+)$",
    [this](AsyncWebServerRequest* req, JsonVariant& body) {
      handleUpdateZone(req, body);
    }
  );
  updateHandler->setMethod(HTTP_PUT);
  _server.addHandler(updateHandler);
}

static void addCors(AsyncWebServerResponse* res) {
  res->addHeader("Access-Control-Allow-Origin", "*");
}

void RestServer::handleGetStatus(AsyncWebServerRequest* req) {
  JsonDocument doc;
  doc["device"] = "Azul Main Controller";
  doc["firmware"] = fwVersionFull().c_str();
  doc["ip"] = WiFi.localIP().toString();
  doc["uptime_seconds"] = millis() / 1000;
  doc["zones_running"] = _zones.isAnyZoneRunning();

  String out;
  serializeJson(doc, out);
  auto* res = req->beginResponse(200, "application/json", out);
  addCors(res);
  req->send(res);
}

void RestServer::handleGetZones(AsyncWebServerRequest* req) {
  JsonDocument doc;
  JsonArray arr = doc.to<JsonArray>();

  for (uint8_t i = 0; i < _zones.getZoneCount(); i++) {
    const Zone* z = _zones.getZone(i + 1);
    JsonObject obj = arr.add<JsonObject>();
    obj["id"] = z->id;
    obj["name"] = z->name;
    obj["status"] = (z->status == ZoneStatus::RUNNING) ? "running" : "idle";
    obj["runtime_seconds"] = z->runtimeSeconds;
  }

  String out;
  serializeJson(doc, out);
  auto* res = req->beginResponse(200, "application/json", out);
  addCors(res);
  req->send(res);
}

void RestServer::handleGetZone(AsyncWebServerRequest* req) {
  uint8_t id = atoi(req->pathArg(0).c_str());
  const Zone* z = _zones.getZone(id);
  if (!z) { req->send(404, "application/json", "{\"error\":\"Zone not found\"}"); return; }

  JsonDocument doc;
  doc["id"] = z->id;
  doc["name"] = z->name;
  doc["status"] = (z->status == ZoneStatus::RUNNING) ? "running" : "idle";
  doc["runtime_seconds"] = z->runtimeSeconds;

  String out;
  serializeJson(doc, out);
  auto* res = req->beginResponse(200, "application/json", out);
  addCors(res);
  req->send(res);
}

void RestServer::handleStartZone(AsyncWebServerRequest* req, JsonVariant& body) {
  uint8_t id = atoi(req->pathArg(0).c_str());
  uint32_t duration = body["duration"] | 60;

  if (_zones.startZone(id, duration)) {
    req->send(200, "application/json", "{\"ok\":true}");
  } else {
    req->send(404, "application/json", "{\"error\":\"Zone not found\"}");
  }
}

void RestServer::handleStopZone(AsyncWebServerRequest* req) {
  uint8_t id = atoi(req->pathArg(0).c_str());
  if (_zones.stopZone(id)) {
    req->send(200, "application/json", "{\"ok\":true}");
  } else {
    req->send(404, "application/json", "{\"error\":\"Zone not found\"}");
  }
}

void RestServer::handleStopAll(AsyncWebServerRequest* req) {
  _zones.stopAll();
  req->send(200, "application/json", "{\"ok\":true}");
}

void RestServer::handleUpdateZone(AsyncWebServerRequest* req, JsonVariant& body) {
  uint8_t id = atoi(req->pathArg(0).c_str());
  if (!body["name"].is<const char*>()) {
    req->send(400, "application/json", "{\"error\":\"name required\"}");
    return;
  }
  _zones.setZoneName(id, body["name"].as<const char*>());
  req->send(200, "application/json", "{\"ok\":true}");
}
