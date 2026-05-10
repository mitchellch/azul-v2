#include "BleServer.h"
#include "ScheduleJson.h"
#include "version.h"
#include "Logger.h"
#include <ArduinoJson.h>
#include <WiFi.h>
#include <nvs.h>

// ---------------------------------------------------------------------------
// Command characteristic write callback
// ---------------------------------------------------------------------------

// onWrite runs on the NimBLE host task — must NOT call notify() here.
// Copy raw bytes into the queue; tick() on the Arduino task does the rest.
class BleCommandCallback : public NimBLECharacteristicCallbacks {
public:
  explicit BleCommandCallback(BleServer& server) : _server(server) {}

  void onWrite(NimBLECharacteristic* chr) override {
    std::string raw = chr->getValue();
    if (raw.empty()) return;
    _server.enqueueCommand(raw.c_str(), (uint16_t)raw.size());
  }

private:
  BleServer& _server;
};

// ---------------------------------------------------------------------------
// Constructor / begin
// ---------------------------------------------------------------------------

BleServer::BleServer(ZoneController& zones, AuditLog& audit, ZoneQueue& queue,
                     Scheduler& scheduler, ClaimManager& claimMgr, TimeManager& time)
  : _zones(zones), _audit(audit), _queue(queue),
    _scheduler(scheduler), _claimMgr(claimMgr), _time(time) {}

void BleServer::begin() {
  _cmdQueue = xQueueCreate(8, sizeof(BleCommand));

  NimBLEDevice::init("Azul-Controller");
  NimBLEDevice::setMTU(517);
  NimBLEDevice::setPower(ESP_PWR_LVL_P9);

  NimBLEServer*  server  = NimBLEDevice::createServer();
  NimBLEService* service = server->createService(AZUL_BLE_SERVICE_UUID);

  // b1 — Status: read + notify
  _statusChar = service->createCharacteristic(
    AZUL_BLE_CHAR_STATUS_UUID, NIMBLE_PROPERTY::READ | NIMBLE_PROPERTY::NOTIFY);
  String statusJson = buildStatusJson();
  _statusChar->setValue((uint8_t*)statusJson.c_str(), statusJson.length());
  _statusChar->createDescriptor("2901")->setValue("Status");

  // b2 — Command: write with response
  NimBLECharacteristic* cmdChar = service->createCharacteristic(
    AZUL_BLE_CHAR_CMD_UUID, NIMBLE_PROPERTY::WRITE);
  cmdChar->setCallbacks(new BleCommandCallback(*this));
  cmdChar->createDescriptor("2901")->setValue("Command");

  // b3 — Zone data: read + notify
  _zoneDataChar = service->createCharacteristic(
    AZUL_BLE_CHAR_ZONE_DATA_UUID, NIMBLE_PROPERTY::READ | NIMBLE_PROPERTY::NOTIFY);
  String zoneJson = buildZoneDataJson();
  _zoneDataChar->setValue((uint8_t*)zoneJson.c_str(), zoneJson.length());
  _zoneDataChar->createDescriptor("2901")->setValue("Zone Data");

  // b4 — Response: read + notify
  _responseChar = service->createCharacteristic(
    AZUL_BLE_CHAR_RESPONSE_UUID, NIMBLE_PROPERTY::READ | NIMBLE_PROPERTY::NOTIFY);
  _responseChar->createDescriptor("2901")->setValue("Response");

  // b5 — Provision PIN: read
  _pinChar = service->createCharacteristic(
    AZUL_BLE_CHAR_PIN_UUID, NIMBLE_PROPERTY::READ);
  _pinChar->createDescriptor("2901")->setValue("Provision PIN");
  if (!_claimMgr.isClaimed()) {
    const char* pin = _claimMgr.generatePin();
    _pinChar->setValue((uint8_t*)pin, strlen(pin));
    Logger::log("[BLE] PIN: %s", pin);
  } else {
    _pinChar->setValue((uint8_t*)"", 0);
  }

  service->start();

  NimBLEAdvertising* adv = NimBLEDevice::getAdvertising();
  adv->addServiceUUID(AZUL_BLE_SERVICE_UUID);
  adv->start();

  Logger::log("[BLE] Server started, advertising as 'Azul-Controller'");
}

bool BleServer::isConnected() const {
  return NimBLEDevice::getServer()->getConnectedCount() > 0;
}

