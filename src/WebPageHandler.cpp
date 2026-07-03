#include "WebPageHandler.h" // We are keeping the same header names so main.cpp doesn't break![cite: 6]
#include <WiFi.h>
#include <Firebase_ESP_Client.h>
#include <addons/TokenHelper.h> // Provide the token generation process info.
#include <addons/RTDBHelper.h>  // Provide the RTDB payload printing info and other helper functions.
#include <time.h> // For time functions, if needed for timestamping

// Provide the token generation process info.
#include "addons/TokenHelper.h"
// Provide the RTDB payload printing info and other helper functions.
#include "addons/RTDBHelper.h"

// Your Wi-Fi Credentials[cite: 5]
const char* ssid     = "motorola razr 40 ultra";
const char* password = "123456789";
unsigned long lastFirebaseCheck = 0; // Timestamp for the last Firebase check
String scheduledTime = ""; // Variable to hold the scheduled time from Firebase
bool scheduleTriggeredToday = false; // Flag to ensure the schedule only triggers once per day
unsigned long lastScheduleSync = 0; // Timestamp for the last schedule sync

// Your Firebase Database URL (Remove the https:// and trailing /)
#define DATABASE_URL "pet-feeder-eat-please-default-rtdb.europe-west1.firebasedatabase.app"

// Firebase Core Objects
FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig config;

// We need to declare the function from main.cpp so we can trigger it here
extern void runremoteAction(); 
extern void updateDisplay(const char* line1, const char* line2); // Declare the function to update the display

void RemoteCheckCommand(){
  if (Firebase.RTDB.getInt(&fbdo, "/feeder/feed_command")) {
      if (fbdo.intData() == 1) {
        Serial.println("[CLOUD] Remote Feed Triggered!");
        Firebase.RTDB.setInt(&fbdo, "/feeder/feed_command", 0);
        Firebase.RTDB.setString(&fbdo, "/feeder/feed_status", "SUCCESS");
        runremoteAction(); 
      }
    }
}

void CheckTime() {
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo, 10)) return; 
  
  char timeStringBuff[6]; 
  strftime(timeStringBuff, sizeof(timeStringBuff), "%H:%M", &timeinfo);
  String currentTime = String(timeStringBuff);

  // Strip the leading zero to match your website format
  if (currentTime.charAt(0) == '0') {
    currentTime = currentTime.substring(1);
  }

  // Poll Firebase every 10 seconds
  static unsigned long lastScheduleSync = 5000; 
  static int currentIndex = 0; 

  if (millis() - lastScheduleSync > 10000) {
    lastScheduleSync = millis();
    
    String timePath = "/feeder/scheduled_times/";
    timePath += currentIndex;
    timePath += "/time";
    
    String statusPath = "/feeder/scheduled_times/";
    statusPath += currentIndex;
    statusPath += "/status";

    if (Firebase.RTDB.getString(&fbdo, timePath)) {
      String scheduledTime = fbdo.stringData();
      
      // --- THE DEBUG PRINT ---
      // This prints to your terminal every 10 seconds so you KNOW it's reading!
      Serial.printf("[SCHEDULE] Round-Robin checked index %d. Found time: %s (Current ESP Time: %s)\n", currentIndex, scheduledTime.c_str(), currentTime.c_str());
      
      if (currentTime == scheduledTime && !scheduleTriggeredToday) {
        if (Firebase.RTDB.getString(&fbdo, statusPath)) {
          if (fbdo.stringData() == "SCHEDULED") {
            Serial.printf("[SCHEDULE] Time matches %s! Dispensing...\n", scheduledTime.c_str());
            Firebase.RTDB.setString(&fbdo, statusPath, "SUCCESS");
            runremoteAction(); 
            scheduleTriggeredToday = true; 
          }
        }
      }
      
      currentIndex++; 
      if (currentIndex >= 5) {
        currentIndex = 0; 
      }
    } else {
      currentIndex = 0; 
    }
  }

  static String lastCheckedMinute = "";
  if (currentTime != lastCheckedMinute) {
    scheduleTriggeredToday = false; 
    lastCheckedMinute = currentTime;
  }
}

void initSystemNetwork() {
  Serial.println("[WIFI] Connecting to network...");
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);
  
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.printf("\n🎉 Wi-Fi Connected: %s\n", WiFi.localIP().toString().c_str());

  configTzTime("CET-1CEST,M3.5.0,M10.5.0/3", "pool.ntp.org", "time.nist.gov");
  struct tm timeinfo;
  while (!getLocalTime(&timeinfo, 5000)) {
    Serial.println("[TIME] Waiting for NTP sync...");
  }
  Serial.println("[TIME] Sync Complete!");

  Serial.println("[FIREBASE] Connecting to Cloud Database...");
  config.database_url = DATABASE_URL;
  config.signer.test_mode = true; 

  Firebase.begin(&config, &auth);
  Firebase.reconnectWiFi(true);
  Firebase.RTDB.setBool(&fbdo, "/feeder/feeder_online", true);
  
  Serial.println("[FIREBASE] Connected and Ready!");
}

void tickWebServer() {
  // THE SAFETY NET
  if (Firebase.ready()) {
    
    // 1. Fast Poll: Check the remote button every 2 seconds
    if (millis() - lastFirebaseCheck > 2000) {
      lastFirebaseCheck = millis();
      RemoteCheckCommand();
    }

    // 2. Schedule Poll: Our new Round-Robin checker
    else if (millis() - lastScheduleSync > 10000) {
      CheckTime();
    }
  }
}