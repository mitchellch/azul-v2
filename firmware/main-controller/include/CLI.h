#pragma once
#include <Arduino.h>
#include "ZoneController.h"
#include "Scheduler.h"
#include "AuditLog.h"
#include "TimeManager.h"
#include "NvsDump.h"
#include "ZoneQueue.h"

class CLI {
public:
  CLI(ZoneController& zones, Scheduler& scheduler, AuditLog& audit,
      TimeManager& time, ZoneQueue& queue);
  void begin();
  void poll();
  void printPrompt();

private:
  ZoneController& _zones;
  Scheduler&      _scheduler;
  AuditLog&       _audit;
  TimeManager&    _time;
  ZoneQueue&      _queue;

  char _buf[128];
  uint8_t _bufLen;

  static const uint8_t HISTORY_SIZE = 10;
  char    _history[HISTORY_SIZE][128];
  uint8_t _historyCount;
  uint8_t _historyHead;
  int8_t  _historyPos;
  uint8_t _escState;

  void historyPush(const char* line);
  void historyLoad(int8_t pos);
  void clearInputLine();
  void cmdComplete();
  uint8_t findMatches(const char** matches, uint8_t maxMatches);

  void dispatch(const char* line);
  void printHelp();

  void cmdStatus();
  void cmdZones();
  void cmdStart(const char* args);
  void cmdStop(const char* args);
  void cmdStopAll();
  void cmdWifiSet(const char* args);
  void cmdWifiStatus();
  void cmdVersion();
  void cmdSchedule();
  void cmdSchedules();
  void cmdLog(const char* args);
  void cmdTzGet();
  void cmdTzSet(const char* args);
  void cmdNvsDump();
  void cmdReboot();
};
