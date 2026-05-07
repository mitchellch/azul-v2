# Azul Zone Extender Project Specification

**Date:** May 2, 2026

## Project Overview
This document outlines the technical design for a "Zone Extender"—a headless, battery-operated DC latching irrigation controller designed for areas without existing wiring. The unit communicates primarily via LoRa signals and is engineered for robust deployment in high-flood-risk environments, specifically within the Sierra Nevada foothills. It focuses on autonomous operation, efficient power management, and resilient physical protection.

## 1. System Architecture
*   **Microcontroller:** ESP32-S3 (Utilizing Deep Sleep and Real-Time Clock (RTC) for autonomous schedule execution).
*   **Communication:**
    *   **LoRa (915MHz):** Primary channel for mesh telemetry, configuration, and status updates.
    *   **Bluetooth 5.0 (LE):** Used for local diagnostics, manual overrides, and on-site data access.
*   **Actuation:** Supports DC Latching Solenoids via an H-Bridge motor driver (e.g., DRV8833).
*   **Connectivity Logic:**
    *   Autonomous "headless" mode: Executes stored schedules locally even if the LoRa link to the main controller is lost.
    *   Heartbeat Protocol: Periodic check-ins with the main controller to monitor system health and battery status.

## 2. Power Management & Wireless Charging
*   **Target Battery Life:** Minimum 1 year (Estimated annual consumption: ~635 mAh).
*   **Battery Type:** LiFePO4 (Selected for temperature stability, longevity, and performance at 3,000 ft elevation).
*   **Capacity Recommendation:** 2,500mAh to 3,000mAh pack (e.g., 18650 cells).
*   **Power Saving:** Ultra-Low Power (ULP) deep sleep (~10µA); event-driven wake cycles for efficiency.
*   **Charging Method (Primary):** Qi Wireless Induction.
    *   **Primary Hardware:** Ridge 5-in-1 Magnetic Power Bank (The Bundler).
    *   **Alignment:** Internal MagSafe-compatible magnet rings for auto-alignment through the case wall.
    *   **Workflow:** Zero-contact top-off to maintain IP68 seal integrity. Unit is removed from valve box and placed on an indoor Qi pad (or on-site with portable bank) for annual recharge. The 10,000mAh capacity of the Ridge bank provides ample overhead to overcome ~30% induction energy loss.

## 3. Physical Protection & Environmental Design
*   **Enclosure Rating:** IP68 (Rated for continuous submersion to handle valve box flooding).
*   **Recommended Cases:** Takachi WG/WGPC Series (ASA/Polycarbonate), Polycase ML Series, Bud Industries PN-A Series.
*   **Sealing Strategy:**
    *   No external ports; entirely sealed with internal wireless charging.
    *   IP68-rated cable glands for permanent solenoid and flow-meter wiring exits.
*   **Environmental Control:** Internal desiccant packs to mitigate condensation in the Sierra Nevada foothills (3,000 ft elevation).

## 4. Mesh Network Configuration
*   **Master Gateway:** Garage-mounted unit with Wi-Fi backhaul and high-gain LoRa antenna.
*   **Node Roles:** Distinction between Mains-powered "Always-On" indoor relays and Battery-powered "Deep-Sleep" end-nodes/extenders.
*   **Dynamic Routing:** Support for intermediate repeaters to bypass topographical obstacles (hills/trees) in the foothills.
*   **Store and Forward:** Intermediate nodes buffer packets if the Master Gateway is temporarily unreachable.
*   **Protocol:** Implementation of a collision-avoidance mesh (e.g., RadioHead Mesh) to ensure packet delivery from remote valve boxes.

## 5. Hybrid Synchronization Protocol
*   **Piggyback Messaging:** Primary telemetry (flow rate, battery) is sent during active solenoid toggle events.
*   **Daily Heartbeat:** A single scheduled 24-hour wake-up to verify link integrity and synchronize RTC.
*   **Command Pull:** Schedule updates queued on the Gateway are "pulled" by the node during its next active window.
*   **Isolation:** Unique Sync Word and AES-128 encryption to prevent interference with neighboring systems.

## 6. Notification & Fail-Safes
*   **Connectivity Loss:** Automated notifications sent via Gmail/Slack to landscape/homeowner if heartbeat check-ins fail.
*   **Low Battery:** Unit alerts user at 20% capacity.
*   **Solenoid Protection:** Logic to ensure valves fail-closed if the battery hits a critical cutoff to prevent continuous watering.
*   **Maintenance:** Unit alerts when battery reaches 20% capacity, prompting removal from valve box for annual recharge on an indoor Qi pad.

## 7. Local Diagnostic Mode
*   **BLE Trigger:** Magnetic reed switch wake-up to enable Bluetooth LE without opening case.
*   **Local Data:** Current RSSI, SNR, Battery Voltage, and Flow Log available via the mobile app.
*   **Remote Logging:** Mesh logs are pushed to an Obsidian vault for long-term health tracking.

## 8. Primary Component List
*   **MCU:** ESP32-S3-DevKitC-1.
*   **LoRa Transceiver:** Semtech SX1262.
*   **Flow Meter:** RS485 Industrial Flow Meter.
*   **Power Bank:** Ridge Magnetic "Bundler" Power Bank.
*   **Hardware:** IP68 Cable Glands.
