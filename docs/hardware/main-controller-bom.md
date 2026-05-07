# Bill of Materials: Azul Main Controller

**Date:** May 2, 2026
**Version:** 1.0

## Project Overview
This document outlines the Bill of Materials (BOM) for an 8-zone, Wi-Fi enabled main sprinkler controller based on the ESP32 platform. The design prioritizes reliability and safety, using solid-state components for switching AC loads and an integrated switching power supply to efficiently power the logic circuits from a standard 24V AC sprinkler transformer.

---

### **Core Components**

| Part | Component | Quantity | Key Specifications | Notes |
| :--- | :--- | :--- | :--- | :--- |
| MCU1 | Microcontroller | 1 | ESP32-DevKitC-v4 | Development board with ESP32-WROOM-32 module, Wi-Fi, Bluetooth, and integrated USB for easy programming. |
| U1 | I/O Expander | 1 | Microchip MCP23017 | I2C GPIO Expander, 16-Channel. Used to drive the 8 zone relays and monitor sensor inputs, saving native ESP32 pins. |

---

### **LoRa Gateway Components**

| Part | Component | Quantity | Key Specifications | Notes |
| :--- | :--- | :--- | :--- | :--- |
| U3 | LoRa Transceiver | 1 | Semtech SX1262 | High-performance LoRa module for long-range communication. Connects to ESP32 via SPI. |
| ANT1 | Antenna | 1 | 915MHz 5dBi Omni-Directional | High-gain antenna to maximize the range of the LoRa mesh network. |
| J4 | Antenna Connector | 1 | SMA Female, PCB Mount | For connecting the external high-gain antenna. |

---

### **Power Supply**

| Part | Component | Quantity | Key Specifications | Notes |
| :--- | :--- | :--- | :--- | :--- |
| PSU1 | AC-DC Converter | 1 | Hi-Link HLK-PM01 | 240VAC to 5VDC, 3W. Safely converts high voltage to logic-level power. An equivalent 24V AC input model is ideal. |
| U2 | Voltage Regulator | 1 | L7805 or similar | 5V Linear Regulator. Cleans up power for sensitive components. |
| F1 | Fuse | 1 | 500mA, 250V Slow-Blow | Primary-side AC input protection. Use with an appropriate fuse holder. |
| RV1 | Varistor (MOV) | 1 | 275V AC | Protects against voltage spikes on the AC line. Placed in parallel with the AC input. |

---

### **Zone Control (Solid-State Relays)**

| Part | Component | Quantity | Key Specifications | Notes |
| :--- | :--- | :--- | :--- | :--- |
| SSR1-8| Solid-State Relay | 8 | Omron G3MB-202P (5V) | Logic-level input (5V), 2A @ 240V AC output. Zero-crossing feature is critical for switching AC solenoids to reduce noise. |
| R1-8 | Current-Limiting Resistor | 8 | 220Ω, 1/4W | For the input-side LED of each SSR, controlled by the MCP23017. |
| LED1-8| Status LED | 8 | 3mm Green LED | Provides visual feedback for each active zone. |

---

### **Connectors & Terminals**

| Part | Component | Quantity | Key Specifications | Notes |
| :--- | :--- | :--- | :--- | :--- |
| J1 | AC Power Input | 1 | 2-Pin Screw Terminal, 5.08mm | For connecting the 24V AC transformer. |
| J2 | Zone Outputs | 1 | 9-Pin Screw Terminal, 5.08mm | 8 terminals for zones, 1 for the common (C) wire. |
| J3 | Sensor Input | 1 | 4-Pin Screw Terminal, 3.5mm | For optional rain sensors or flow meters (e.g., VCC, GND, S1, S2). |

---

### **Passive Components & ICs**

| Part | Component | Quantity | Key Specifications | Notes |
| :--- | :--- | :--- | :--- | :--- |
| R9, R10| Pull-up Resistors | 2 | 4.7kΩ, 1/4W | For the I2C bus lines (SDA, SCL) of the MCP23017. |
| C1, C2| Decoupling Capacitor | 2 | 0.1µF, 50V Ceramic | Placed near the VCC pins of the ESP32 and MCP23017 for power stability. |
| C3 | Bulk Capacitor | 1 | 100µF, 25V Electrolytic | For smoothing the main 5V DC rail after the regulator. |

---

### **Disclaimer**
- This BOM is a template. Component selection may vary based on final PCB design, enclosure, and specific feature requirements.
- Working with AC voltage is dangerous. Ensure all safety precautions are taken. The power supply section should be properly isolated from the low-voltage logic.
- Always check component datasheets for pinouts, voltage/current ratings, and application circuits before assembly.
