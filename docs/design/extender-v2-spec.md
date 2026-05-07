# Azul Extender v2.1: System Specification

**Date:** May 2, 2026
**Version:** 2.1
**Status:** Approved

## 1. Overview

This document specifies the version 2.1 architecture for the Azul Zone Extender module. This revision pivots from a disposable battery model to a long-life, rechargeable LiFePO4-based power system, enabling a truly "zero-maintenance" commercial strategy. The 'Tap-to-Wake' and interrupt-driven logic from v2.0 remain core to the design.

## 2. Power Architecture & Runtime

### 2.1. Power Architecture Decision
-   **Configuration:** A **1S (Single-Cell)** configuration using a **32700 LiFePO4 cell** (6,000 mAh / 3.2V nominal) is the new standard.
-   **Rationale:** This single-cell model reduces BOM cost, simplifies the wireless charging circuit, and maintains a compact commercial footprint compared to multi-cell designs.
-   **Voltage Conversion:** A **high-efficiency DC-DC Boost Converter** will be used to step the 3.2V nominal cell voltage up to the 9V/12V required for solenoid pulses.
-   **Critical Requirement:** The Boost Converter **must** be controlled via an 'Enable' pin from the ESP32-S3. This ensures the converter is completely shut down with zero quiescent current draw during deep sleep, which is essential for achieving the target runtime.

### 2.2. Runtime & Consumption Analysis
-   **Target Runtime:** **2+ years** (17,500+ hours) on a single charge.
-   **Logic Budget:** ~1,750 mAh total is allocated for the ESP32-S3 deep sleep (target ~100µA) and the passive vibration trigger.
-   **Solenoid Budget:** Negligible (~20-50 mAh total annual draw) due to the use of **9VDC Latching Solenoids**, which only require brief 100ms pulses for actuation.
-   **Total Estimated Draw:** ~3,600 mAh over 2 years. This provides a **~40% safety margin** on a 6,000 mAh cell, accounting for self-discharge and cell aging.

## 3. Physical & Environmental Specifications
-   **Cell Form Factor:** The enclosure must accommodate the cylindrical **32700 form factor (1.27" Diameter x 2.78" Height)**.
-   **Charging Strategy:** The Zone Extender will feature a **"Permanently Sealed" IP68 design**. Recharging is accomplished via an external magnetic wireless power bank through the plastic enclosure wall (max wall thickness 0.25"). An internal Qi-standard receiver coil will be used.

## 4. Commercial Strategy
-   **Positioning:** The 32700 LiFePO4 power system will be marketed as the 'Industrial Standard' for safety, superior thermal stability in harsh environments, and extremely low self-discharge rates.
-   **User Experience:** The product will be marketed as **'Zero-Maintenance'**. Users will be prompted by the mobile app to perform a quick wireless "top-off" only when the system reports a voltage dip after several years of use.

---

## 5. Operational Logic: 'Tap-to-Wake'
*(Logic remains the same as v2.0)*
The v2 firmware introduces a user-activated maintenance mode to conserve power.
1.  **Initialization on Wake:** A physical tap or 'thump' on the enclosure triggers the vibration switch. The ESP32-S3 wakes from Deep Sleep via the EXT0 interrupt. Upon waking, it immediately initializes the Bluetooth LE stack and begins advertising.
2.  **Inactivity Countdown:** A **5-minute sliding inactivity timer** is initiated and is reset on any client connection or 'write' event.
3.  **Connection Logic:** The device remains awake while a BLE client is connected, starting the 5-minute countdown upon disconnection.
4.  **Hard Power Limit:** The device will unconditionally force itself back into Deep Sleep after a **maximum uptime of 15 minutes** to preserve the battery.

---

## 6. Provisioning and Security
*(Logic remains the same as v2.0)*
The extender implements a 'Trust-on-First-Use' (TOFU) provisioning model. For full details, see the [Security & Authentication Architecture](security-and-authentication.md) document.
- **Initial State:** 'Unadopted'
- **Handshake:** On first BLE connect, client writes a unique GUID.
- **Persistence:** Node saves GUID to NVS and enters 'Adopted' state.
- **Fail-Safe:** A hard-coded 'Master Architect GUID' is retained for recovery.
- **Hard Reset:** A physical trigger (e.g., magnet on reed switch) is required to wipe NVS and return to factory state.
