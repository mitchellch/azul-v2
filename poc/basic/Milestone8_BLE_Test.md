# Milestone 8: Bluetooth LE Server

### Objective
Validate the ESP32-S3's ability to function as a Bluetooth Low Energy (BLE) peripheral, create custom services and characteristics, and accept connections from a smartphone client. This is the core of the 'Tap-to-Wake' on-site maintenance feature.

### Key Steps
- ⚪ Write and flash firmware to initialize the ESP32 as a BLE server named "Azul-Test".
- ⚪ Define a custom service and a writable characteristic for controlling an LED.
- ⚪ Use a BLE scanner app on a smartphone to connect to the device.
- ⚪ Write a value to the characteristic to toggle the ESP32's onboard LED.

### Verification
- ⚪ The "Azul-Test" device is discoverable in the smartphone's BLE scanner app.
- ⚪ The app can connect to the device and discover the custom service/characteristic.
- ⚪ Writing a `1` to the characteristic turns the onboard LED ON.
- ⚪ Writing a `0` to the characteristic turns the onboard LED OFF.

---

### Detailed Instructions

This test can be performed on **either Node A or Node B**.

- ⚪ **1. Create a New Project:**
    - ⚪ Create a new PlatformIO project named `PoC-BLE-Test`.

- ⚪ **2. Write the BLE Server Code:**
    - ⚪ Open `src/main.cpp` and replace its contents with the code below. This code sets up a simple BLE server with one characteristic.

    ```cpp
    #include <Arduino.h>
    #include <BLEDevice.h>
    #include <BLEServer.h>
    #include <BLEUtils.h>

    #define ONBOARD_LED 48

    // See https://www.uuidgenerator.net/ to create your own
    #define SERVICE_UUID        "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
    #define CHARACTERISTIC_UUID "beb5483e-36e1-4688-b7f5-ea07361b26a8"

    class MyCallbacks: public BLECharacteristicCallbacks {
        void onWrite(BLECharacteristic *pCharacteristic) {
            std::string value = pCharacteristic->getValue();

            if (value.length() > 0) {
                if (value[0] == '1') {
                    digitalWrite(ONBOARD_LED, HIGH);
                    Serial.println("BLE Command: LED ON");
                } else if (value[0] == '0') {
                    digitalWrite(ONBOARD_LED, LOW);
                    Serial.println("BLE Command: LED OFF");
                }
            }
        }
    };

    void setup() {
      Serial.begin(115200);
      pinMode(ONBOARD_LED, OUTPUT);

      Serial.println("Starting BLE server...");

      BLEDevice::init("Azul-Test");
      BLEServer *pServer = BLEDevice::createServer();
      BLEService *pService = pServer->createService(SERVICE_UUID);
      
      BLECharacteristic *pCharacteristic = pService->createCharacteristic(
                                             CHARACTERISTIC_UUID,
                                             BLECharacteristic::PROPERTY_WRITE
                                           );
      pCharacteristic->setCallbacks(new MyCallbacks());
      
      pService->start();

      BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
      pAdvertising->addServiceUUID(SERVICE_UUID);
      BLEDevice::startAdvertising();
      Serial.println("BLE Server started. Now advertising as 'Azul-Test'...");
    }

    void loop() {
      // Nothing to do in the loop
      delay(2000);
    }
    ```

- ⚪ **3. Get a BLE Scanner App:**
    - ⚪ On your smartphone (iOS or Android), install a free BLE scanner application. **"nRF Connect for Mobile"** by Nordic Semiconductor is highly recommended and available on both platforms.

- ⚪ **4. Upload and Test:**
    - ⚪ Click the **"Upload and Monitor"** button.
    - ⚪ **Scan:** Open the nRF Connect app and pull down to scan for devices. You should see "Azul-Test" in the list.
    - ⚪ **Connect:** Tap the "Connect" button for your device.
    - ⚪ **Find Characteristic:** Navigate through the "Unknown Service" to find the "Unknown Characteristic" (with the UUID from the code).
    - ⚪ **Write:** Tap the "up" arrow on the characteristic to open the write dialog.
        - ⚪ Write a `01` (as a `BYTE` or `Hex`) to turn the LED on.
        - ⚪ Write a `00` to turn the LED off.
    - ⚪ **Verification:** The onboard LED on the ESP32 responds to the values you write from your phone.
