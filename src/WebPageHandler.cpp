#include "WebPageHandler.h" 
#include <WiFi.h>
#include <Firebase_ESP_Client.h>
#include <addons/TokenHelper.h> 
#include <addons/RTDBHelper.h>  
#include <time.h> 
#include <Ticker.h>


const char* ssid     = "motorola razr 40 ultra";
const char* password = "123456789";
unsigned long lastFirebaseCheck = 0; // Timestamp for the last Firebase check
String scheduledTime = ""; // Variable to hold the scheduled time from Firebase
bool scheduleTriggeredToday = false; // Flag to ensure the schedule only triggers once per day
unsigned long lastScheduleSync = 0; // Timestamp for the last schedule sync
Ticker cloudFailSafe;
const int storargecapacity = 2000;
unsigned long lastCloudConnectionTime = 0; 
bool cloudWasReady = true;


#define DATABASE_URL "pet-feeder-eat-please-default-rtdb.europe-west1.firebasedatabase.app"

// Firebase Core Objects
FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig config;

// We need to declare the function from main.cpp so we can trigger it here
extern void runremoteAction(); 
extern void updateDisplay(String line1, String line2); // Declare the function to update the display

void Reboot() {
  Serial.println("[FAILSAFE] Rebooting due to Firebase connection failure...");
  networkfailCount++;
  ESP.restart();
}

void keepCloudAlive() {
  if (!isOfflineMode) {
    Firebase.ready(); 
  }
}

void pushPetPresence(bool Present){
  if(isOfflineMode || !Firebase.ready()) return;
  if (Firebase.RTDB.setBool(&fbdo, "/feeder/pet_present", Present)){
    Serial.printf("[CLOUD] Pet presence updated to: %s\n", Present ? "true" : "false");
  }
  else {
    Serial.printf("[FIREBASE ERROR] Failed to push pet presence: %s\n", fbdo.errorReason().c_str());
  }

  lastFirebaseCheck = millis();
  lastScheduleSync = millis();
}

void runStorageCheck() {
  if (isOfflineMode || !Firebase.ready()) {
    Serial.println("[STORAGE] Offline mode active. Skipping Cloud update.");
    return; 
  }

  int percentage = checkCurrentBowlLevel();
  if (percentage == -1) return; 

  int storageGrams = (percentage * storargecapacity) / 100;

  // JUST PUSH THE UPDATE (No more 'getInt' double-dipping!)
  if (Firebase.RTDB.setInt(&fbdo, "/feeder/storage_grams", storageGrams)) {
    Serial.printf("[CLOUD] Storage level updated to: %d grams\n", storageGrams);      
  } else {
    // If the socket did drop during the motor movement, it will safely 
    // catch it here, print the error, and recover naturally on the next loop!
    Serial.printf("[FIREBASE ERROR] Failed to push storage: %s\n", fbdo.errorReason().c_str());
  }

  lastFirebaseCheck = millis(); 
  lastScheduleSync = millis(); 
}

int fetchMealsToday() {
  if (isOfflineMode || !Firebase.ready()) return -1;
  int meals = -1;
  if (Firebase.RTDB.getInt(&fbdo, "/feeder/dashboard_state/mealsToday")) {
      meals = fbdo.intData();
  }
  // The Socket Breather: Push timers back to prevent an immediate collision!
  lastFirebaseCheck = millis();
  lastScheduleSync = millis();
  return meals;
}

int fetchStorageGrams() {
  if (isOfflineMode || !Firebase.ready()) return -1;
  int grams = -1;
  if (Firebase.RTDB.getInt(&fbdo, "/feeder/storage_grams")) {
      grams = fbdo.intData();
  }
  lastFirebaseCheck = millis();
  lastScheduleSync = millis();
  return grams;
}

void RemoteCheckCommand(){
  if (Firebase.RTDB.getInt(&fbdo, "/feeder/feed_command")) {
      if (fbdo.intData() == 1) {
        Serial.println("[CLOUD] Remote Feed Triggered!");
        Firebase.RTDB.setFloat(&fbdo, "/feeder/feed_command", 0.5);
        Firebase.RTDB.setString(&fbdo, "/feeder/feed_status", "DISPENSING");
        runremoteAction(); 
        Firebase.RTDB.setInt(&fbdo, "/feeder/feed_command", 0);
        Firebase.RTDB.setString(&fbdo, "/feeder/feed_status", "SUCCESS");
        runStorageCheck(); // Update the storage level after dispensing
      }
    }
}

