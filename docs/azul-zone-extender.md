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
*  **Wakeup Events**
     - The zone extender wakes up for only two event types
       - Watering events
         - A perticular zone needs to be activated or deactivated
         - LoRa radio pings
           - The zone extender wakes on a few times a day to check with the it's lead controller needs to talk with it.  For example, if the lead controller for a zone extender needs to update the watering schedule
### ESP32-S3 Power Management Overview

The ESP32-S3 is designed with a sophisticated power management system that balances high-performance processing for the **Azul project** with the energy conservation required for remote, battery-powered irrigation nodes.

#### **The Four Primary Power Modes**

The system operates in distinct modes, each disabling different internal components to save power:

*   **Active Mode**: Everything is powered on, including both CPU cores, Wi-Fi, and Bluetooth. This is necessary when actively processing **RS485 flow meter** data or transmitting over **915MHz LoRa**.
*   **Modem-sleep Mode**: The CPU remains active, but the Wi-Fi and Bluetooth radios are powered down. This is the default state when performing local logic without needing to communicate with the **React Native** dashboard.
*   **Light-sleep Mode**: The CPU is "paused" (clock-gated), and the digital peripherals and RAM are kept in a low-power state. Upon waking via a timer or GPIO trigger, the program resumes exactly where it left off.
*   **Deep-sleep Mode**: This is the most efficient state for valve controllers. The CPUs and most RAM are powered off. Only the **ULP (Ultra-Low-Power) co-processor** and the **RTC (Real-Time Clock)** memory remain active.

---

#### **The ULP Co-processor and RTC Memory**

The ULP is a powerful tool for the **Azul** architecture:
*   **Persistent Data**: Critical state information, such as current watering cycle progress, can be stored in **RTC Slow Memory**, which survives a Deep-sleep cycle.
*   **Autonomous Monitoring**: The ULP can monitor sensors like soil moisture probes and only "wake up" the main high-power CPUs if a specific threshold is met, drastically extending battery life.

#### **Wakeup Sources**

The ESP32-S3 can be brought out of Deep-sleep by several triggers:
*   **Timers**: Waking up periodically to check in with the server.
*   **Ext0/Ext1 (GPIO)**: Waking up when a physical button is pressed or a flow meter sends a pulse.
*   **Touch Sensors**: Using the internal capacitive touch pins.

#### **Automatic Light-sleep**

When using the ESP-IDF or PlatformIO with the Arduino framework, **Automatic Light-sleep** can be enabled. The system automatically enters a low-power state during "idle" periods—such as between LoRa transmissions—and wakes up just in time to handle the next scheduled task.

---

In **Deep-sleep mode**, the ESP32-S3 powers down the main CPU cores, but a small, specialized section of the chip called the **RTC (Real-Time Clock) Power Management Controller** remains energized.

### **The Role of the RTC Timer**

The most common way to handle scheduled events like irrigation zones is through the **RTC Timer**.

*   **Setting the Alarm**: Before entering Deep-sleep, the firmware calculates the time remaining until the next scheduled action (e.g., "wake up in 3600 seconds") and configures the RTC timer.
*   **Counting in the Dark**: While the main CPU cores are off, the RTC controller continues counting pulses from a dedicated low-power oscillator (usually 32.768 kHz).
*   **The Wakeup Trigger**: Once the timer reaches zero, the RTC controller sends a signal to the power management unit to restore power to the CPU and memory.

### **State Persistence via RTC Memory**

Because the standard SRAM is powered off during Deep-sleep, the CPU "forgets" where it was in the program. To handle your **Azul irrigation** logic effectively, the system uses **RTC Slow Memory**:

*   **Storing Variables**: You can tag specific variables (like `current_zone_index` or `remaining_water_time`) with a special attribute so they are stored in this persistent memory.
*   **Context Restoration**: When the chip wakes up, it checks these variables to determine if it should turn a zone **ON** or if it woke up specifically to turn a zone **OFF**.

