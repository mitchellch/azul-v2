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

  // Input buffer
  char _buf[128];
  uint8_t _bufLen;

  // Command history — circular buffer of last HISTORY_SIZE commands
  static const uint8_t HISTORY_SIZE = 10;
  char _history[HISTORY_SIZE][128];
  uint8_t _historyCount;  // total entries stored (capped at HISTORY_SIZE)
  uint8_t _historyHead;   // index of the most recently stored entry
  int8_t  _historyPos;    // -1 = not browsing; 0 = most recent, 1 = one before, etc.

  // Escape sequence state machine for arrow keys
  uint8_t _escState;      // 0 = normal, 1 = got ESC, 2 = got ESC [

  void historyPush(const char* line);
  void historyLoad(int8_t pos);  // load history[pos] into _buf and reprint line
  void clearInputLine();         // erase current typed line on terminal
  void cmdComplete();            // TAB completion
  uint8_t findMatches(const char** matches, uint8_t maxMatches); // prefix match

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
