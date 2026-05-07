# Milestone 5: LoRa Link

### Objective
Establish a basic, reliable, and bi-directional communication link between the two nodes using the SX1262 LoRa modules.

### Key Steps
- ⚪ Wire the SX1262 LoRa modules to both ESP32 development kits via the SPI bus.
- ⚪ Install the **RadioLib** library in your development environment.
- ⚪ Load and configure the "Sender" example sketch onto Node A.
- ⚪ Load and configure the "Receiver" example sketch onto Node B.

### Verification
- ⚪ The Receiver node (Node B) prints "Packet received!", message content, and RSSI value to the serial monitor each time the Sender node (Node A) transmits.

---

### Detailed Instructions

This test requires **both Node A and Node B** to be set up and programmed.

- ⚪ **1. Create Project & Add Library:**
    - ⚪ Create a new PlatformIO project named `PoC-LoRa-Link`.
    - ⚪ Open `platformio.ini` and add `lib_deps = jgromes/RadioLib@^6.4.0`.

- ⚪ **2. Wire Both Modules:**
    - ⚪ Wire the SX1262 module to **each** ESP32 board per the diagram.

- ⚪ **3. Program the Sender (Node A):**
    - ⚪ Open `src/main.cpp` and replace the contents with the **Sender** code.
    - ⚪ Upload the code to Node A and open the Serial Monitor.
    - ⚪ **Verification:** See "Transmitting packet..." printed every 5 seconds.

    ```cpp
    #include <Arduino.h>
    #include <RadioLib.h>

    SX1262 radio = new Module(10, 2, 9, 14); // NSS, DIO1, NRST, BUSY

    void setup() {
      Serial.begin(115200);
      delay(1000);
      Serial.println("Initializing LoRa Sender...");
      int state = radio.begin(915.0, 125.0, 9, 7, 0x12, 14, 8);
      if (state != RADIOLIB_ERR_NONE) {
        Serial.print("LoRa Sender failed, code ");
        Serial.println(state);
        while (true);
      }
    }

    void loop() {
      Serial.print("Transmitting packet... ");
      radio.transmit("Hello World!");
      delay(5000);
    }
    ```

- ⚪ **4. Program the Receiver (Node B):**
    - ⚪ Create a second PlatformIO project (e.g., `PoC-LoRa-Receiver`) and add RadioLib.
    - ⚪ Open its `src/main.cpp` and replace the contents with the **Receiver** code.
    - ⚪ Upload the code to Node B and open the Serial Monitor.
    - ⚪ **Verification:** See "Packet received! Data: 'Hello World!' RSSI: ..." printed every 5 seconds.

    ```cpp
    #include <Arduino.h>
    #include <RadioLib.h>

    SX1262 radio = new Module(10, 2, 9, 14); // NSS, DIO1, NRST, BUSY

    void setup() {
      Serial.begin(115200);
      delay(1000);
      Serial.println("Initializing LoRa Receiver...");
      int state = radio.begin(915.0, 125.0, 9, 7, 0x12, 14, 8);
      if (state != RADIOLIB_ERR_NONE) {
        Serial.print("LoRa Receiver failed, code ");
        Serial.println(state);
        while (true);
      }
      Serial.println("Listening for LoRa packets...");
    }

    void loop() {
      String str;
      int state = radio.receive(str);
      if (state == RADIOLIB_ERR_NONE) {
        Serial.print("Packet received! Data: '");
        Serial.print(str);
        Serial.print("' RSSI: ");
        Serial.print(radio.getRSSI());
        Serial.println(" dBm");
      }
    }
    ```

### Wiring Diagram
```mermaid
graph TD
    subgraph "Controller"
        A(ESP32-S3 DevKit)
    end

    subgraph "Radio"
        B(SX1262 LoRa Module)
    end

    %% Connections
    A -- "3.3V Pin" --> B -- "VCC"
    A -- "GND Pin" --> B -- "GND"

    A -- "GPIO 11" --> B -- "MOSI"
    A -- "GPIO 13" --> B -- "MISO"
    A -- "GPIO 12" --> B -- "SCK"
    A -- "GPIO 10" --> B -- "NSS (CS)"
    
    A -- "GPIO 14" --> B -- "BUSY"
    A -- "GPIO 2" --> B -- "DIO1"
    A -- "GPIO 9" --> B -- "NRST"

    style B fill:#ccf,stroke:#333,stroke-width:2px
```
