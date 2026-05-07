# Milestone 7: Wi-Fi Connectivity & Web Request

### Objective
Validate the ESP32-S3's ability to connect to a standard Wi-Fi network and retrieve data from a public internet API. This is the core function of the Main Controller's cloud communication link.

### Key Steps
- ⚪ Configure the firmware with local Wi-Fi credentials.
- ⚪ Write and flash firmware to connect to the Wi-Fi network.
- ⚪ Use the `HTTPClient` library to perform a GET request to a public API.
- ⚪ Print the response to the serial monitor.

### Verification
- ⚪ The ESP32 successfully connects to the local Wi-Fi network.
- ⚪ The serial monitor displays the JSON payload retrieved from the worldtimeapi.org server, confirming a successful internet connection.

---

### Detailed Instructions

This test can be performed on **either Node A or Node B**.

- ⚪ **1. Create a New Project:**
    - ⚪ Create a new PlatformIO project named `PoC-WiFi-Test`.

- ⚪ **2. Write the Wi-Fi Code:**
    - ⚪ Open `src/main.cpp` and replace its contents with the code below.
    - ⚪ **IMPORTANT:** Replace `"YOUR_WIFI_SSID"` and `"YOUR_WIFI_PASSWORD"` with your actual local Wi-Fi network credentials.

    ```cpp
    #include <Arduino.h>
    #include <WiFi.h>
    #include <HTTPClient.h>

    const char* ssid = "YOUR_WIFI_SSID";
    const char* password = "YOUR_WIFI_PASSWORD";

    void setup() {
      Serial.begin(115200);
      delay(1000);

      Serial.print("Connecting to WiFi...");
      WiFi.begin(ssid, password);
      while (WiFi.status() != WL_CONNECTED) {
        delay(500);
        Serial.print(".");
      }
      Serial.println("
Connected to WiFi!");
      Serial.print("IP Address: ");
      Serial.println(WiFi.localIP());

      HTTPClient http;
      Serial.println("Fetching time from web API...");
      
      // Target URL
      if (http.begin("http://worldtimeapi.org/api/ip")) {
        int httpCode = http.GET();
        if (httpCode > 0) {
          // Success
          String payload = http.getString();
          Serial.println("
--- API RESPONSE ---");
          Serial.println(payload);
          Serial.println("--- END ---");
        } else {
          // Error
          Serial.printf("HTTP GET failed, error: %s
", http.errorToString(httpCode).c_str());
        }
        http.end();
      } else {
        Serial.println("Failed to connect to URL.");
      }
      Serial.println("Test complete.");
    }

    void loop() {
      // Nothing to do in the loop
    }
    ```

- ⚪ **3. Upload and Test:**
    - ⚪ Click the **"Upload and Monitor"** button in the PlatformIO status bar.
    - ⚪ **Verification:** The serial monitor shows a successful Wi-Fi connection, prints the device's IP address, and then displays a JSON string containing the current time and date.
