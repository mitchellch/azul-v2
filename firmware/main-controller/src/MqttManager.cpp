#include "MqttManager.h"
#include "ScheduleJson.h"
#include "version.h"
#include <ArduinoJson.h>
#include <Preferences.h>
#include <WiFi.h>

#define MQTT_RECONNECT_INTERVAL_MS 10000

MqttManager* MqttManager::_instance = nullptr;

MqttManager::MqttManager(ZoneController& zones, ZoneQueue& queue,
                         Scheduler& scheduler, TimeManager& time, AuditLog& audit)
    : _zones(zones), _queue(queue), _scheduler(scheduler), _time(time), _audit(audit),
      _client(_wifiClient), _brokerPort(1883), _lastConnectAttempt(0)
{
    _instance = this;
    _brokerUrl[0] = '\0';
}

void MqttManager::loadBrokerConfig() {
    Preferences prefs;
    prefs.begin("mqtt", true);
    prefs.getString("url", _brokerUrl, sizeof(_brokerUrl));
    _brokerPort = (uint16_t)prefs.getInt("port", 1883);
    prefs.end();

    if (_brokerUrl[0] == '\0') {
        strlcpy(_brokerUrl, "localhost", sizeof(_brokerUrl));
    }

    // Strip mqtt:// prefix if present
    if (strncmp(_brokerUrl, "mqtt://", 7) == 0) {
        memmove(_brokerUrl, _brokerUrl + 7, strlen(_brokerUrl + 7) + 1);
    }
}

void MqttManager::begin() {
    String macStr = WiFi.macAddress();
    strlcpy(_mac, macStr.c_str(), sizeof(_mac));

    // Client ID: azul-{last 5 chars of MAC e.g. "4C:90"}
    // MAC format: "E8:F6:0A:85:4C:90" — last 5 chars = "4C:90"
    const char* last5 = _mac + strlen(_mac) - 5;
    snprintf(_clientId, sizeof(_clientId), "azul-%.5s", last5);

    snprintf(_topicStatus,    sizeof(_topicStatus),    "azul/%s/status", _mac);
    snprintf(_topicEvents,    sizeof(_topicEvents),    "azul/%s/events", _mac);
    snprintf(_topicCmdSub,    sizeof(_topicCmdSub),    "azul/%s/cmd/#",  _mac);
    snprintf(_topicCmdPrefix, sizeof(_topicCmdPrefix), "azul/%s/cmd/",   _mac);

    loadBrokerConfig();

    _client.setServer(_brokerUrl, _brokerPort);
    _client.setCallback(MqttManager::messageCallback);
    _client.setBufferSize(1024);

    _queue.onZoneStart = [this](uint8_t zoneId, uint16_t durationSec, uint8_t source) {
        publishZoneEvent(zoneId, durationSec, source);
    };

    reconnect();
}

void MqttManager::tick() {
    if (!WiFi.isConnected()) return;

    if (!_client.connected()) {
        unsigned long now = millis();
        if (now - _lastConnectAttempt >= MQTT_RECONNECT_INTERVAL_MS) {
            _lastConnectAttempt = now;
            reconnect();
        }
    } else {
        _client.loop();
    }
}

void MqttManager::reconnect() {
    if (!WiFi.isConnected()) return;

    Serial.printf("[MQTT] Connecting to %s:%d as %s\n", _brokerUrl, _brokerPort, _clientId);

    if (_client.connect(_clientId)) {
        Serial.println("[MQTT] Connected");
        _client.subscribe(_topicCmdSub);
        publishStatus();
    } else {
        Serial.printf("[MQTT] Connect failed, rc=%d — retry in %ds\n",
                      _client.state(), MQTT_RECONNECT_INTERVAL_MS / 1000);
    }
}

bool MqttManager::isConnected() {
    return _client.connected();
}