### **The ULP Co-processor (The "Security Guard")**

If your logic is more complex—such as monitoring for a "stop" signal from a **LoRa** gateway or a pulse from an **RS485 flow meter**—you can use the **ULP (Ultra-Low-Power) co-processor**.

*   **Autonomous Decisions**: The ULP can run very simple instructions while the main CPU sleeps. 
*   **Conditional Wakeup**: It can be programmed to wake the main CPU only if a specific condition is met, such as a sensor value exceeding a threshold or a specific pin state change.

### **Deep-sleep Workflow for Azul**

1.  **Calculate**: The firmware determines the next "event" time.
2.  **Save**: Critical state data is written to **RTC Slow Memory**.
3.  **Configure**: The **RTC Timer** or **GPIO Wakeup** is set.
4.  **Sleep**: The main CPU and radios shut down to conserve battery.
5.  **Wake**: The RTC controller restores power; the CPU boots and reads the state from RTC memory to resume the irrigation cycle.

--- 
The following is the markdown documentation for the **ESP32-S3** Deep-sleep API, tailored for the **Azul irrigation project**.

---

## **ESP32-S3 Deep-sleep API Guide**

To implement efficient power management in your firmware, you use the **ESP-IDF** power management API. The process follows a "Configure, then Sleep" pattern.

### **1. Basic Sleep Commands**

| Function | Description |
| :--- | :--- |
| `esp_sleep_enable_timer_wakeup(uint64_t time_in_us)` | Sets the RTC timer to wake the CPU after a specific duration (in microseconds). |
| `esp_sleep_enable_ext0_wakeup(gpio_num_t gpio_num, int level)` | Wakes the CPU when a specific GPIO pin hits a defined logic level (High/Low). |
| `esp_deep_sleep_start()` | The "point of no return" command that shuts down the CPU and enters Deep-sleep mode. |

### **2. Preserving State with RTC Memory**

Because standard SRAM is powered off during Deep-sleep, you must use the `RTC_DATA_ATTR` attribute to ensure your irrigation variables survive the reboot.

```cpp
// This variable is stored in RTC Slow Memory and survives Deep-sleep
RTC_DATA_ATTR int zone_cycle_count = 0; 

void start_sleep_cycle(uint32_t seconds) {
    // Convert seconds to microseconds
    uint64_t sleep_time_us = (uint64_t)seconds * 1000000;
    
    // Configure the RTC controller to wake up the main CPU
    esp_sleep_enable_timer_wakeup(sleep_time_us);
    
    // Power down
    esp_deep_sleep_start();
}
```

### **3. Application Logic: The Wakeup Flow**

When the ESP32-S3 wakes up from Deep-sleep, it goes through a **warm boot**. It does *not* resume from the next line of code; it restarts from `setup()`.



*   **Initialization**: The CPU checks the wakeup cause using `esp_sleep_get_wakeup_cause()`.
*   **Context Restoration**: The firmware reads values from `RTC_DATA_ATTR` variables to decide if it should turn a valve **ON** or **OFF**.
*   **Security Check**: If **Secure Boot** or **Flash Encryption** are enabled, the hardware re-verifies the firmware integrity during this boot phase.

### **4. Impact on Communication**

*   **LoRa & Wi-Fi**: All radio states are lost. You must re-initialize your **915MHz LoRa** stack or Wi-Fi credentials upon every wakeup if you need to report data to the **React Native** dashboard.
*   **Peripherals**: Digital pins (GPIO) usually return to a high-impedance state unless you explicitly "hold" them using `gpio_hold_en()` before sleeping. This is critical for keeping an irrigation valve relay in a specific state while the CPU is asleep.

---

> **Architect's Note:** For the **Azul project**, using the RTC timer is the most reliable way to manage zone timing at your **3,000-foot elevation** site, especially when trying to maximize battery life across seasons.


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
