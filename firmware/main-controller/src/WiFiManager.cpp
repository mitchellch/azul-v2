#include "WiFiManager.h"
#include "Logger.h"
#include <WiFi.h>
#include <Preferences.h>

static void wifiEventHandler(arduino_event_id_t event, arduino_event_info_t info) {
  switch (event) {
    case ARDUINO_EVENT_WIFI_STA_START:
      Serial.println("[WiFi] STA started");
      break;
    case ARDUINO_EVENT_WIFI_STA_CONNECTED:
      Serial.println("[WiFi] Associated (waiting for IP)");
      break;
    case ARDUINO_EVENT_WIFI_STA_GOT_IP:
      Serial.printf("[WiFi] Connected. IP: %s  RSSI: %d dBm\n",
                    WiFi.localIP().toString().c_str(), WiFi.RSSI());
      break;
    case ARDUINO_EVENT_WIFI_STA_LOST_IP:
      Serial.println("[WiFi] Lost IP");
      break;
    case ARDUINO_EVENT_WIFI_STA_DISCONNECTED:
      // Common reason codes: 2=AUTH_EXPIRE, 4=ASSOC_EXPIRE, 15=4WAY_HANDSHAKE_TIMEOUT,
      // 200=BEACON_TIMEOUT, 201=NO_AP_FOUND, 202=AUTH_FAIL, 205=CONNECTION_FAIL.
      Serial.printf("[WiFi] Disconnected (reason=%u)\n",
                    info.wifi_sta_disconnected.reason);
      break;
    default:
      break;
  }
}

bool WiFiManager::begin() {
  char ssid[64] = {0};
  char password[64] = {0};
  loadCredentials(ssid, password);

  if (strlen(ssid) == 0) {
    Serial.println("[WiFi] No credentials stored. Use CLI: wifi-set <ssid> <password>");
    return false;
  }

  // Install event handler once so we get state-transition logs without
  // blocking. Static bool prevents double-registration if begin() is
  // ever called twice.
  static bool eventsInstalled = false;
  if (!eventsInstalled) {
    WiFi.onEvent(wifiEventHandler);
    eventsInstalled = true;
  }

  Serial.printf("[WiFi] Connecting to %s (async)...\n", ssid);
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.persistent(true);
  WiFi.begin(ssid, password);
  return true;
}

bool WiFiManager::isConnected() const {
  return WiFi.status() == WL_CONNECTED;
}

void WiFiManager::reconnectIfNeeded() {
  if (isConnected()) return;

  // Fresh WiFi.begin(ssid, pw) instead of WiFi.reconnect() shortcut — the old
  // blocking code re-kicked with full creds on each 10 s timeout and that's
  // what eventually got flaky APs to associate. WiFi.reconnect() only reuses
  // whatever state the driver already has, which sometimes gets stuck.
  char ssid[64] = {0};
  char password[64] = {0};
  loadCredentials(ssid, password);
  if (strlen(ssid) == 0) return;

  Serial.printf("[WiFi] Re-kicking connect to %s\n", ssid);
  WiFi.disconnect();
  WiFi.begin(ssid, password);
}

String WiFiManager::getIPAddress() const {
  return WiFi.localIP().toString();
}

void WiFiManager::loadCredentials(char* ssid, char* password) {
  Preferences prefs;
  prefs.begin("wifi", false);
  prefs.getString("ssid", ssid, 64);
  prefs.getString("password", password, 64);
  prefs.end();
}
