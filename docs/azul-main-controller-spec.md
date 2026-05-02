# Azul Main Controller Project Specification

**Date:** May 2, 2026

## Project Overview
This document outlines the technical design for the "Main Controller"—the central, mains-powered hub of the Azul irrigation system. It directly controls wired irrigation zones, communicates with the backend server via Wi-Fi, and acts as the master gateway for the LoRa mesh network to manage remote Zone Extenders.

## 1. System Architecture
*   **Microcontroller:** ESP32 (e.g., ESP32-DevKitC-v4).
*   **Communication:**
    *   **Wi-Fi:** Primary connection to the local network for communication with the backend server.
    *   **LoRa (915MHz):** Acts as the master gateway for the Zone Extender mesh network.
    *   **Bluetooth:** Available for initial setup or local diagnostics.
*   **I/O Expansion:** Utilizes an I2C I/O Expander (e.g., Microchip MCP23017) to manage the high number of zone outputs and sensor inputs efficiently.

## 2. Power Supply
*   **Input Voltage:** Standard 24V AC from an external sprinkler transformer.
*   **Onboard Conversion:** An integrated AC-DC switching converter (e.g., Hi-Link HLK-PM01) provides a stable 5V DC for the logic circuits.
*   **Protection:** The power supply circuit includes fuse and MOV (Metal Oxide Varistor) protection against overcurrent events and voltage surges.

## 3. Zone Control
*   **Capacity:** Controls up to 8 standard 24V AC irrigation solenoids.
*   **Switching:** Uses highly reliable solid-state relays (SSRs) with zero-crossing features to switch the AC loads, minimizing electrical noise and mechanical wear.
*   **Status Indication:** Each zone output is equipped with an LED for visual feedback on its current state (on/off).

## 4. Physical Design
*   **Enclosure:** Housed in a standard, wall-mountable project enclosure designed for indoor installation (e.g., in a garage or shed).
*   **Wiring Access:** Features externally accessible screw terminals for all necessary connections:
    *   24V AC Power Input
    *   Zone Outputs (1-8)
    *   Common Wire (C)
    *   Sensor Inputs (e.g., for a rain sensor)

## 5. LoRa Gateway Function
*   **Master Gateway Role:** This controller *is* the master gateway for the entire LoRa mesh network.
*   **Antenna:** Equipped with a high-gain external LoRa antenna to maximize range and ensure reliable communication with all Zone Extenders on the property.
*   **Command & Control:** It receives commands from the backend server via Wi-Fi and relays them to the appropriate Zone Extender over the LoRa mesh.
*   **Data Collection:** It continuously listens for heartbeat messages and telemetry data (flow rates, battery status) from remote extenders and forwards this information to the backend for processing and user alerts.

## 6. Primary Component List
*   **MCU:** ESP32-DevKitC-v4.
*   **I/O Expander:** Microchip MCP23017.
*   **LoRa Transceiver:** Semtech SX1262.
*   **Power Supply:** Hi-Link HLK-PM01 or similar AC-DC module.
*   **Zone Relays:** 8x Solid-State Relays (e.g., Omron G3MB-202P).
*   **Connectors:** Screw Terminals for all external wiring.
