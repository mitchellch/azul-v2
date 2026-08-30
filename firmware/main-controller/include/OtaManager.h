#pragma once
#include <Arduino.h>
#include <ArduinoJson.h>

class MqttManager;
class StatusIndicator;

class OtaManager {
public:
    explicit OtaManager(MqttManager& mqtt);

    void setStatusIndicator(StatusIndicator* s) { _status = s; }

    void handleUpdate(const JsonVariant& data);

    bool isUpdating() const { return _updating; }

private:
    void run(const char* url, const char* expectedSha256Hex,
             const char* expectedVersion, uint32_t expectedSize);
    void publishProgress(const char* version, uint8_t percent);
    void publishError(const char* version, const char* error);
    void publishComplete(const char* version, uint32_t durationMs);

    MqttManager&     _mqtt;
    bool             _updating;
    StatusIndicator* _status = nullptr;
};
