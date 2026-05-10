#include <Arduino.h>
#include "Logger.h"
#include "ZoneController.h"
#include "WiFiManager.h"
#include "TimeManager.h"
#include "ScheduleStore.h"
#include "AuditLog.h"
#include "ChangeLog.h"
#include "Scheduler.h"
#include "RestServer.h"
#include "BleServer.h"
#include "ClaimManager.h"
#include "CLI.h"
#include "ZoneLed.h"
#include "ZoneQueue.h"
#include "MqttManager.h"

ZoneController zones;
WiFiManager    wifiManager;
TimeManager    timeManager;
ScheduleStore  scheduleStore;
AuditLog       auditLog;
ChangeLog      changeLog;
ZoneQueue      zoneQueue(zones, auditLog);
Scheduler      scheduler(timeManager, zones, scheduleStore, auditLog, changeLog, zoneQueue);
RestServer     restServer(zones, scheduler, auditLog, changeLog, timeManager, zoneQueue);
ClaimManager   claimMgr;
BleServer      bleServer(zones, auditLog, zoneQueue, scheduler, claimMgr, timeManager);
CLI            serialCli(zones, scheduler, auditLog, timeManager, zoneQueue);
ZoneLed        zoneLed(zones);
MqttManager    mqttManager(zones, zoneQueue, scheduler, timeManager, auditLog);

#define BLE_NOTIFY_INTERVAL_MS    5000
#define WIFI_CHECK_INTERVAL_MS   30000
#define NTP_SYNC_INTERVAL_MS   3600000
#define MQTT_PUBLISH_INTERVAL_MS 60000

unsigned long lastBleNotify  = 0;
unsigned long lastWifiCheck  = 0;
unsigned long lastNtpSync    = 0;
unsigned long lastMqttStatus = 0;
bool          restStarted    = false;
bool          ntpStarted     = false;
bool          mqttStarted    = false;

void setup() {
  Serial.begin(115200);
  delay(500);

  Logger::init();

  Serial.println("\n[Azul] Main Controller booting...");

  claimMgr.begin();
  zones.begin();
  scheduleStore.begin();
  auditLog.begin();
  changeLog.begin();
  scheduler.begin();

  wifiManager.begin();

  if (wifiManager.isConnected()) {
    restServer.begin();
    restStarted = true;
    timeManager.begin();
    ntpStarted = true;
  } else {
    Serial.println("[REST] Skipping — WiFi not connected. Use CLI to set credentials.");
    Serial.println("[Time] Skipping NTP — WiFi not connected.");
  }

  bleServer.begin();

  if (wifiManager.isConnected()) {
    mqttManager.begin();
    mqttStarted = true;
  }

  serialCli.begin();
  zoneLed.begin();

  Logger::log("[Azul] Boot complete");
}

void loop() {
  unsigned long now = millis();

  zones.tick();
  zoneQueue.tick();
  scheduler.tick();
  zoneLed.tick();
  serialCli.poll();
  bleServer.tick();
  if (mqttStarted) mqttManager.tick();

  if (now - lastBleNotify >= BLE_NOTIFY_INTERVAL_MS) {
    bleServer.notifyStatus();
    lastBleNotify = now;
  }

  if (mqttStarted && (now - lastMqttStatus >= MQTT_PUBLISH_INTERVAL_MS)) {
    mqttManager.publishStatus();
    mqttManager.publishSchedules();
    lastMqttStatus = now;
  }

  if (now - lastWifiCheck >= WIFI_CHECK_INTERVAL_MS) {
    wifiManager.reconnectIfNeeded();
    if (wifiManager.isConnected()) {
      if (!restStarted) {
        restServer.begin();
        restStarted = true;
      }
      if (!ntpStarted) {
        timeManager.begin();
        ntpStarted = true;
      }
      if (!mqttStarted) {
        mqttManager.begin();
        mqttStarted = true;
      }
    }
    lastWifiCheck = now;
  }

  // Periodic NTP re-sync (hourly) — only re-call begin() not restart
  if (ntpStarted && (now - lastNtpSync >= NTP_SYNC_INTERVAL_MS)) {
    if (wifiManager.isConnected()) {
      timeManager.begin();
    }
    lastNtpSync = now;
  }
}
