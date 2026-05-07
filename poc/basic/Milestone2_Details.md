# Milestone 2: AC Solenoid Control

### Objective
Validate the Main Controller's primary function of safely switching a 24V AC load using a Solid-State Relay (SSR) triggered by a GPIO pin.

### Key Steps
- ⚪ Wire the pushbutton (with a 10kΩ pull-down resistor) to `GPIO 2`.
- ⚪ Wire the SSR's DC input to `GPIO 5`.
- ⚪ Safely connect the 24V AC adapter and solenoid through the SSR's AC terminals.
- ⚪ Write and flash firmware to read the button state and toggle the SSR's GPIO pin.

### Verification
- ⚪ The 24V AC solenoid audibly "clicks" on and off in perfect sync with the manual button presses.

---

### Detailed Instructions

This test should be performed on **Node B (Main Controller)**.

- ⚪ **1. Create a New Project:**
    - ⚪ Create a new PlatformIO project named `PoC-AC-Control`.

- ⚪ **2. Wire the Components:**
    - ⚪ **Button:** Connect one leg to `3.3V`, the diagonal leg to `GPIO 2` AND a 10kΩ resistor, and the other end of the resistor to `GND`.
    - ⚪ **SSR:** Connect the SSR's `+` pin (Pin 3) to `GPIO 5` and its `-` pin (Pin 4) to `GND`.
    - ⚪ **AC Load:** Wire the 24V AC adapter and solenoid in series through the SSR's AC terminals (Pins 1 & 2).

- ⚪ **3. Write the Control Code:**
    - ⚪ Open `src/main.cpp` and replace the contents with the provided code.

    ```cpp
    #include <Arduino.h>

    // Define the GPIO pins we are using
    #define BUTTON_PIN 2
    #define SSR_PIN    5

    void setup() {
      Serial.begin(115200);
      Serial.println("AC Solenoid Control Test");
      pinMode(SSR_PIN, OUTPUT);
      digitalWrite(SSR_PIN, LOW);
      pinMode(BUTTON_PIN, INPUT);
    }

    void loop() {
      int buttonState = digitalRead(BUTTON_PIN);
      if (buttonState == HIGH) {
        digitalWrite(SSR_PIN, HIGH);
        Serial.println("Button Pressed - SSR ON");
      } else {
        digitalWrite(SSR_PIN, LOW);
      }
      delay(50);
    }
    ```

- ⚪ **4. Upload and Test:**
    - ⚪ Click the **"Upload and Monitor"** button.
    - ⚪ Press the pushbutton.
    - ⚪ **Verification:** "Button Pressed - SSR ON" appears in the monitor and the solenoid clicks on.
    - ⚪ Release the button.
    - ⚪ **Verification:** The message stops, and the solenoid clicks off.

### Wiring Diagram
```mermaid
graph TD
    subgraph "Node B: Main Controller"
        ESP32(ESP32-S3 Dev Kit)
    end
    
    subgraph "Input Circuit"
        Button(Pushbutton)
        Resistor(10kΩ Pull-down)
    end

    subgraph "Control"
        SSR(SSR: G3MB-202P)
    end

    subgraph "Load"
        Adapter("24V AC Adapter")
        Solenoid("AC Solenoid")
    end

    %% Connections
    ESP32 -- "3.3V Pin" --> Button
    J1((Junction)); style J1 fill:black,stroke:black
    Button -- "Signal Pin" --> J1
    J1 -- "to ESP32" --> ESP32 -- "Pin GPIO 2"
    J1 -- "to Resistor" --> Resistor
    Resistor -- "to ESP32" --> ESP32 -- "Pin GND"

    ESP32 -- "GPIO 5" --> SSR -- "Pin 3 (+)"
    ESP32 -- "GND" --> SSR -- "Pin 4 (-)"
    
    Adapter -- "AC Wire" --> SSR -- "Pin 1 (AC)"
    SSR -- "Pin 2 (AC)" --> Solenoid
    Solenoid -- "Common Wire" --> Adapter

    style Button fill:#f9f,stroke:#333,stroke-width:2px
    style Adapter fill:#f9f,stroke:#333,stroke-width:2px
```
