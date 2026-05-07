#include <Arduino.h>
#include "ZoneController.h"
#include "WiFiManager.h"
#include "RestServer.h"
#include "BleServer.h"
#include "CLI.h"

ZoneController zones;
WiFiManager    wifiManager;
RestServer     restServer(zones);
BleServer      bleServer(zones);
CLI            cli(zones);

#define BLE_NOTIFY_INTERVAL_MS 5000
unsigned long lastBleNotify = 0;

#define WIFI_CHECK_INTERVAL_MS 30000
unsigned long lastWifiCheck = 0;

void setup() {
  Serial.begin(115200);
  delay(500); // Allow USB CDC to enumerate

  Serial.println("\n[Azul] Main Controller booting...");

  // WiFi — non-fatal if no credentials stored yet
  wifiManager.begin();

  // REST server only starts if WiFi is connected
  if (wifiManager.isConnected()) {
    restServer.begin();
  } else {
    Serial.println("[REST] Skipping — WiFi not connected. Use CLI to set credentials.");
  }

  // BLE always starts
  bleServer.begin();

  // CLI always starts
  cli.begin();

  Serial.println("[Azul] Boot complete");
}

void loop() {
  unsigned long now = millis();

  // Zone timer ticks
  zones.tick();

  // CLI input
  cli.poll();

  // BLE status notifications
  if (now - lastBleNotify >= BLE_NOTIFY_INTERVAL_MS) {
    bleServer.notifyStatus();
    lastBleNotify = now;
  }

  // Periodic WiFi reconnect check
  if (now - lastWifiCheck >= WIFI_CHECK_INTERVAL_MS) {
    wifiManager.reconnectIfNeeded();
    lastWifiCheck = now;
  }
}
