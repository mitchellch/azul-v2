# Milestone 4: DC Latching Control

### Objective
Validate the Zone Extender's ability to control a DC latching solenoid by sending reverse-polarity pulses using an H-Bridge driver module.

### Key Steps
- ⚪ Connect the L298N module's logic pins (`IN1`, `IN2`) to the ESP32 (`GPIO 15/16`).
- ⚪ Connect the L298N's power pins to an external 9V battery and share a common `GND` with the ESP32.
- ⚪ Connect the DC latching solenoid to the L298N's motor output terminals.
- ⚪ Write and flash firmware to send timed forward and reverse pulses to the L298N.

### Verification
- ⚪ The latching solenoid makes a distinct "click" sound (latch) immediately upon boot.
- ⚪ The solenoid makes a second, distinct "clack" sound (unlatch) 5 seconds later.

---

### Detailed Instructions

This test should be performed on **Node A (Zone Extender)**.

- ⚪ **1. Create a New Project:**
    - ⚪ Create a new PlatformIO project named `PoC-DC-Control`.

- ⚪ **2. Wire the Components:**
    - ⚪ Connect L298N `IN1` to ESP32 `GPIO 15`.
    - ⚪ Connect L298N `IN2` to ESP32 `GPIO 16`.
    - ⚪ Connect L298N `+12V` terminal to the 9V battery's `+` wire.
    - ⚪ Connect L298N `GND` terminal to both the 9V battery's `-` wire AND a `GND` pin on the ESP32 (common ground).
    - ⚪ Remove the yellow power jumper from the L298N if present.
    - ⚪ Connect the two solenoid wires to the `OUT1` and `OUT2` screw terminals.

- ⚪ **3. Write the Control Code:**
    - ⚪ Open `src/main.cpp` and replace the contents with the provided code.

    ```cpp
    #include <Arduino.h>

    #define H_BRIDGE_IN1 15
    #define H_BRIDGE_IN2 16
    #define PULSE_DURATION 100

    void latchSolenoid() {
      Serial.println("Sending LATCH (open) pulse...");
      digitalWrite(H_BRIDGE_IN1, HIGH);
      digitalWrite(H_BRIDGE_IN2, LOW);
      delay(PULSE_DURATION);
      digitalWrite(H_BRIDGE_IN1, LOW);
      digitalWrite(H_BRIDGE_IN2, LOW);
    }

    void unlatchSolenoid() {
      Serial.println("Sending UNLATCH (close) pulse...");
      digitalWrite(H_BRIDGE_IN1, LOW);
      digitalWrite(H_BRIDGE_IN2, HIGH); // Reversed
      delay(PULSE_DURATION);
      digitalWrite(H_BRIDGE_IN1, LOW);
      digitalWrite(H_BRIDGE_IN2, LOW);
    }

    void setup() {
      Serial.begin(115200);
      delay(1000);
      Serial.println("DC Latching Solenoid Test");

      pinMode(H_BRIDGE_IN1, OUTPUT);
      pinMode(H_BRIDGE_IN2, OUTPUT);
      digitalWrite(H_BRIDGE_IN1, LOW);
      digitalWrite(H_BRIDGE_IN2, LOW);
      
      latchSolenoid();
      delay(5000); // Wait 5 seconds
      unlatchSolenoid();
      Serial.println("Test complete.");
    }

    void loop() { }
    ```

- ⚪ **4. Upload and Test:**
    - ⚪ Click the **"Upload and Monitor"** button.
    - ⚪ **Verification:** As the board resets, the solenoid "clicks" open.
    - ⚪ **Verification:** Five seconds later, the solenoid "clacks" closed.

### Wiring Diagram
```mermaid
graph TD
    subgraph "Node A: Zone Extender"
        ESP32(ESP32-S3 Dev Kit)
    end

    subgraph "External Power"
        Battery("9V Battery")
    end

    subgraph "Driver"
        DriverModule(L298N Module)
    end
    
    subgraph "Load"
        Solenoid("DC Latching Solenoid")
    end

    %% Connections
    ESP32 -- "GPIO 15" --> DriverModule -- "IN1"
    ESP32 -- "GPIO 16" --> DriverModule -- "IN2"
    ESP32 -- "GND" --> DriverModule -- "GND"
    
    Battery -- "+ Wire" --> DriverModule -- "+12V"
    Battery -- "- Wire" --> DriverModule -- "GND"
    
    DriverModule -- "OUT1" --> Solenoid
    DriverModule -- "OUT2" --> Solenoid

    style Battery fill:#f9f,stroke:#333,stroke-width:2px
```