void BleServer::notifyStatus() {
  if (_statusChar) {
    String json = buildStatusJson();
    _statusChar->setValue((uint8_t*)json.c_str(), json.length());
    _statusChar->notify();
  }
  if (_zoneDataChar) {
    String zoneJson = buildZoneDataJson();
    _zoneDataChar->setValue((uint8_t*)zoneJson.c_str(), zoneJson.length());
    _zoneDataChar->notify();
  }
}

// ---------------------------------------------------------------------------
// Queue management — safe to call from any task
// ---------------------------------------------------------------------------

void BleServer::enqueueCommand(const char* data, uint16_t len) {
  if (!_cmdQueue) return;

  bool isFinal = (len > 0 && data[len - 1] == '\x00');
  uint16_t copyLen = isFinal ? len - 1 : len;

  if (_writeAccumLen + copyLen >= BLE_CMD_MAX_LEN) {
    _writeAccumLen = 0; // overflow — discard and reset
    return;
  }

  memcpy(_writeAccum + _writeAccumLen, data, copyLen);
  _writeAccumLen += copyLen;
  _writeAccum[_writeAccumLen] = '\0';

  if (!isFinal) return;

  BleCommand cmd;
  uint16_t copy = _writeAccumLen < BLE_CMD_MAX_LEN ? _writeAccumLen : BLE_CMD_MAX_LEN - 1;
  memcpy(cmd.payload, _writeAccum, copy);
  cmd.payload[copy] = '\0';
  cmd.len = copy;
  _writeAccumLen = 0;
  xQueueSend(_cmdQueue, &cmd, 0);
}

