# Bill of Materials: Azul Zone Extender

**Date:** May 2, 2026
**Version:** 2.1

## Project Overview
This document outlines the Bill of Materials (BOM) for the v2.1 Azul Zone Extender. This version is a fully waterproof, LoRa-enabled irrigation controller designed for extreme long-life operation. It is powered by a high-capacity rechargeable LiFePO4 cell and utilizes an interrupt-driven 'Tap-to-Wake' system for on-site maintenance.

---

### **Core Components**

| Part | Component | Quantity | Key Specifications | Notes |
| :--- | :--- | :--- | :--- | :--- |
| MCU1 | Microcontroller | 1 | ESP32-S3 Module (N16R8) | 16MB Flash, 8MB PSRAM. Chosen for deep sleep and performance. |
| U1 | LoRa Transceiver | 1 | Semtech SX1262 | High-performance, low-power LoRa module. Connects via SPI. |

---

### **Power Management (v2.1)**

| Part | Component | Quantity | Key Specifications | Notes |
| :--- | :--- | :--- | :--- | :--- |
| BATT1| Battery Cell | 1 | 32700 LiFePO4 Cell, 6000mAh | High-capacity, long-life, and thermally stable cell. |
| U2 | Battery Charger IC| 1 | MCP73831 or similar | Manages charging of the LiFePO4 cell from the Qi receiver. |
| U3 | Wireless Charger | 1 | 5V Qi Receiver Module | Standard Qi wireless charging receiver coil and board. |
| U4 | LDO Regulator | 1 | MCP1700-3302E or similar | Ultra-low quiescent current LDO to provide stable 3.3V to the MCU. |
| U5 | Boost Converter | 1 | e.g., TPS61023 | High-efficiency DC-DC Boost Converter **with Enable Pin**. Used to generate 9V/12V for the solenoid pulse. |

---

### **Sensors & Wake Mechanism**

| Part | Component | Quantity | Key Specifications | Notes |
| :--- | :--- | :--- | :--- | :--- |
| SW1 | Vibration Switch | 1 | SW-18010P (or similar SW-180 series) | Passive mechanical switch for the EXT0 interrupt trigger. |
| R1 | Pull-up Resistor | 1 | 10kΩ | Pulls the wake-up GPIO pin HIGH until the switch is triggered. |

---

### **Solenoid Driver (DC Latching)**

| Part | Component | Quantity | Key Specifications | Notes |
| :--- | :--- | :--- | :--- | :--- |
| U6 | H-Bridge Driver | 1 | DRV8833 or similar | Provides the reverse-polarity pulses required to toggle the DC latching solenoid. Powered by the Boost Converter output. |
| C1, C2| Bulk Capacitors| 2 | 100µF, 16V Electrolytic | Provides high-current pulse for solenoid actuation. |

---

### **Physical Components**

| Part | Component | Quantity | Key Specifications | Notes |
| :--- | :--- | :--- | :--- | :--- |
| J1 | Solenoid Connector | 1 | IP68 Cable Gland | Waterproof seal for solenoid wire exit. |
| ANT1 | LoRa Antenna | 1 | 915MHz u.FL Antenna | Compact internal antenna. |
| ENC1 | Waterproof Enclosure| 1 | [DFRobot Project Box](https://www.dfrobot.com/product-2155.html) | IP68 Rated. Must accommodate 32700 cell. |

---

### **Disclaimer**
- The vibration switch must be rigidly bonded to the interior enclosure wall for reliable vibration transfer.
- The Boost Converter's 'Enable' pin is critical and must be controlled by the ESP32 to ensure zero quiescent draw during deep sleep.
