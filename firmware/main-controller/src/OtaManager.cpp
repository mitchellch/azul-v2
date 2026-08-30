#include "OtaManager.h"
#include "MqttManager.h"
#include "StatusIndicator.h"
#include <HTTPClient.h>
#include <Update.h>
#include <WiFi.h>
#include <esp_ota_ops.h>
#include <mbedtls/sha256.h>

// Hex-encode a 32-byte SHA-256 digest. Output buffer must be >= 65 bytes.
static void sha256ToHex(const uint8_t* digest, char* out) {
    static const char* hex = "0123456789abcdef";
    for (int i = 0; i < 32; i++) {
        out[i * 2]     = hex[(digest[i] >> 4) & 0xF];
        out[i * 2 + 1] = hex[digest[i] & 0xF];
    }
    out[64] = '\0';
}

OtaManager::OtaManager(MqttManager& mqtt) : _mqtt(mqtt), _updating(false) {}

void OtaManager::handleUpdate(const JsonVariant& data) {
    if (_updating) {
        Serial.println("[OTA] Update already in progress, ignoring");
        return;
    }

    const char* url     = data["url"]     | "";
    const char* sha     = data["sha256"]  | "";
    const char* version = data["version"] | "";
    uint32_t    size    = data["size"]    | 0;

    if (!url[0] || !sha[0] || !version[0] || size == 0) {
        Serial.println("[OTA] Missing required fields (url/sha256/version/size)");
        publishError(version, "bad_request");
        return;
    }
    if (strlen(sha) != 64) {
        Serial.println("[OTA] sha256 must be 64 hex chars");
        publishError(version, "bad_sha256");
        return;
    }

    _updating = true;
    if (_status) _status->setOtaPhase(StatusIndicator::OtaPhase::Downloading, 0);
    run(url, sha, version, size);
    _updating = false;
    // On success run() reboots and never returns; if we get here the update
    // failed and publishError() has already set the LED error state.
    if (_status) _status->setOtaPhase(StatusIndicator::OtaPhase::None);
}

void OtaManager::run(const char* url, const char* expectedSha256Hex,
                     const char* expectedVersion, uint32_t expectedSize) {
    Serial.printf("[OTA] Starting update to %s (%u bytes) from %s\n",
                  expectedVersion, expectedSize, url);
    unsigned long startMs = millis();

    HTTPClient http;
    http.setTimeout(15000);
    if (!http.begin(url)) {
        publishError(expectedVersion, "http_begin_failed");
        return;
    }

    int httpCode = http.GET();
    if (httpCode != HTTP_CODE_OK) {
        Serial.printf("[OTA] HTTP GET failed: %d\n", httpCode);
        http.end();
        publishError(expectedVersion, "http_failed");
        return;
    }

    int contentLength = http.getSize();
    if (contentLength > 0 && (uint32_t)contentLength != expectedSize) {
        Serial.printf("[OTA] Content-Length %d != expected %u\n", contentLength, expectedSize);
        http.end();
        publishError(expectedVersion, "size_mismatch");
        return;
    }

    if (!Update.begin(expectedSize, U_FLASH)) {
        Serial.printf("[OTA] Update.begin failed: %s\n", Update.errorString());
        http.end();
        publishError(expectedVersion, "update_begin_failed");
        return;
    }

    mbedtls_sha256_context sha;
    mbedtls_sha256_init(&sha);
    mbedtls_sha256_starts(&sha, 0);  // SHA-256 (not SHA-224)

    WiFiClient* stream = http.getStreamPtr();
    uint8_t buf[1024];
    uint32_t written = 0;
    uint8_t lastPercent = 0;
    unsigned long lastReadMs = millis();

    while (written < expectedSize) {
        if (!http.connected()) {
            Serial.println("[OTA] Connection dropped mid-download");
            Update.abort();
            mbedtls_sha256_free(&sha);
            http.end();
            publishError(expectedVersion, "stream_dropped");
            return;
        }

        size_t available = stream->available();
        if (available == 0) {
            if (millis() - lastReadMs > 10000) {
                Serial.println("[OTA] Read stalled > 10s");
                Update.abort();
                mbedtls_sha256_free(&sha);
                http.end();
                publishError(expectedVersion, "stream_timeout");
                return;
            }
            delay(1);
            continue;
        }
        lastReadMs = millis();

        size_t toRead = min(available, sizeof(buf));
        toRead = min(toRead, (size_t)(expectedSize - written));
        int bytesRead = stream->readBytes(buf, toRead);
        if (bytesRead <= 0) continue;

        if (Update.write(buf, bytesRead) != (size_t)bytesRead) {
            Serial.printf("[OTA] Update.write failed: %s\n", Update.errorString());
            Update.abort();
            mbedtls_sha256_free(&sha);
            http.end();
            publishError(expectedVersion, "write_failed");
            return;
        }

        mbedtls_sha256_update(&sha, buf, bytesRead);
        written += bytesRead;

        uint8_t pct = (uint8_t)((uint64_t)written * 100 / expectedSize);
        if (pct >= lastPercent + 10) {
            publishProgress(expectedVersion, pct);
            lastPercent = pct;
        }
    }

    http.end();

    uint8_t digest[32];
    mbedtls_sha256_finish(&sha, digest);
    mbedtls_sha256_free(&sha);

    char actualHex[65];
    sha256ToHex(digest, actualHex);
    if (strcasecmp(actualHex, expectedSha256Hex) != 0) {
        Serial.printf("[OTA] SHA-256 mismatch:\n  expected %s\n  actual   %s\n",
                      expectedSha256Hex, actualHex);
        Update.abort();
        publishError(expectedVersion, "sha256_mismatch");
        return;
    }

    if (!Update.end(true)) {
        Serial.printf("[OTA] Update.end failed: %s\n", Update.errorString());
        publishError(expectedVersion, "finalize_failed");
        return;
    }

    unsigned long durationMs = millis() - startMs;
    Serial.printf("[OTA] Success, rebooting into %s (%lu ms)\n", expectedVersion, durationMs);
    publishComplete(expectedVersion, durationMs);
    delay(500);  // let MQTT publish drain
    ESP.restart();
}

void OtaManager::publishProgress(const char* version, uint8_t percent) {
    Serial.printf("[OTA] %s %u%%\n", version, percent);
    if (_status) _status->setOtaPhase(StatusIndicator::OtaPhase::Downloading, percent);
    JsonDocument doc;
    JsonObject extra = doc.to<JsonObject>();
    extra["percent"] = percent;
    _mqtt.publishOtaEvent("ota_progress", version, extra);
}

void OtaManager::publishError(const char* version, const char* error) {
    Serial.printf("[OTA] ERROR %s: %s\n", version, error);
    if (_status) _status->setError(StatusIndicator::ErrorKind::OtaFailed);
    JsonDocument doc;
    JsonObject extra = doc.to<JsonObject>();
    extra["error"] = error;
    _mqtt.publishOtaEvent("ota_error", version, extra);
}

void OtaManager::publishComplete(const char* version, uint32_t durationMs) {
    Serial.printf("[OTA] COMPLETE %s in %u ms\n", version, durationMs);
    if (_status) _status->setOtaPhase(StatusIndicator::OtaPhase::Verifying, 100);
    JsonDocument doc;
    JsonObject extra = doc.to<JsonObject>();
    extra["duration_ms"] = durationMs;
    _mqtt.publishOtaEvent("ota_complete", version, extra);
}