// Called from loop() on the Arduino task — safe to call notify() here
void BleServer::tick() {
  if (!_cmdQueue) return;
  BleCommand cmd;
  while (xQueueReceive(_cmdQueue, &cmd, 0) == pdTRUE) {
    JsonDocument doc;
    if (deserializeJson(doc, cmd.payload) != DeserializationError::Ok) {
      Logger::log("[BLE] Invalid JSON");
      continue;
    }
    const char* id        = doc["id"]         | "";
    const char* verb      = doc["cmd"]        | "";
    const char* authToken = doc["auth_token"] | "";
    JsonVariant data      = doc["data"];
    if (!id[0] || !verb[0]) continue;
    dispatch(id, verb, data, authToken);
  }
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

void BleServer::dispatch(const char* id, const char* cmd,
                         const JsonVariant& data, const char* authToken) {
  Logger::log("[BLE] cmd=%s", cmd);

  // Auth gate — everything except get_device_info and claim requires owner match
  bool needsAuth = strcmp(cmd, "get_device_info") != 0 &&
                   strcmp(cmd, "claim")           != 0 &&
                   strcmp(cmd, "unclaim")         != 0;
  if (needsAuth) {
    if (!_claimMgr.isClaimed()) {
      Logger::log("[BLE] rejected: not claimed");
      sendError(id, "device not claimed"); return;
    }
    if (!_claimMgr.verifyOwner(authToken)) {
      Logger::log("[BLE] rejected: bad auth (stored=%.8s)", _claimMgr.getOwnerSub());
      sendError(id, "unauthorized"); return;
    }
  }

  if      (strcmp(cmd, "get_device_info")      == 0) handleGetDeviceInfo(id);
  else if (strcmp(cmd, "claim")                == 0) handleClaim(id, data);
  else if (strcmp(cmd, "unclaim")              == 0) handleUnclaim(id, authToken);
  else if (strcmp(cmd, "get_status")           == 0) handleGetStatus(id);
  else if (strcmp(cmd, "get_time")             == 0) handleGetTime(id);
  else if (strcmp(cmd, "set_time")             == 0) handleSetTime(id, data);
  else if (strcmp(cmd, "get_zones")            == 0) handleGetZones(id);
  else if (strcmp(cmd, "update_zone")          == 0) handleUpdateZone(id, data);
  else if (strcmp(cmd, "start_zone")           == 0) handleStartZone(id, data);
  else if (strcmp(cmd, "stop_zone")            == 0) handleStopZone(id, data);
  else if (strcmp(cmd, "stop_all")             == 0) handleStopAll(id);
  else if (strcmp(cmd, "get_schedules")        == 0) handleGetSchedules(id);
  else if (strcmp(cmd, "get_schedule")         == 0) handleGetSchedule(id, data);
  else if (strcmp(cmd, "get_active_schedule")  == 0) handleGetActiveSchedule(id);
  else if (strcmp(cmd, "create_schedule")      == 0) handleCreateSchedule(id, data);
  else if (strcmp(cmd, "update_schedule")      == 0) handleUpdateSchedule(id, data);
  else if (strcmp(cmd, "delete_schedule")      == 0) handleDeleteSchedule(id, data);
  else if (strcmp(cmd, "activate_schedule")    == 0) handleActivateSchedule(id, data);
  else if (strcmp(cmd, "deactivate_schedule")  == 0) handleDeactivateSchedule(id);
  else if (strcmp(cmd, "get_log")              == 0) handleGetLog(id, data);
  else if (strcmp(cmd, "set_wifi")             == 0) handleSetWifi(id, data);
  else {
    Logger::log("[BLE] Unknown cmd: %s", cmd);
    sendError(id, "unknown command");
  }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

void BleServer::handleGetDeviceInfo(const char* id) {
  JsonDocument doc;
  doc["firmware"] = fwVersionFull().c_str();
  doc["build"]    = FW_BUILD_DATE " " FW_BUILD_TIME;
  doc["claimed"]  = _claimMgr.isClaimed();
  doc["mac"]      = WiFi.macAddress();
  String out; serializeJson(doc, out);
  sendPayload(id, out);
}

void BleServer::handleClaim(const char* id, const JsonVariant& data) {
  const char* pin      = data["pin"]       | "";
  const char* ownerSub = data["owner_sub"] | "";
  if (!pin[0] || !ownerSub[0]) { sendError(id, "pin and owner_sub required"); return; }
  if (!_claimMgr.claim(pin, ownerSub)) { sendError(id, "invalid pin"); return; }

  // Clear the PIN characteristic now that device is claimed
  _pinChar->setValue((uint8_t*)"", 0);
  sendPayload(id, "{\"claimed\":true}");
}

void BleServer::handleUnclaim(const char* id, const char* authToken) {
  // Must be claimed, and caller must be the current owner
  if (!_claimMgr.isClaimed()) { sendError(id, "device not claimed"); return; }
  if (!_claimMgr.verifyOwner(authToken)) { sendError(id, "unauthorized"); return; }

  _claimMgr.unclaim();

  // Expose the new PIN on b5 so the device is ready for immediate re-adoption
  const char* newPin = _claimMgr.getPin();
  if (_pinChar) _pinChar->setValue((uint8_t*)newPin, strlen(newPin));

  sendPayload(id, "{\"unclaimed\":true}");
}

void BleServer::handleGetStatus(const char* id) {
  JsonDocument doc;
  float tempC = temperatureRead();
  doc["device"]         = "Azul Main Controller";
  doc["firmware"]       = fwVersionFull().c_str();
  doc["build"]          = FW_BUILD_DATE " " FW_BUILD_TIME;
  doc["mac"]            = WiFi.macAddress();
  doc["uptime_seconds"] = millis() / 1000;
  doc["temperature_c"]  = tempC;
  doc["temperature_f"]  = tempC * 9.0f / 5.0f + 32.0f;
  doc["zones_running"]  = _zones.isAnyZoneRunning();
  doc["ntp_synced"]     = _scheduler.isTimeSynced();
  doc["ram_free"]       = ESP.getFreeHeap();
  doc["ram_total"]      = ESP.getHeapSize();
  doc["wifi_ssid"]      = WiFi.isConnected() ? WiFi.SSID().c_str() : "";

  const Schedule* active = _scheduler.getActiveSchedule();
  if (active) {
    doc["active_schedule_uuid"] = active->uuid;
    doc["active_schedule_name"] = active->name;
  }

  String out; serializeJson(doc, out);
  sendPayload(id, out);
}

void BleServer::handleGetTime(const char* id) {
  JsonDocument doc;
  time_t t = _time.now();
  char tzOffsetStr[7];
  _time.formatOffset(tzOffsetStr);
  doc["epoch"]         = (uint32_t)t;
  doc["synced"]        = _time.isSynced();
  doc["tz_offset"]     = _time.getTzOffset();
  doc["tz_dst"]        = _time.getDstOffset();
  doc["tz_offset_str"] = tzOffsetStr;
  doc["tz_name"]       = _time.getTzName();
  doc["tz_manual"]     = _time.isTzManual();
  if (_time.hasLocation()) {
    doc["lat"] = _time.getLat();
    doc["lon"] = _time.getLon();
  }
  if (t > 0) {
    struct tm tm;
    gmtime_r(&t, &tm);
    char iso[25];
    strftime(iso, sizeof(iso), "%Y-%m-%dT%H:%M:%SZ", &tm);
    doc["iso"] = iso;
  }
  String out; serializeJson(doc, out);
  sendPayload(id, out);
}

void BleServer::handleSetTime(const char* id, const JsonVariant& data) {
  int32_t tzOffset = data["tz_offset"] | 0;
  int32_t tzDst    = data["tz_dst"]    | 0;
  _time.setTzOffset(tzOffset, tzDst);
  if (data["tz_name"].is<const char*>()) {
    _time.setTzName(data["tz_name"].as<const char*>());
  }
  if (data["lat"].is<float>() && data["lon"].is<float>()) {
    _time.setLocation(data["lat"].as<float>(), data["lon"].as<float>());
  }
  sendOk(id);
}

void BleServer::handleGetZones(const char* id) {
  // Build a set of pending zone IDs from the queue
  QueueEntry pending[ZONE_QUEUE_DEPTH];
  uint8_t pendingCount = _queue.getPending(pending, ZONE_QUEUE_DEPTH);
  auto isPending = [&](uint8_t zoneId) {
    for (uint8_t i = 0; i < pendingCount; i++)
      if (pending[i].zoneId == zoneId) return true;
    return false;
  };

  JsonDocument doc;
  JsonArray arr = doc.to<JsonArray>();
  for (uint8_t i = 0; i < _zones.getZoneCount(); i++) {
    const Zone* z = _zones.getZone(i + 1);
    JsonObject obj = arr.add<JsonObject>();
    obj["id"]   = z->id;
    obj["name"] = z->name;
    if (z->status == ZoneStatus::RUNNING) {
      obj["status"]          = "running";
      obj["runtime_seconds"] = z->runtimeSeconds;
    } else if (isPending(z->id)) {
      obj["status"]          = "queued";
      obj["runtime_seconds"] = 0;
    } else {
      obj["status"]          = "idle";
      obj["runtime_seconds"] = 0;
    }
  }
  String out; serializeJson(doc, out);
  sendPayload(id, out);
}

void BleServer::handleUpdateZone(const char* id, const JsonVariant& data) {
  uint8_t zoneId = data["id"] | 0;
  if (!_zones.getZone(zoneId)) { sendError(id, "zone not found"); return; }
  if (!data["name"].is<const char*>()) { sendError(id, "name required"); return; }
  _zones.setZoneName(zoneId, data["name"].as<const char*>());
  sendOk(id);
}

void BleServer::handleStartZone(const char* id, const JsonVariant& data) {
  uint8_t  zoneId   = data["id"]       | 0;
  uint16_t duration = data["duration"] | 60;
  if (!_zones.getZone(zoneId)) { sendError(id, "zone not found"); return; }
  if (!_queue.enqueue(zoneId, duration, AuditSource::MANUAL_BLE)) {
    sendError(id, "queue full"); return;
  }
  sendOk(id);
  pushZoneData();
}

void BleServer::handleStopZone(const char* id, const JsonVariant& data) {
  uint8_t zoneId = data["id"] | 0;
  if (!_queue.cancel(zoneId)) { sendError(id, "zone not found"); return; }
  sendOk(id);
  pushZoneData();
}

void BleServer::handleStopAll(const char* id) {
  _queue.cancelAll();
  sendOk(id);
  pushZoneData();
}

void BleServer::handleGetSchedules(const char* id) {
  Schedule all[SCHEDULE_RING_SIZE];
  uint8_t count = 0;
  _scheduler.getAllSchedules(all, count);  // count updated by ref

  JsonDocument doc;
  JsonArray arr = doc.to<JsonArray>();
  for (uint8_t i = 0; i < count; i++) {
    JsonObject obj = arr.add<JsonObject>();
    scheduleToJson(all[i], obj);
  }
  String out; serializeJson(doc, out);
  sendPayload(id, out);
}

void BleServer::handleGetSchedule(const char* id, const JsonVariant& data) {
  const char* uuid = data["uuid"] | "";
  if (!uuid[0]) { sendError(id, "uuid required"); return; }
  Schedule s;
  if (!_scheduler.getSchedule(uuid, s)) { sendError(id, "schedule not found"); return; }
  JsonDocument doc;
  JsonObject obj = doc.to<JsonObject>();
  scheduleToJson(s, obj);
  String out; serializeJson(doc, out);
  sendPayload(id, out);
}

void BleServer::handleGetActiveSchedule(const char* id) {
  const Schedule* s = _scheduler.getActiveSchedule();
  if (!s) { sendError(id, "no active schedule"); return; }
  JsonDocument doc;
  JsonObject obj = doc.to<JsonObject>();
  scheduleToJson(*s, obj);
  obj["is_keepalive"] = _scheduler.isKeepaliveActive();
  String out; serializeJson(doc, out);
  sendPayload(id, out);
}

void BleServer::handleCreateSchedule(const char* id, const JsonVariant& data) {
  Schedule s;
  char errMsg[64] = {0};
  if (!jsonToSchedule(data, s, errMsg)) { sendError(id, errMsg); return; }
  auto result = _scheduler.createSchedule(s);
  if (!result.ok) { sendError(id, result.message); return; }
  if (onScheduleChanged) onScheduleChanged();
  String resp = "{\"uuid\":\""; resp += s.uuid; resp += "\"}";
  sendPayload(id, resp);
}

void BleServer::handleUpdateSchedule(const char* id, const JsonVariant& data) {
  const char* uuid = data["uuid"] | "";
  if (!uuid[0]) { sendError(id, "uuid required"); return; }
  Schedule s;
  char errMsg[64] = {0};
  if (!jsonToSchedule(data, s, errMsg)) { sendError(id, errMsg); return; }
  strlcpy(s.uuid, uuid, sizeof(s.uuid));
  auto result = _scheduler.updateSchedule(s);
  if (!result.ok) { sendError(id, result.message); return; }
  if (onScheduleChanged) onScheduleChanged();
  sendOk(id);
}

void BleServer::handleDeleteSchedule(const char* id, const JsonVariant& data) {
  const char* uuid = data["uuid"] | "";
  if (!uuid[0]) { sendError(id, "uuid required"); return; }
  auto result = _scheduler.deleteSchedule(uuid);
  if (!result.ok) { sendError(id, result.message); return; }
  if (onScheduleChanged) onScheduleChanged();
  sendOk(id);
}

void BleServer::handleActivateSchedule(const char* id, const JsonVariant& data) {
  const char* uuid = data["uuid"] | "";
  if (!uuid[0]) { sendError(id, "uuid required"); return; }
  auto result = _scheduler.activateSchedule(uuid);
  if (!result.ok) { sendError(id, result.message); return; }
  if (onScheduleChanged) onScheduleChanged();
  sendOk(id);
}

void BleServer::handleDeactivateSchedule(const char* id) {
  _scheduler.deactivate();
  if (onScheduleChanged) onScheduleChanged();
  sendOk(id);
}

void BleServer::handleGetLog(const char* id, const JsonVariant& data) {
  uint16_t n = data["n"] | 50;
  n = min(n, (uint16_t)AUDIT_RING_SIZE);

  AuditEntry entries[AUDIT_RING_SIZE];
  uint16_t count = _audit.getRecent(entries, n);

  static const char* srcNames[] = {"scheduler", "REST", "BLE", "CLI"};

  JsonDocument doc;
  JsonArray arr = doc.to<JsonArray>();
  for (uint16_t i = 0; i < count; i++) {
    JsonObject obj = arr.add<JsonObject>();
    obj["ts"]       = entries[i].timestamp;
    obj["zone"]     = entries[i].zoneId;
    obj["duration"] = entries[i].durationSeconds;
    uint8_t src     = entries[i].source;
    obj["source"]   = (src < 4) ? srcNames[src] : "unknown";
  }
  String out; serializeJson(doc, out);
  sendPayload(id, out);
}

void BleServer::handleSetWifi(const char* id, const JsonVariant& data) {
  const char* ssid     = data["ssid"]     | "";
  const char* password = data["password"] | "";
  if (!ssid[0]) { sendError(id, "ssid required"); return; }

  Preferences prefs;
  prefs.begin("wifi", false);
  prefs.putString("ssid", ssid);
  prefs.putString("password", password);
  prefs.end();

  Logger::log("[BLE] WiFi credentials saved for '%s' — reboot to connect", ssid);
  sendOk(id);
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

void BleServer::pushZoneData() {
  if (!_zoneDataChar) return;
  String json = buildZoneDataJson();
  _zoneDataChar->setValue((uint8_t*)json.c_str(), json.length());
  _zoneDataChar->notify();
}

void BleServer::sendOk(const char* id) {
  sendPayload(id, "{\"ok\":true}");
}

void BleServer::sendError(const char* id, const char* msg) {
  String payload = "{\"ok\":false,\"error\":\"";
  payload += msg;
  payload += "\"}";
  sendChunked(id, payload);
}

void BleServer::sendPayload(const char* id, const String& dataJson) {
  // Wrap in the response envelope, then chunk
  String envelope = "{\"id\":\"";
  envelope += id;
  envelope += "\",\"ok\":true,\"data\":";
  envelope += dataJson;
  envelope += "}";
  sendChunked(id, envelope);
}

void BleServer::sendChunked(const char* id, const String& payload) {
  if (!_responseChar) return;

  int    total   = payload.length();
  int    seq     = 0;
  char   hdr[96];
  String escaped;
  String chunk;

  for (int offset = 0; offset < total; offset += BLE_CHUNK_SIZE, seq++) {
    String slice = payload.substring(offset, offset + BLE_CHUNK_SIZE);
    bool   done  = (offset + BLE_CHUNK_SIZE >= total);

    snprintf(hdr, sizeof(hdr), "{\"id\":\"%s\",\"seq\":%d,\"done\":%s,\"d\":\"",
             id, seq, done ? "true" : "false");

    escaped = "";
    escaped.reserve(slice.length() + 8);
    for (unsigned int i = 0; i < slice.length(); i++) {
      char c = slice[i];
      if      (c == '"')  { escaped += '\\'; escaped += '"'; }
      else if (c == '\\') { escaped += '\\'; escaped += '\\'; }
      else                { escaped += c; }
    }

    chunk  = hdr;
    chunk += escaped;
    chunk += "\"}";

    _responseChar->setValue((uint8_t*)chunk.c_str(), chunk.length());
    _responseChar->notify();
  }
}

// ---------------------------------------------------------------------------
// Shared JSON serializers — delegate to ScheduleJson.h free functions
// ---------------------------------------------------------------------------

void BleServer::scheduleToJson(const Schedule& s, JsonObject& obj) const {
  ::scheduleToJson(s, obj);
}

bool BleServer::jsonToSchedule(const JsonVariant& body, Schedule& s, char* errOut) const {
  return ::jsonToSchedule(body, s, errOut, 64);
}

// ---------------------------------------------------------------------------
// Status builders (for b1 notify and b3 zone data)
// ---------------------------------------------------------------------------

String BleServer::buildStatusJson() const {
  JsonDocument doc;
  float tempC = temperatureRead();
  doc["firmware"]      = fwVersionFull().c_str();
  doc["build"]         = FW_BUILD_DATE " " FW_BUILD_TIME;
  doc["uptime"]        = millis() / 1000;
  doc["temperature_c"] = tempC;
  doc["temperature_f"] = tempC * 9.0f / 5.0f + 32.0f;
  doc["zones_running"] = _zones.isAnyZoneRunning();

  String out;
  serializeJson(doc, out);
  return out;
}

String BleServer::buildZoneDataJson() const {
  QueueEntry pending[ZONE_QUEUE_DEPTH];
  uint8_t pendingCount = _queue.getPending(pending, ZONE_QUEUE_DEPTH);
  auto isPending = [&](uint8_t zoneId) {
    for (uint8_t i = 0; i < pendingCount; i++)
      if (pending[i].zoneId == zoneId) return true;
    return false;
  };

  JsonDocument doc;
  JsonArray arr = doc.to<JsonArray>();
  for (uint8_t i = 0; i < _zones.getZoneCount(); i++) {
    const Zone* z = _zones.getZone(i + 1);
    JsonObject obj = arr.add<JsonObject>();
    obj["id"]   = z->id;
    obj["name"] = z->name;
    if (z->status == ZoneStatus::RUNNING) {
      obj["status"]          = "running";
      obj["runtime_seconds"] = z->runtimeSeconds;
    } else if (isPending(z->id)) {
      obj["status"]          = "pending";
      obj["runtime_seconds"] = 0;
    } else {
      obj["status"]          = "idle";
      obj["runtime_seconds"] = 0;
    }
  }
  String out;
  serializeJson(doc, out);
  return out;
}
