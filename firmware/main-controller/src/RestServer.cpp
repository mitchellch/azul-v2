#include "RestServer.h"
#include "version.h"
#include <ArduinoJson.h>
#include <WiFi.h>
#include <nvs.h>

RestServer::RestServer(ZoneController& zones, Scheduler& scheduler,
                       AuditLog& audit, ChangeLog& changelog, TimeManager& time)
  : _server(80), _zones(zones), _scheduler(scheduler),
    _audit(audit), _changelog(changelog), _time(time) {}

void RestServer::begin() {
  registerRoutes();
  _server.begin();
  Serial.println("[REST] Server started on port 80");
}

static void addCors(AsyncWebServerResponse* res) {
  res->addHeader("Access-Control-Allow-Origin", "*");
}

static void sendJson(AsyncWebServerRequest* req, int code, const String& body) {
  auto* res = req->beginResponse(code, "application/json", body);
  addCors(res);
  req->send(res);
}

void RestServer::registerRoutes() {
  _server.onNotFound([this](AsyncWebServerRequest* req) {
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

  // PUT /api/schedules/:id body handler — must use onBody at server level
  // because regex routes don't support per-route body callbacks
  _server.onRequestBody([this](AsyncWebServerRequest* req, uint8_t* data,
                                size_t len, size_t index, size_t total) {
    if (req->method() != HTTP_PUT) return;
    if (!req->url().startsWith("/api/schedules/")) return;
    if (req->url() == "/api/schedules/active") return;

    if (index == 0) req->_tempObject = new String();
    static_cast<String*>(req->_tempObject)->concat((char*)data, len);

    if (index + len == total) {
      JsonDocument doc;
      String* body = static_cast<String*>(req->_tempObject);
      if (deserializeJson(doc, *body) == DeserializationError::Ok) {
        JsonVariant v = doc.as<JsonVariant>();
        handleUpdateSchedule(req, v);
      } else {
        sendJson(req, 400, "{\"error\":\"Invalid JSON\"}");
      }
      delete body;
      req->_tempObject = nullptr;
    }
  });

  // ---- Status & Time ----
  _server.on("/api/status", HTTP_GET, [this](AsyncWebServerRequest* r) { handleGetStatus(r); });
  _server.on("/api/time",     HTTP_GET, [this](AsyncWebServerRequest* r) { handleGetTime(r); });
  _server.on("/api/nvs-dump", HTTP_GET, [this](AsyncWebServerRequest* r) { handleGetNvsDump(r); });

  auto* setTimeHandler = new AsyncCallbackJsonWebHandler("/api/time",
    [this](AsyncWebServerRequest* r, JsonVariant& b) { handleSetTime(r, b); });
  setTimeHandler->setMethod(HTTP_PUT);
  _server.addHandler(setTimeHandler);

  // ---- Zones ----
  _server.on("/api/zones/stop-all", HTTP_POST, [this](AsyncWebServerRequest* r) { handleStopAll(r); });
  _server.on("^/api/zones/([0-9]+)/stop$", HTTP_POST, [this](AsyncWebServerRequest* r) { handleStopZone(r); });
  _server.on("^/api/zones/([0-9]+)$",      HTTP_GET,  [this](AsyncWebServerRequest* r) { handleGetZone(r); });
  _server.on("/api/zones",                 HTTP_GET,  [this](AsyncWebServerRequest* r) { handleGetZones(r); });

  auto* startZoneHandler = new AsyncCallbackJsonWebHandler(
    "^/api/zones/([0-9]+)/start$",
    [this](AsyncWebServerRequest* r, JsonVariant& b) { handleStartZone(r, b); });
  _server.addHandler(startZoneHandler);

  auto* updateZoneHandler = new AsyncCallbackJsonWebHandler(
    "^/api/zones/([0-9]+)$",
    [this](AsyncWebServerRequest* r, JsonVariant& b) { handleUpdateZone(r, b); });
  updateZoneHandler->setMethod(HTTP_PUT);
  _server.addHandler(updateZoneHandler);

  // ---- Schedules ----
  // Specific literal routes before regex
  _server.on("/api/schedules/active",     HTTP_GET,
    [this](AsyncWebServerRequest* r) { handleGetActiveSchedule(r); });
  _server.on("/api/schedules/deactivate", HTTP_POST,
    [this](AsyncWebServerRequest* r) {
      _scheduler.deactivate();
      sendJson(r, 200, "{\"ok\":true}");
    });
  _server.on("^/api/schedules/([^/]+)/activate$", HTTP_POST,
    [this](AsyncWebServerRequest* r) { handleActivateSchedule(r); });
  _server.on("^/api/schedules/([^/]+)$", HTTP_GET,
    [this](AsyncWebServerRequest* r) { handleGetSchedule(r); });
  _server.on("^/api/schedules/([^/]+)$", HTTP_DELETE,
    [this](AsyncWebServerRequest* r) { handleDeleteSchedule(r); });
  _server.on("/api/schedules", HTTP_GET,
    [this](AsyncWebServerRequest* r) { handleGetSchedules(r); });

  auto* createSchedHandler = new AsyncCallbackJsonWebHandler("/api/schedules",
    [this](AsyncWebServerRequest* r, JsonVariant& b) {
      if (r->method() == HTTP_POST && r->url() == "/api/schedules") {
        handleCreateSchedule(r, b);
      } else if (r->method() == HTTP_PUT && r->url().startsWith("/api/schedules/")
                 && r->url() != "/api/schedules/active") {
        handleUpdateSchedule(r, b);
      } else {
        sendJson(r, 404, "{\"error\":\"Not found\"}");
      }
    });
  _server.addHandler(createSchedHandler);

  // PUT /api/schedules/:id handled via onRequestBody + onNotFound below

  // ---- Logs ----
  _server.on("/api/log", HTTP_GET, [this](AsyncWebServerRequest* r) {
    if (r->url() == "/api/log/changes") {
      handleGetChangeLog(r);
    } else {
      handleGetLog(r);
    }
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

void RestServer::scheduleToJson(const Schedule& s, JsonObject& obj) const {
  obj["uuid"] = s.uuid;
  obj["name"] = s.name;
  char dateBuf[11];
  TimeManager::daysToIsoDate(s.startDate, dateBuf);
  obj["start_date"] = dateBuf;
  if (s.endDate == 0xFFFFFFFF) {
    obj["end_date"] = nullptr;
  } else {
    TimeManager::daysToIsoDate(s.endDate, dateBuf);
    obj["end_date"] = dateBuf;
  }

  JsonArray runs = obj["runs"].to<JsonArray>();
  for (uint8_t i = 0; i < s.runCount; i++) {
    const ScheduleRun& r = s.runs[i];
    JsonObject ro = runs.add<JsonObject>();
    ro["zone_id"]          = r.zoneId;
    ro["day_mask"]         = r.dayMask;
    ro["hour"]             = r.hour;
    ro["minute"]           = r.minute;
    ro["duration_seconds"] = r.durationSeconds;
  }
}

bool RestServer::jsonToSchedule(const JsonVariant& body, Schedule& s, char* errOut) const {
  memset(&s, 0, sizeof(s));

  const char* name = body["name"] | "";
  if (strlen(name) == 0) { strcpy(errOut, "name required"); return false; }
  strlcpy(s.name, name, sizeof(s.name));

  const char* startStr = body["start_date"] | "";
  if (strlen(startStr) < 10) { strcpy(errOut, "start_date required (YYYY-MM-DD)"); return false; }
  s.startDate = TimeManager::isoDateToDays(startStr);

  const char* endStr = body["end_date"] | "";
  s.endDate = (strlen(endStr) >= 10) ? TimeManager::isoDateToDays(endStr) : 0xFFFFFFFF;

  if (s.endDate != 0xFFFFFFFF && s.endDate < s.startDate) {
    strcpy(errOut, "end_date must be >= start_date");
    return false;
  }

  JsonArrayConst runs = body["runs"];
  if (runs.isNull()) { strcpy(errOut, "runs array required"); return false; }

  s.runCount = 0;
  for (JsonObjectConst r : runs) {
    if (s.runCount >= MAX_RUNS_PER_SCHEDULE) { strcpy(errOut, "too many runs"); return false; }
    ScheduleRun& sr = s.runs[s.runCount++];
    sr.zoneId          = r["zone_id"]          | 0;
    sr.dayMask         = r["day_mask"]          | DAY_ALL;
    sr.hour            = r["hour"]              | 0;
    sr.minute          = r["minute"]            | 0;
    sr.durationSeconds = r["duration_seconds"]  | 300;
    if (sr.zoneId < 1 || sr.zoneId > MAX_ZONES) {
      snprintf(errOut, 64, "invalid zone_id: %d", sr.zoneId);
      return false;
    }
  }

  return true;
}

// ---------------------------------------------------------------------------
// Status / Time
// ---------------------------------------------------------------------------

void RestServer::handleGetStatus(AsyncWebServerRequest* req) {
  JsonDocument doc;
  float tempC = temperatureRead();
  doc["device"]         = "Azul Main Controller";
  doc["firmware"]       = fwVersionFull().c_str();
  doc["build"]          = FW_BUILD_DATE " " FW_BUILD_TIME;
  doc["ssid"]           = WiFi.SSID();
  doc["ip"]             = WiFi.localIP().toString();
  doc["mac"]            = WiFi.macAddress();
  doc["uptime_seconds"] = millis() / 1000;
  doc["temperature_c"]  = tempC;
  doc["temperature_f"]  = tempC * 9.0f / 5.0f + 32.0f;
  doc["zones_running"]  = _zones.isAnyZoneRunning();
  doc["ntp_synced"]     = _scheduler.isTimeSynced();
  doc["ram_free"]       = ESP.getFreeHeap();
  doc["ram_total"]      = ESP.getHeapSize();

  nvs_stats_t nvsStats;
  if (nvs_get_stats(NULL, &nvsStats) == ESP_OK) {
    doc["nvs_used"]  = nvsStats.used_entries;
    doc["nvs_free"]  = nvsStats.free_entries;
    doc["nvs_total"] = nvsStats.total_entries;
  }

  const Schedule* active = _scheduler.getActiveSchedule();
  if (active) {
    doc["active_schedule_uuid"] = active->uuid;
    doc["active_schedule_name"] = active->name;
    doc["keepalive_active"]     = _scheduler.isKeepaliveActive();
  }

  String out;
  serializeJson(doc, out);
  sendJson(req, 200, out);
}

void RestServer::handleGetTime(AsyncWebServerRequest* req) {
  JsonDocument doc;
  time_t t = _time.now();
  char tzOffsetStr[7];
  _time.formatOffset(tzOffsetStr);
  doc["epoch"]       = (uint32_t)t;
  doc["synced"]      = _time.isSynced();
  doc["tz_offset"]   = _time.getTzOffset();
  doc["tz_dst"]      = _time.getDstOffset();
  doc["tz_offset_str"] = tzOffsetStr;
  doc["tz_name"]     = _time.getTzName();
  doc["tz_manual"]   = _time.isTzManual();

  if (t > 0) {
    struct tm tm;
    gmtime_r(&t, &tm);
    char iso[25];
    strftime(iso, sizeof(iso), "%Y-%m-%dT%H:%M:%SZ", &tm);
    doc["iso"] = iso;
  }

  String out;
  serializeJson(doc, out);
  sendJson(req, 200, out);
}

void RestServer::handleGetNvsDump(AsyncWebServerRequest* req) {
  String json = NvsDump::toJson();
  auto* res = req->beginResponse(200, "application/json", json);
  addCors(res);
  req->send(res);
}

void RestServer::handleSetTime(AsyncWebServerRequest* req, JsonVariant& body) {
  int32_t tzOffset = body["tz_offset"] | 0;
  int32_t tzDst    = body["tz_dst"]    | 0;
  _time.setTzOffset(tzOffset, tzDst);
  // Optional timezone name from client (e.g. "America/Los_Angeles")
  if (body["tz_name"].is<const char*>()) {
    _time.setTzName(body["tz_name"].as<const char*>());
  }
  sendJson(req, 200, "{\"ok\":true}");
}

// ---------------------------------------------------------------------------
// Zones (unchanged logic, new helper)
// ---------------------------------------------------------------------------

void RestServer::handleGetZones(AsyncWebServerRequest* req) {
  JsonDocument doc;
  JsonArray arr = doc.to<JsonArray>();
  for (uint8_t i = 0; i < _zones.getZoneCount(); i++) {
    const Zone* z = _zones.getZone(i + 1);
    JsonObject obj = arr.add<JsonObject>();
    obj["id"]              = z->id;
    obj["name"]            = z->name;
    obj["status"]          = (z->status == ZoneStatus::RUNNING) ? "running" : "idle";
    obj["runtime_seconds"] = z->runtimeSeconds;
  }
  String out;
  serializeJson(doc, out);
  sendJson(req, 200, out);
}

void RestServer::handleGetZone(AsyncWebServerRequest* req) {
  uint8_t id = atoi(req->pathArg(0).c_str());
  const Zone* z = _zones.getZone(id);
  if (!z) { sendJson(req, 404, "{\"error\":\"Zone not found\"}"); return; }

  JsonDocument doc;
  doc["id"]              = z->id;
  doc["name"]            = z->name;
  doc["status"]          = (z->status == ZoneStatus::RUNNING) ? "running" : "idle";
  doc["runtime_seconds"] = z->runtimeSeconds;
  String out;
  serializeJson(doc, out);
  sendJson(req, 200, out);
}

void RestServer::handleStartZone(AsyncWebServerRequest* req, JsonVariant& body) {
  uint8_t id = atoi(req->pathArg(0).c_str());
  uint32_t duration = body["duration"] | 60;
  if (_zones.startZone(id, duration)) {
    _audit.append(id, (uint16_t)duration, AuditSource::MANUAL_REST);
    sendJson(req, 200, "{\"ok\":true}");
  } else {
    sendJson(req, 404, "{\"error\":\"Zone not found\"}");
  }
}

void RestServer::handleStopZone(AsyncWebServerRequest* req) {
  uint8_t id = atoi(req->pathArg(0).c_str());
  if (_zones.stopZone(id)) {
    sendJson(req, 200, "{\"ok\":true}");
  } else {
    sendJson(req, 404, "{\"error\":\"Zone not found\"}");
  }
}

void RestServer::handleStopAll(AsyncWebServerRequest* req) {
  _zones.stopAll();
  sendJson(req, 200, "{\"ok\":true}");
}

void RestServer::handleUpdateZone(AsyncWebServerRequest* req, JsonVariant& body) {
  uint8_t id = atoi(req->pathArg(0).c_str());
  if (!_zones.getZone(id)) { sendJson(req, 404, "{\"error\":\"Zone not found\"}"); return; }
  if (!body["name"].is<const char*>()) { sendJson(req, 400, "{\"error\":\"name required\"}"); return; }
  _zones.setZoneName(id, body["name"].as<const char*>());
  sendJson(req, 200, "{\"ok\":true}");
}

// ---------------------------------------------------------------------------
// Schedules
// ---------------------------------------------------------------------------

void RestServer::handleGetSchedules(AsyncWebServerRequest* req) {
  Schedule all[SCHEDULE_RING_SIZE];
  uint8_t count = 0;
  _scheduler.getAllSchedules(all, count);

  JsonDocument doc;
  JsonArray arr = doc.to<JsonArray>();
  for (uint8_t i = 0; i < count; i++) {
    JsonObject obj = arr.add<JsonObject>();
    scheduleToJson(all[i], obj);
  }
  String out;
  serializeJson(doc, out);
  sendJson(req, 200, out);
}

void RestServer::handleGetActiveSchedule(AsyncWebServerRequest* req) {
  const Schedule* s = _scheduler.getActiveSchedule();
  if (!s) { sendJson(req, 503, "{\"error\":\"No active schedule\"}"); return; }

  JsonDocument doc;
  JsonObject obj = doc.to<JsonObject>();
  scheduleToJson(*s, obj);
  obj["is_keepalive"] = _scheduler.isKeepaliveActive();
  String out;
  serializeJson(doc, out);
  sendJson(req, 200, out);
}

void RestServer::handleGetSchedule(AsyncWebServerRequest* req) {
  String uuid = req->pathArg(0);
  Schedule s;
  if (!_scheduler.getSchedule(uuid.c_str(), s)) {
    sendJson(req, 404, "{\"error\":\"Schedule not found\"}");
    return;
  }
  JsonDocument doc;
  JsonObject obj = doc.to<JsonObject>();
  scheduleToJson(s, obj);
  String out;
  serializeJson(doc, out);
  sendJson(req, 200, out);
}

void RestServer::handleCreateSchedule(AsyncWebServerRequest* req, JsonVariant& body) {
  Schedule s;
  char errMsg[64] = {0};
  if (!jsonToSchedule(body, s, errMsg)) {
    String e = "{\"error\":\""; e += errMsg; e += "\"}";
    sendJson(req, 400, e);
    return;
  }

  auto result = _scheduler.createSchedule(s);
  if (!result.ok) {
    String e = "{\"error\":\""; e += result.message; e += "\"}";
    sendJson(req, 409, e);
    return;
  }

  String resp = "{\"ok\":true,\"uuid\":\""; resp += s.uuid; resp += "\"}";
  sendJson(req, 201, resp);
}

void RestServer::handleUpdateSchedule(AsyncWebServerRequest* req, JsonVariant& body) {
  // AsyncCallbackJsonWebHandler doesn't populate pathArg — extract UUID from URL
  String uuid = req->url().substring(15); // strip "/api/schedules/" (15 chars)
  Schedule s;
  char errMsg[64] = {0};
  if (!jsonToSchedule(body, s, errMsg)) {
    String e = "{\"error\":\""; e += errMsg; e += "\"}";
    sendJson(req, 400, e);
    return;
  }
  strlcpy(s.uuid, uuid.c_str(), sizeof(s.uuid));

  auto result = _scheduler.updateSchedule(s);
  if (!result.ok) {
    String e = "{\"error\":\""; e += result.message; e += "\"}";
    sendJson(req, result.httpCode ? result.httpCode : 409, e);
    return;
  }
  sendJson(req, 200, "{\"ok\":true}");
}

void RestServer::handleDeleteSchedule(AsyncWebServerRequest* req) {
  String uuid = req->pathArg(0);
  auto result = _scheduler.deleteSchedule(uuid.c_str());
  if (!result.ok) {
    String e = "{\"error\":\""; e += result.message; e += "\"}";
    sendJson(req, result.httpCode ? result.httpCode : 409, e);
    return;
  }
  sendJson(req, 200, "{\"ok\":true}");
}

void RestServer::handleActivateSchedule(AsyncWebServerRequest* req) {
  String uuid = req->pathArg(0);
  auto result = _scheduler.activateSchedule(uuid.c_str());
  if (!result.ok) {
    String e = "{\"error\":\""; e += result.message; e += "\"}";
    sendJson(req, 404, e);
    return;
  }
  sendJson(req, 200, "{\"ok\":true}");
}

// ---------------------------------------------------------------------------
// Logs
// ---------------------------------------------------------------------------

void RestServer::handleGetLog(AsyncWebServerRequest* req) {
  uint16_t n = 50;
  if (req->hasParam("n")) n = req->getParam("n")->value().toInt();
  n = min(n, (uint16_t)AUDIT_RING_SIZE);

  AuditEntry entries[AUDIT_RING_SIZE];
  uint16_t count = _audit.getRecent(entries, n);

  JsonDocument doc;
  JsonArray arr = doc.to<JsonArray>();
  for (uint16_t i = 0; i < count; i++) {
    JsonObject obj = arr.add<JsonObject>();
    obj["ts"]       = entries[i].timestamp;
    obj["zone"]     = entries[i].zoneId;
    obj["duration"] = entries[i].durationSeconds;
    obj["source"]   = entries[i].source;
    char compact[32];
    AuditLog::formatEntry(entries[i], compact, sizeof(compact));
    obj["compact"] = compact;
  }
  String out;
  serializeJson(doc, out);
  sendJson(req, 200, out);
}

void RestServer::handleGetChangeLog(AsyncWebServerRequest* req) {
  ChangeEntry entries[CHANGELOG_RING_SIZE];
  uint8_t count = _changelog.getRecent(entries, CHANGELOG_RING_SIZE);

  JsonDocument doc;
  JsonArray arr = doc.to<JsonArray>();
  static const char* opNames[] = {"create","update","delete","activate"};
  for (uint8_t i = 0; i < count; i++) {
    JsonObject obj = arr.add<JsonObject>();
    obj["ts"]   = entries[i].timestamp;
    obj["uuid"] = entries[i].uuid;
    uint8_t op  = (uint8_t)entries[i].op;
    obj["op"]   = (op < 4) ? opNames[op] : "unknown";
  }
  String out;
  serializeJson(doc, out);
  sendJson(req, 200, out);
}
