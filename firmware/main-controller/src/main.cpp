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
#include "StatusIndicator.h"
#include "ZoneQueue.h"
#include "MqttManager.h"
#include "OtaManager.h"
#include <esp_ota_ops.h>

ZoneController zones;
WiFiManager    wifiManager;
TimeManager    timeManager;
ScheduleStore  scheduleStore;
AuditLog       auditLog;
ChangeLog      changeLog;
ZoneQueue      zoneQueue(zones, auditLog);
Scheduler      scheduler(timeManager, zones, scheduleStore, auditLog, changeLog, zoneQueue);
MqttManager    mqttManager(zones, zoneQueue, scheduler, timeManager, auditLog);
OtaManager     otaManager(mqttManager);
RestServer     restServer(zones, scheduler, auditLog, changeLog, timeManager, zoneQueue, mqttManager);
ClaimManager   claimMgr;
BleServer      bleServer(zones, auditLog, zoneQueue, scheduler, claimMgr, timeManager);
CLI             serialCli(zones, scheduler, auditLog, timeManager, zoneQueue);
StatusIndicator statusLed(zones);

#define BLE_NOTIFY_INTERVAL_MS    5000
#define WIFI_CHECK_INTERVAL_MS   10000
#define NTP_SYNC_INTERVAL_MS   3600000

#ifdef DEBUG_BUILD
  #define MQTT_PUBLISH_INTERVAL_MS  5000
#else
  #define MQTT_PUBLISH_INTERVAL_MS 60000
#endif

unsigned long lastBleNotify  = 0;
unsigned long lastWifiCheck  = 0;
unsigned long lastNtpSync    = 0;
unsigned long lastMqttStatus = 0;
bool          restStarted    = false;
bool          ntpStarted     = false;
bool          mqttStarted    = false;

// OTA first-boot verify: if we booted into a pending-verify partition, we have
// OTA_VERIFY_TIMEOUT_MS to confirm the new firmware works (MQTT connect) before
// the bootloader auto-rolls back to the previous slot on next reboot.
#define OTA_VERIFY_TIMEOUT_MS 60000
bool          otaPendingVerify = false;
unsigned long otaVerifyDeadline = 0;

void setup() {
  Serial.begin(115200);
  delay(500);

  Logger::init();

  Serial.println("\n[Azul] Main Controller booting...");

  // Bring the status LED up first so users see immediate visual feedback
  // (dim white breathe) that the MCU is alive, even before subsystems start.
  statusLed.begin();

  // OTA first-boot check — if the running partition is pending verify, arm
  // the timeout that will roll back if MQTT never connects.
  const esp_partition_t* running = esp_ota_get_running_partition();
  esp_ota_img_states_t ota_state;
  if (running && esp_ota_get_state_partition(running, &ota_state) == ESP_OK) {
    if (ota_state == ESP_OTA_IMG_PENDING_VERIFY) {
      otaPendingVerify  = true;
      otaVerifyDeadline = millis() + OTA_VERIFY_TIMEOUT_MS;
      Serial.printf("[OTA] Booted into pending-verify partition %s — %us to confirm\n",
                    running->label, OTA_VERIFY_TIMEOUT_MS / 1000);
    }
  }

  claimMgr.begin();
  zones.begin();
  scheduleStore.begin();
  auditLog.begin();
  changeLog.begin();
  scheduler.begin();

  statusLed.setBootPhase(StatusIndicator::BootPhase::Wifi);
  wifiManager.begin();
  // WiFi.begin() is async — services that depend on it (REST/NTP/MQTT) are
  // started from loop() the moment isConnected() flips true. That keeps the
  // status LED tick() responsive during the initial connect.

  bleServer.begin();

  bleServer.onScheduleChanged = []() {
    // Server is source of truth — phone forwards BLE edits via pending queue
  };

  mqttManager.setOtaManager(&otaManager);
  otaManager.setStatusIndicator(&statusLed);

  serialCli.begin();

  Logger::log("[Azul] Boot complete");
}

void loop() {
  unsigned long now = millis();

  zones.tick();
  zoneQueue.tick();
  scheduler.tick();
  statusLed.tick();
  serialCli.poll();
  bleServer.tick();
  if (mqttStarted) mqttManager.tick();

  // OTA verify: on success (MQTT up within window) mark valid; on timeout, roll back.
  if (otaPendingVerify) {
    if (mqttStarted && mqttManager.isConnected()) {
      esp_ota_mark_app_valid_cancel_rollback();
      Serial.println("[OTA] New firmware confirmed healthy — rollback canceled");
      otaPendingVerify = false;
      statusLed.setOtaPhase(StatusIndicator::OtaPhase::None);
    } else if ((int32_t)(now - otaVerifyDeadline) >= 0) {
      Serial.println("[OTA] Verify window expired — rolling back to previous slot");
      esp_ota_mark_app_invalid_rollback_and_reboot();
      // Unreachable
    }
  }

  if (now - lastBleNotify >= BLE_NOTIFY_INTERVAL_MS) {
    bleServer.notifyStatus();
    lastBleNotify = now;
  }

  if (mqttStarted && (now - lastMqttStatus >= MQTT_PUBLISH_INTERVAL_MS)) {
    mqttManager.publishStatus();
    lastMqttStatus = now;
  }

  // Start deferred services the moment WiFi comes up. Cheap (three flag
  // checks) so it runs every tick instead of gated behind WIFI_CHECK_INTERVAL_MS,
  // which used to delay first-boot MQTT connect by up to 30 s.
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
      statusLed.setBootPhase(StatusIndicator::BootPhase::Mqtt);
      mqttManager.begin();
      mqttStarted = true;
    }
  }

  // Backstop reconnect nudge — WiFi.setAutoReconnect(true) handles most
  // disconnects, but if it gives up we re-kick every 30 s. Non-blocking.
  if (now - lastWifiCheck >= WIFI_CHECK_INTERVAL_MS) {
    wifiManager.reconnectIfNeeded();
    lastWifiCheck = now;
  }

  // Periodic NTP re-sync (hourly)
  if (ntpStarted && (now - lastNtpSync >= NTP_SYNC_INTERVAL_MS)) {
    lastNtpSync = now;
  }

  // Reflect connectivity state on the status LED. Runs every tick so any
  // WiFi/MQTT drop or recovery is visible within one main-loop iteration.
  // OtaFailed is sticky (StatusIndicator ignores overrides), so an OTA
  // failure red blink is never overwritten by a transient MQTT reconnect.
  if (!wifiManager.isConnected()) {
    statusLed.setError(StatusIndicator::ErrorKind::NoWifi);
  } else if (!mqttStarted || !mqttManager.isConnected()) {
    statusLed.clearError();
    statusLed.setBootPhase(StatusIndicator::BootPhase::Mqtt);
  } else {
    statusLed.clearError();
    statusLed.setBootPhase(StatusIndicator::BootPhase::Ready);
  }
}