void CheckTime() {
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo, 10)) return; 
  
  char timeStringBuff[6]; 
  strftime(timeStringBuff, sizeof(timeStringBuff), "%H:%M", &timeinfo);
  String currentTime = String(timeStringBuff);

  static int currentIndex = 0; 
    
  String timePath = "/feeder/scheduled_times/";
  timePath += currentIndex;
  timePath += "/time";
  
  String statusPath = "/feeder/scheduled_times/";
  statusPath += currentIndex;
  statusPath += "/status";

  if (Firebase.RTDB.getString(&fbdo, timePath)) {
    String scheduledTime = fbdo.stringData();
    scheduledTime.trim(); // Cleans up any invisible spaces from the database
    
    Serial.printf("[SCHEDULE] Checked index %d. Found time: %s (Current ESP Time: %s)\n", currentIndex, scheduledTime.c_str(), currentTime.c_str());
    
    String normCurrent = currentTime;
    String normScheduled = scheduledTime;
    
    // Strip leading zeros from BOTH times so they always match perfectly!
    if (normCurrent.charAt(0) == '0') normCurrent = normCurrent.substring(1);
    if (normScheduled.charAt(0) == '0') normScheduled = normScheduled.substring(1);
    
    if (normCurrent == normScheduled && !scheduleTriggeredToday) {
      if (Firebase.RTDB.getString(&fbdo, statusPath)) {
        
        String currentStatus = fbdo.stringData();
        currentStatus.trim();
        
        if (currentStatus.equalsIgnoreCase("SCHEDULED")) { 
          Serial.printf("[SCHEDULE] Time matches %s! Dispensing...\n", scheduledTime.c_str());
          
          Firebase.RTDB.setString(&fbdo, statusPath, "SUCCESS");
          runremoteAction(); 
          
          scheduleTriggeredToday = true; 
          runStorageCheck(); 
        }
      }
    }
  } else {
    Serial.printf("[SCHEDULE] Index %d check failed: %s\n", currentIndex, fbdo.errorReason().c_str());
  }

  currentIndex++; 
  if (currentIndex >= 5) {
    currentIndex = 0; 
  }

  static String lastCheckedMinute = "";
  if (currentTime != lastCheckedMinute) {
    scheduleTriggeredToday = false; 
    lastCheckedMinute = currentTime;
  }
}

void initSystemNetwork() {
  Serial.println("[WIFI] Connecting to network...");
  unsigned long startAttemptTime = millis();
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);
  
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");

    if (millis() - startAttemptTime > 10000) {
      Serial.println("\n[WIFI] Connection timed out. Restarting...");
      networkfailCount++;
      ESP.restart();
    }
  }
  Serial.printf("\n🎉 Wi-Fi Connected: %s\n", WiFi.localIP().toString().c_str());

  configTzTime("CET-1CEST,M3.5.0,M10.5.0/3", "pool.ntp.org", "time.nist.gov");
  struct tm timeinfo;
  startAttemptTime = millis();
  while (!getLocalTime(&timeinfo, 5000)) {
    Serial.println("[TIME] Waiting for NTP sync...");
    if (millis() - startAttemptTime > 10000) {
      Serial.println("[TIME] NTP sync timed out. Restarting...");
      networkfailCount++;
      ESP.restart();
    }
  }
  Serial.println("[TIME] Sync Complete!");

  Serial.println("[FIREBASE] Connecting to Cloud Database...");
  cloudFailSafe.once(30, Reboot); // Set a one-time timer to reboot after 30 seconds if Firebase doesn't connect
  config.database_url = DATABASE_URL;
  config.signer.test_mode = true; 

  WiFi.setSleep(WIFI_PS_NONE); // Disable Wi-Fi sleep to maintain a stable connection
  config.timeout.socketConnection = 10000; // Set socket connection timeout to 10 seconds
  config.timeout.serverResponse = 10000; // Set server response timeout to 10 seconds

  Firebase.begin(&config, &auth);
  Firebase.reconnectWiFi(true);
  // --- THE SSL HANDSHAKE WAIT LOOP ---
  Serial.print("[FIREBASE] Authenticating SSL");
  unsigned long authTimer = millis();
  while (!Firebase.ready() && millis() - authTimer < 8000) {
    Serial.print(".");
    delay(500);
  }
  Serial.println("");

  if (Firebase.ready()) {
    Firebase.RTDB.setBool(&fbdo, "/feeder/feeder_online", true);
  }  
  bool cloudSuccess = Firebase.ready();
  cloudFailSafe.detach(); 
  if(cloudSuccess) {
    Serial.println("[FIREBASE] Connected and Ready!");
  } else {
    Serial.println("[FIREBASE] Connection failed. Restarting...");
    networkfailCount++;
    ESP.restart();
  }

  lastFirebaseCheck = millis(); // Initialize the last check timestamp
  lastScheduleSync = millis(); // Initialize the last schedule sync timestamp
  lastCloudConnectionTime = millis();
}

void tickWebServer() {
  if (Firebase.ready()) {
    
    if (!cloudWasReady) {
      Serial.println("[FIREBASE] Tunnel Auto-Restored!");
      cloudWasReady = true; 
    }
    
    lastCloudConnectionTime = millis(); 
    unsigned long currentMillis = millis();

    // 1. Fast Poll (Runs every 2 seconds)
    if (currentMillis - lastFirebaseCheck > 2000) {
      RemoteCheckCommand();
      
      lastFirebaseCheck = millis();
      
      // If the Schedule is about to fire, push it back so it waits 1 full second.
      // This guarantees no rapid-fire collisions, without starving the timer!
      if (millis() - lastScheduleSync > 9000) {
        lastScheduleSync = millis() - 9000; 
      }
    }
    // 2. Schedule Poll (Runs every 10 seconds)
    else if (currentMillis - lastScheduleSync > 10000) {
      CheckTime();
       
      time_t now;
      time(&now);
      Firebase.RTDB.setInt(&fbdo, "/feeder/heartbeat", (int)now);
      
      lastScheduleSync = millis(); 
      // Give the Fast Poll a full 2-second breather after a schedule check
      lastFirebaseCheck = millis(); 
    }
    
  } else {
    if (cloudWasReady) {
      Serial.println("[FIREBASE WARNING] SSL Tunnel collapsed. Attempting auto-reconnect...");
      cloudWasReady = false; 
    }
    
    if (millis() - lastCloudConnectionTime > 15000) {
      Serial.println("[FAILSAFE] Auto-reconnect failed. Switching to Offline Mode.");
      updateDisplay("Cloud Error", "Offline Mode"); 
      isOfflineMode = true; 
    }
  }
}