# Milestone 6: Full System Integration Test

### Objective
Demonstrate the complete end-to-end functionality of the Azul system by integrating all previously validated subsystems into a single, cohesive application.

### Key Steps
- ⚪ **Node B (Controller) Firmware:** Integrate the LoRa "Sender" and Pushbutton code.
- ⚪ **Node A (Extender) Firmware:** Integrate the "Tap-to-Wake," LoRa "Receiver," and DC Latching Control code.
- ⚪ Flash the final firmware to each respective node.
- ⚪ Perform a live, end-to-end test of the remote control functionality.

### Verification
- ⚪ The Zone Extender (Node A) is tapped to wake it from deep sleep.
- ⚪ The button on the Main Controller (Node B) is pressed.
- ⚪ The DC latching solenoid connected to the Zone Extender audibly "clicks" open.
- ⚪ The button on the Main Controller is released.
- ⚪ The DC latching solenoid audibly "clacks" closed.

---

### Detailed Instructions

This is the final integration test.

---

### **Node B Firmware: Main Controller**

- ⚪ **1. Create Project & Install Library:**
    - ⚪ Create a new PlatformIO project named `PoC-Controller-Firmware`.
    - ⚪ Add `lib_deps = jgromes/RadioLib@^6.4.0` to `platformio.ini`.

- ⚪ **2. Write Final Controller Code:**
    - ⚪ Replace the contents of `src/main.cpp` with the provided code.

    ```cpp
    #include <Arduino.h>
    #include <RadioLib.h>

    #define BUTTON_PIN 2
    SX1262 radio = new Module(10, 2, 9, 14); // NSS, DIO1, NRST, BUSY

    void setup() {
      Serial.begin(115200);
      pinMode(BUTTON_PIN, INPUT);
      
      Serial.println("Initializing Main Controller...");
      int state = radio.begin(915.0, 125.0, 9, 7, 0x12, 14, 8);
      if (state != RADIOLIB_ERR_NONE) {
        Serial.print("LoRa failed, code ");
        Serial.println(state);
        while (true);
      }
    }

    void loop() {
      if (digitalRead(BUTTON_PIN) == HIGH) {
        Serial.println("Button pressed. Sending ON command.");
        radio.transmit("ON");
        while(digitalRead(BUTTON_PIN) == HIGH) { delay(50); }
        Serial.println("Button released. Sending OFF command.");
        radio.transmit("OFF");
      }
      delay(100);
    }
    ```

---

### **Node A Firmware: Zone Extender**

- ⚪ **1. Create Project & Install Library:**
    - ⚪ Create a new PlatformIO project named `PoC-Extender-Firmware`.
    - ⚪ Add `lib_deps = jgromes/RadioLib@^6.4.0` to `platformio.ini`.

- ⚪ **2. Write Final Extender Code:**
    - ⚪ Replace `src/main.cpp` with the provided code.
    - ⚪ **Important:** Copy the `latchSolenoid()` and `unlatchSolenoid()` function bodies from Milestone 4 into the placeholders.

    ```cpp
    #include <Arduino.h>
    #include <RadioLib.h>

    #define WAKE_PIN     GPIO_NUM_4
    #define H_BRIDGE_IN1 15
    #define H_BRIDGE_IN2 16
    #define PULSE_DURATION 100
    SX1262 radio = new Module(10, 2, 9, 14); // NSS, DIO1, NRST, BUSY

    void latchSolenoid() { /* Copy function body from M4 here */ }
    void unlatchSolenoid() { /* Copy function body from M4 here */ }

    void goToSleep() {
      Serial.println("Entering deep sleep.");
      esp_sleep_enable_ext0_wakeup(WAKE_PIN, 0);
      esp_deep_sleep_start();
    }

    void setup() {
      Serial.begin(115200);
      delay(1000);
      Serial.println("Zone Extender Booting...");

      pinMode(H_BRIDGE_IN1, OUTPUT);
      pinMode(H_BRIDGE_IN2, OUTPUT);

      int state = radio.begin(915.0, 125.0, 9, 7, 0x12, 14, 8);
      if (state != RADIOLIB_ERR_NONE) {
        goToSleep();
      }

      Serial.println("Listening for command...");
      String str;
      state = radio.receive(str, 15000); // Listen for 15 seconds

      if (state == RADIOLIB_ERR_NONE) {
        Serial.print("Received command: '");
        Serial.print(str);
        Serial.println("'");
        if (str == "ON") { latchSolenoid(); } 
        else if (str == "OFF") { unlatchSolenoid(); }
      } else {
        Serial.println("No command received or error.");
      }
      
      goToSleep();
    }

    void loop() { }
    ```

---

### **Final Verification**

- ⚪ **1. Upload Firmware:**
    - ⚪ Flash the **Controller** firmware to Node B.
    - ⚪ Flash the **Extender** firmware to Node A.

- ⚪ **2. Power and Test:**
    - ⚪ Power the Extender (Node A) with its battery pack and the Controller (Node B) via USB.
    - ⚪ **Tap** the vibration sensor on the Extender.
    - ⚪ **Press and hold** the button on the Controller.
    - ⚪ **Verification:** The solenoid on the Extender clicks open.
    - ⚪ **Release** the button on the Controller.
    - ⚪ **Verification:** The solenoid on the Extender clacks closed.
    - ⚪ **Verification:** The Extender's serial monitor prints "Entering deep sleep."
