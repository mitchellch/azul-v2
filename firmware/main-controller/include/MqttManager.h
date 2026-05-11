#pragma once
#include <Arduino.h>
#include <PubSubClient.h>
#include <WiFiClient.h>
#include "ZoneController.h"
#include "ZoneQueue.h"
#include "Scheduler.h"
#include "TimeManager.h"
#include "AuditLog.h"

class MqttManager {
public:
    MqttManager(ZoneController& zones, ZoneQueue& queue,
                Scheduler& scheduler, TimeManager& time, AuditLog& audit);

    void begin();
    void tick();

    void publishStatus();
    void publishSchedules();
    void publishZoneEvent(uint8_t zoneId, uint16_t durationSeconds, uint8_t source);

    bool isConnected();

private:
    ZoneController& _zones;
    ZoneQueue&      _queue;
    Scheduler&      _scheduler;
    TimeManager&    _time;
    AuditLog&       _audit;

    WiFiClient  _wifiClient;
    PubSubClient _client;

    char _mac[18];           // "E8:F6:0A:85:4C:90"
    char _topicStatus[48];    // "azul/{mac}/status"
    char _topicEvents[48];    // "azul/{mac}/events"
    char _topicSchedules[52]; // "azul/{mac}/schedules"
    char _topicCmdSub[52];    // "azul/{mac}/cmd/#"
    char _topicCmdPrefix[44]; // "azul/{mac}/cmd/"
    char _clientId[24];      // "azul-{last6}"

    char _brokerUrl[64];
    uint16_t _brokerPort;

    unsigned long _lastConnectAttempt;
    uint8_t       _failCount;

    void loadBrokerConfig();
    void reconnect();

    static void messageCallback(char* topic, uint8_t* payload, unsigned int length);
    void handleMessage(const char* topic, const char* payload);

    static MqttManager* _instance;
};
