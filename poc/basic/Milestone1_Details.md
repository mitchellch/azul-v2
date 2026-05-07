# Milestone 1: Board Bring-up

### Objective
Confirm the development environment is working correctly and that firmware can be successfully compiled and flashed to the ESP32-S3 development kits.

### Key Steps
- ⚪ Install the ESP32-S3 toolchain (drivers, PlatformIO or Arduino IDE extensions).
- ⚪ Load the basic "Blink" example sketch onto both dev kits.
- ⚪ Modify the blink rate (e.g., to 200ms on, 800ms off) and re-flash to confirm the entire development cycle is functional.

### Verification
- ⚪ The onboard LED on each ESP32-S3 device blinks at the custom-defined rate.

---

### Detailed Instructions

This guide assumes you are using **Visual Studio Code** with the **PlatformIO IDE** extension.

- ⚪ **1. Install PlatformIO IDE:**
    - ⚪ Open VS Code.
    - ⚪ Go to the Extensions view.
    - ⚪ Search for `PlatformIO IDE` and click **Install**.
    - ⚪ Restart VS Code.

- ⚪ **2. Create a New Project:**
    - ⚪ From the PlatformIO Home screen, click **"+ New Project"**.
    - ⚪ Set Name to `PoC-Bring-up`.
    - ⚪ Set Board to `ESP32-S3-DevKitC-1-N8R8`.
    - ⚪ Set Framework to `Arduino`.
    - ⚪ Click **Finish**.

- ⚪ **3. Write the Blink Code:**
    - ⚪ Navigate to `src/main.cpp`.
    - ⚪ Replace the default code with the provided "Blink" sketch.

    ```cpp
    #include <Arduino.h>

    // The ESP32-S3 DevKit has an onboard RGB LED on GPIO 48
    #define ONBOARD_LED 48

    void setup() {
      // Configure the LED pin as an output
      pinMode(ONBOARD_LED, OUTPUT);
    }

    void loop() {
      // Turn the LED on (HIGH is the voltage level)
      digitalWrite(ONBOARD_LED, HIGH);
      delay(200); // Wait for 200 milliseconds
      // Turn the LED off by making the voltage LOW
      digitalWrite(ONBOARD_LED, LOW);
      delay(800); // Wait for 800 milliseconds
    }
    ```

- ⚪ **4. Connect and Upload (Board 1):**
    - ⚪ Connect the first ESP32-S3 to your computer.
    - ⚪ Click the **"Upload"** button in the PlatformIO status bar.
    - ⚪ **Verification:** Observe the onboard RGB LED blinking.

- ⚪ **5. Connect and Upload (Board 2):**
    - ⚪ Connect the second ESP32-S3 to your computer.
    - ⚪ Click the **"Upload"** button again.
    - ⚪ **Verification:** Observe the second board's LED blinking correctly.