void MqttManager::publishStatus() {
    if (!_client.connected()) return;

    JsonDocument doc;
    doc["firmware"]      = fwVersionFull().c_str();
    doc["uptime"]        = millis() / 1000;
    doc["mac"]           = _mac;
    doc["ip"]            = WiFi.localIP().toString();
    doc["ntp_synced"]    = _time.isSynced();
    doc["zones_running"] = _zones.isAnyZoneRunning();
    doc["ram_free"]      = (uint32_t)ESP.getFreeHeap();
    if (_time.hasLocation()) {
        doc["lat"] = _time.getLat();
        doc["lon"] = _time.getLon();
    }

    char buf[384];
    size_t len = serializeJson(doc, buf, sizeof(buf));
    _client.publish(_topicStatus, (const uint8_t*)buf, len, false);
}

void MqttManager::publishZoneEvent(uint8_t zoneId, uint16_t durationSeconds, uint8_t source) {
    if (!_client.connected()) return;

    static const char* srcNames[] = {"scheduler", "REST", "BLE", "CLI", "MQTT"};

    JsonDocument doc;
    doc["type"]     = "zone_run";
    doc["zone"]     = zoneId;
    doc["duration"] = durationSeconds;
    doc["source"]   = (source < 5) ? srcNames[source] : "unknown";
    doc["ts"]       = (uint32_t)_time.now();

    char buf[192];
    size_t len = serializeJson(doc, buf, sizeof(buf));
    _client.publish(_topicEvents, (const uint8_t*)buf, len, false);
}

// ---------------------------------------------------------------------------
// Incoming message dispatch
// ---------------------------------------------------------------------------

void MqttManager::messageCallback(char* topic, uint8_t* payload, unsigned int length) {
    if (!_instance) return;
    if (length >= 512) return; // guard against oversized payloads

    char msg[512];
    memcpy(msg, payload, length);
    msg[length] = '\0';
    _instance->handleMessage(topic, msg);
}

void MqttManager::handleMessage(const char* topic, const char* payload) {
    size_t prefixLen = strlen(_topicCmdPrefix);
    if (strncmp(topic, _topicCmdPrefix, prefixLen) != 0) return;

    const char* cmd = topic + prefixLen;

    JsonDocument doc;
    DeserializationError err = deserializeJson(doc, payload);
    if (err != DeserializationError::Ok) {
        Serial.printf("[MQTT] Bad JSON on %s\n", topic);
        return;
    }
    JsonVariant data = doc.as<JsonVariant>();

    if (strcmp(cmd, "zone/start") == 0) {
        uint8_t  zoneId   = data["zone"]     | 0;
        uint16_t duration = data["duration"] | 60;
        if (zoneId < 1 || zoneId > MAX_ZONES) return;
        _queue.enqueue(zoneId, duration, AuditSource::MANUAL_MQTT);

    } else if (strcmp(cmd, "zone/stop") == 0) {
        uint8_t zoneId = data["zone"] | 0;
        if (zoneId < 1 || zoneId > MAX_ZONES) return;
        _queue.cancel(zoneId);

    } else if (strcmp(cmd, "zone/stop-all") == 0) {
        _queue.cancelAll();

    } else if (strcmp(cmd, "schedule/set") == 0) {
        Schedule s;
        char errMsg[64] = {0};
        if (!jsonToSchedule(data, s, errMsg, sizeof(errMsg))) {
            Serial.printf("[MQTT] schedule/set parse error: %s\n", errMsg);
            return;
        }
        auto result = _scheduler.createSchedule(s);
        if (!result.ok) {
            Serial.printf("[MQTT] schedule/set create error: %s\n", result.message);
            return;
        }
        _scheduler.activateSchedule(s.uuid);

    } else if (strcmp(cmd, "schedule/activate") == 0) {
        const char* uuid = data["uuid"] | "";
        if (!uuid[0]) return;
        _scheduler.activateSchedule(uuid);

    } else if (strcmp(cmd, "schedule/deactivate") == 0) {
        _scheduler.deactivate();

    } else if (strcmp(cmd, "schedule/delete") == 0) {
        const char* uuid = data["uuid"] | "";
        if (!uuid[0]) return;
        _scheduler.deleteSchedule(uuid);

    } else if (strcmp(cmd, "time/set") == 0) {
        int32_t tzOffset = data["tz_offset"] | 0;
        int32_t tzDst    = data["tz_dst"]    | 0;
        _time.setTzOffset(tzOffset, tzDst);
        if (data["tz_name"].is<const char*>()) {
            _time.setTzName(data["tz_name"].as<const char*>());
        }
    }
}
