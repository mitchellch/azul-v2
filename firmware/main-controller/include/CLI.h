#pragma once
#include <Arduino.h>
#include "ZoneController.h"

class CLI {
public:
  CLI(ZoneController& zones);
  void begin();

  // Call from main loop — reads available serial bytes and dispatches commands
  void poll();

  // Reprint "> " plus current input buffer — called by Logger after background messages
  void printPrompt();

private:
  ZoneController& _zones;
  char _buf[128];
  uint8_t _bufLen;

  void dispatch(const char* line);
  void printHelp();

  // Commands
  void cmdStatus();
  void cmdZones();
  void cmdStart(const char* args);
  void cmdStop(const char* args);
  void cmdStopAll();
  void cmdWifiSet(const char* args);
  void cmdWifiStatus();
  void cmdVersion();
  void cmdReboot();
};
