#include <Arduino.h>
#include <ESP32Servo.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <HX711.h>
#include <PN532.h>
#include <PN532_I2C.h>
#include "WebPageHandler.h" 

//Defining pins
#define SERVO_PIN D2
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET    -1  
#define SCREEN_ADDRESS 0x3C
#define TOUCH_PIN D6
#define HX711_DOUT_PIN D10
#define HX711_SCK_PIN D8
#define TRIG_PIN D7
#define ECHO_PIN D3



RTC_DATA_ATTR int networkfailCount = 0; // Persistent counter for network failures across deep sleep cycles
bool isOfflineMode = false;
const int BIN_EMPTY_CM = 20;
const int BIN_FULL_CM = 4;
bool isStandingBy = true; 
bool petPresentState = false;
volatile int isrTapCount = 0;
volatile unsigned long lastIsrTapTime = 0;


Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);
PN532_I2C pn532i2c(Wire);
PN532 nfc(pn532i2c);
Servo feederServo;
HX711 scale;

// --- OLED HELPER FUNCTION ---
void updateDisplay(String line1, String line2) {
  isStandingBy = false; 
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 10);
  display.println(line1);
  display.setCursor(0, 30);
  display.setTextSize(2); 
  display.println(line2);
  display.display(); 
}

//Hardware Interrupt for helping a restart
void IRAM_ATTR handleNuclearReset() {
  unsigned long currentMillis = millis();
  
  if(currentMillis - lastIsrTapTime < 50){
    return;
  }
  // If more than 1 second passes between taps, reset the counter
  if (currentMillis - lastIsrTapTime > 1000) {
    isrTapCount = 0;
  }
  
  isrTapCount++;
  lastIsrTapTime = currentMillis;

  // The Nuclear Trigger: 4 rapid taps completely bypasses the main loop
  if (isrTapCount >= 4) {
    ESP.restart(); 
  }
}

// --- 1. THE UNIFIED ANIMATION FUNCTION (CAT IN A BOX) ---
void updateAnimation(bool isDispensing) {
  static unsigned long lastAnimUpdate = 0;
  static int frame = 0;
  int delayTime = isDispensing ? 250 : 1000; 

  if (millis() - lastAnimUpdate > delayTime) {
    lastAnimUpdate = millis();
    frame = !frame; // Toggle between 0 and 1

    display.clearDisplay();
    
    // Box Dimensions (Centered at the bottom of the screen)
    int boxX = 44;
    int boxY = 32;
    int boxW = 40;
    int boxH = 18;

    if (isDispensing) {
      // --- STATE: CAT POPPED OUT ---
      int bobbingY = frame ? 2 : 0; // Moves the cat up and down slightly
      int headY = 24 + bobbingY;

      //  Ears
      display.drawTriangle(50, headY-8, 54, headY-18, 58, headY-8, SSD1306_WHITE); // Left
      display.drawTriangle(78, headY-8, 74, headY-18, 68, headY-8, SSD1306_WHITE); // Right
      
      // Head
      display.drawCircle(64, headY, 15, SSD1306_WHITE);
      
      // Eyes & Cute 'w' Mouth
      display.fillCircle(58, headY-2, 2, SSD1306_WHITE);
      display.fillCircle(70, headY-2, 2, SSD1306_WHITE);
      display.drawPixel(62, headY+2, SSD1306_WHITE);
      display.drawPixel(63, headY+3, SSD1306_WHITE);
      display.drawPixel(64, headY+2, SSD1306_WHITE);
      display.drawPixel(65, headY+3, SSD1306_WHITE);
      display.drawPixel(66, headY+2, SSD1306_WHITE);

      // MASKING with box
      display.fillRect(boxX, boxY, boxW, boxH, SSD1306_BLACK);

      // Box Front
      display.drawRect(boxX, boxY, boxW, boxH, SSD1306_WHITE);

      // Open Flaps (Angled out)
      display.drawLine(boxX, boxY, boxX - 12, boxY + 8, SSD1306_WHITE);
      display.drawLine(boxX + boxW, boxY, boxX + boxW + 12, boxY + 8, SSD1306_WHITE);

      // Little Paws hanging over the edge
      display.fillRoundRect(50, boxY - 2, 6, 8, 2, SSD1306_WHITE);
      display.fillRoundRect(72, boxY - 2, 6, 8, 2, SSD1306_WHITE);

      display.setTextSize(1);
      display.setCursor(30, 54);
      display.println("Dispensing!");

    } else {
      // Standing By
      
      // Box Front
      display.drawRect(boxX, boxY, boxW, boxH, SSD1306_WHITE);
      
      // Closed Flaps 
      display.drawLine(boxX, boxY, boxX + 18, boxY + 5, SSD1306_WHITE);
      display.drawLine(boxX + boxW, boxY, boxX + boxW - 18, boxY + 5, SSD1306_WHITE);

      //'Z's floating up
      display.setTextSize(1);
      if (frame) {
        display.setCursor(54, 10); display.println("Z");
        display.setCursor(64, 18); display.println("z");
      } else {
        display.setCursor(64, 10); display.println("Z");
        display.setCursor(54, 18); display.println("z");
      }

      display.setCursor(18, 54);
      display.println("Standing By...");
    }
    
    display.display();
  }
}

//THE CHART FUNCTION
void showCloudHistory() {
  isStandingBy = false;
  updateDisplay("Fetching Data...", "Please Wait");
  
  int meals = fetchMealsToday();
  int grams = fetchStorageGrams();

  if (meals == -1 || grams == -1) {
    updateDisplay("Cloud Error", "Offline");
    delay(2000);
    isStandingBy = true;
    return;
  }

  display.clearDisplay();
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.println("--- CLOUD STATS ---");
  display.setCursor(0, 15);
  display.printf("Meals Today: %d\n", meals);
  display.setCursor(0, 30);
  display.printf("Storage: %dg\n", grams);

  // Dynamic Loading Bar
  display.drawRect(0, 45, 128, 15, SSD1306_WHITE);
  int fillWidth = map(grams, 0, 2000, 0, 128); 
  display.fillRect(0, 45, fillWidth, 15, SSD1306_WHITE); 

  display.display();
  delay(4000); 
  isStandingBy = true; 
}

void runremoteAction(){

  updateDisplay("Remote Command", "Dispensing");
  Serial.println("Opening lid slowly (0 to 90)...");

  // Ultra-slow open to prevent power spikes
  for (int pos = 5; pos <= 85; pos += 1) { 
    feederServo.write(pos);
    keepCloudAlive();
    updateAnimation(true); 
    delay(40); 
  }
  
  Serial.println("Lid open. Dispensing food for 3 seconds...");
  keepCloudAlive();
  // Wait for gravity to pull the food through the chute
  delay(3000);
  
  Serial.println("Closing lid slowly (90 back to 0)...");
  
  // Ultra-slow close
  for (int pos = 85; pos >= 5; pos -= 1) { 
    feederServo.write(pos);
    keepCloudAlive();
    updateAnimation(false); // False = Sleeping Animation
    delay(40);
  }
  
  updateDisplay("System Ready", "Standing By"); // Reset screen when done
  Serial.println("Lid safely closed.");
}

void runtouchAction() {
  static bool isLidOpen = false;
  static bool lastTouchState = LOW;
  static unsigned long touchStartTime = 0;
  static int tapCount = 0;
  static unsigned long lastTapTime = 0;

  bool currentTouchState = digitalRead(TOUCH_PIN);

  // 1. Fresh touch detected
  if (currentTouchState == HIGH && lastTouchState == LOW) {
    touchStartTime = millis();
    lastTouchState = HIGH;
  }

  // 2. Measure Active Holds
  if (currentTouchState == HIGH) {
    unsigned long holdTime = millis() - touchStartTime;

    // --- ACTION A: TAP + HOLD (OFFLINE TOGGLE) ---
    if (tapCount == 1 && holdTime > 1200 && !isLidOpen) {
      Serial.println("[SYSTEM] Manual Offline Toggle Triggered!");
      isOfflineMode = !isOfflineMode; 
      updateDisplay("Network Override", isOfflineMode ? "OFFLINE" : "ONLINE");
      delay(2000);
      if (!isOfflineMode) ESP.restart(); 
      tapCount = -1; // Lock until release
      isStandingBy = true;
    }
    
    // --- ACTION B: NORMAL HOLD (FEED) ---
    else if (tapCount == 0 && holdTime > 350 && !isLidOpen) {
      isStandingBy = false; 
      Serial.println("[OFFLINE] Touch Sensor held! Opening lid...");
      for (int pos = 5; pos <= 85; pos += 1) { 
        feederServo.write(pos);
        keepCloudAlive();
        updateAnimation(true); 
        delay(40); 
      }
      isLidOpen = true; 
    }
  }

  // 3. Detect a Release
  if (currentTouchState == LOW && lastTouchState == HIGH) {
    unsigned long touchDuration = millis() - touchStartTime;
    lastTouchState = LOW;

    // Detect a quick tap (just count it, don't execute yet!)
    if (touchDuration > 10 && touchDuration < 350 && !isLidOpen && tapCount != -1) {
      tapCount++;
      lastTapTime = millis();
    }

    if (tapCount == -1) tapCount = 0; // Release the offline lock

    // Close lid if it was open
    if (isLidOpen) {
      Serial.println("[OFFLINE] Touch Sensor released! Closing lid...");
      for (int pos = 85; pos >= 5; pos -= 1) { 
        feederServo.write(pos);
        keepCloudAlive();
        updateAnimation(false); 
        delay(40);
      }
      runStorageCheck(); 
      isLidOpen = false; 
      isStandingBy = true; 
    }
  }

  // 4. THE ACTION PROCESSOR (Waits to see if more taps are coming!) 
  // If 400ms have passed since the last tap, and the user isn't currently touching it:
  if (tapCount > 0 && currentTouchState == LOW && (millis() - lastTapTime > 400)) {
    
    if (tapCount == 2) {
      showCloudHistory();
    }
    
    tapCount = 0; // Reset after evaluating
  }
}

bool runTogglePresenceAction(){
  // Toggle presence action handler
  return true; // Placeholder return value
}

int checkCurrentBowlLevel() {
  // Placeholder logic to return the current bowl level

  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);

  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  long duration = pulseIn(ECHO_PIN, HIGH, 30000);

  if(duration == 0) {
    Serial.println("[ULTRASONIC] No echo received. Check sensor wiring.");
    return -1; // Indicate an error
  }

  int distanceCm = duration * 0.034 / 2; // Convert to cm

  int percentage = map(distanceCm, BIN_EMPTY_CM, BIN_FULL_CM, 0, 100);
  percentage = constrain(percentage, 0, 100); // Ensure it's between 0 and 100

  Serial.printf("[ULTRASONIC] Distance: %d cm, Bowl Level: %d%%\n", distanceCm, percentage);

  return percentage; 
}

// --- NFC PROXIMITY POLLING FUNCTION ---
void checkNfcTag() {
  static unsigned long lastNfcPoll = 0;
  static unsigned long lastTimeTagSeen = 0; // Tracks when the tag was last in range
  
  // Only check the NFC module once every 1 second
  if (millis() - lastNfcPoll > 1000) {
    lastNfcPoll = millis();
    
    uint8_t success;
    uint8_t uid[] = { 0, 0, 0, 0, 0, 0, 0 };  
    uint8_t uidLength;                        
    
    // 1. Try to read a tag
    success = nfc.readPassiveTargetID(PN532_MIFARE_ISO14443A, uid, &uidLength);
    
    if (success) {
      // TAG IS IN RANGE! Reset the watchdog timer.
      lastTimeTagSeen = millis(); 
      
      // If the pet was previously "Away", welcome them back!
      if (!petPresentState) { 
        Serial.println("[NFC] Tag entered field! Pet Arrived.");
        petPresentState = true; 
        pushPetPresence(petPresentState);
        
        isStandingBy = false; 
        updateDisplay("Pet Detected", "Pet Arrived");
        delay(2000); 
        isStandingBy = true; 
      }
    } 
    
    // 2. THE WATCHDOG TIMEOUT 
    // If the pet is currently marked as present, but we haven't seen the tag in 4 seconds...
    if (petPresentState && (millis() - lastTimeTagSeen > 10000)) {
      Serial.println("[NFC] Tag left field! Pet Left.");
      petPresentState = false; 
      pushPetPresence(petPresentState); // Update Firebase
      
      isStandingBy = false; 
      updateDisplay("Pet Left", "Standing By...");
      delay(2000); 
      isStandingBy = true; 
    }
  }
}

bool isBowlWeighted() {
  // Use scale.get_units() if you want a cleaner number
  // Threshold: Adjust this number based on your test!
  long weightThreshold = 25000; 
  
  if (scale.is_ready()) {
    long currentWeight = scale.read()*10000;
    return (currentWeight > weightThreshold);
  }
  return false;
}

void setup() {
  // Open the system diagnostic channel
  Serial.begin(115200);
  delay(1000);
  
  
  Serial.println("--- System Initialization Starting ---");

  
  Serial.println("Initializing ultrasonic sensor");
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);

  Serial.println("Initializing HX711 Load Cell...");
  scale.begin(HX711_DOUT_PIN, HX711_SCK_PIN);
  delay(2000); // Allow some time for the scale to stabilize
  scale.tare(); // Tare the scale to zero
  scale.set_scale(1.0); // Set the scale factor (calibration value)
  Serial.println("HX711 Load Cell Initialized and Tared.");

  pinMode(TOUCH_PIN, INPUT); // Set the touch pin as input for offline dispensing
  Serial.println("Touch pin initialized for offline dispensing.");

  attachInterrupt(digitalPinToInterrupt(TOUCH_PIN), handleNuclearReset, RISING); // Interrupt declare

  Wire.begin(D4, D5); 
  if(!display.begin(SSD1306_SWITCHCAPVCC, SCREEN_ADDRESS)) {
    Serial.println(F("OLED allocation failed! Check wiring."));
  } else {
    updateDisplay("Smart Feeder", "Booting...");
  }

  Serial.println("Initializing NFC Module...");
  nfc.begin();
  
  Wire.begin(D4, D5); // Initialize I2C for OLED and NFC
  uint32_t versiondata = nfc.getFirmwareVersion();
  if (!versiondata) {
    Serial.println("[NFC] Didn't find PN532 board. Check wiring.");
  } else {
    Serial.printf("[NFC] Found PN532 with firmware version: %d.%d\n", (versiondata >> 16) & 0xFF, (versiondata >> 8) & 0xFF);
    nfc.SAMConfig();

    nfc.setPassiveActivationRetries(0x14); 
  }


  // Standard ESP32 hardware timer allocation
  ESP32PWM::allocateTimer(0);
  ESP32PWM::allocateTimer(1);
  ESP32PWM::allocateTimer(2);
  ESP32PWM::allocateTimer(3);

  // Attach the servo with standard microsecond pulses (500us to 2400us)
  feederServo.setPeriodHertz(50); 
  feederServo.attach(SERVO_PIN, 500, 2400);
 
  Serial.println("Locking servo to home position (0)...");
  feederServo.write(5);
  delay(2000);
  
  if(networkfailCount >10){
    Serial.println("[FAILSAFE] Network failure count exceeded threshold. Entering offline mode.");
    isOfflineMode = true;
    networkfailCount = 0; 
    updateDisplay("Offline Mode", "Network Failures");
  } else {
    // Mount, Connect, Delegate Server Routing – All in one clean line!
    updateDisplay("Wi-Fi & Cloud", "Connecting");
    initSystemNetwork();
    isOfflineMode = false;
    networkfailCount = 0; 
  }
  
  updateDisplay("System Ready", "Standing By");
  updateAnimation(false); 
  Serial.println("--- System Initialization Finished ---");
}

void loop() {

  if(!isOfflineMode) {
    // Keep the server ticking continuously
    tickWebServer();
    delay(10); // Small delay to yield clock cycles gracefully to ESP32 core background tasks
  
    }
  else {
    static bool offlinemessageprinted = false;
    if(!offlinemessageprinted) {
    Serial.println("[OFFLINE] System is in offline mode. Skipping network tasks.");
    offlinemessageprinted = true;
    }
  }

  if (scale.is_ready()) {
    long reading = scale.read(); // Get raw value
    Serial.printf("Current Raw Value: %ld\n", reading);
  }
  delay(50);

  /*if (isBowlWeighted()) {
  updateDisplay("Status", "Weight Detected");
  } else {
  updateDisplay("Status", "Empty");
  }*/

  delay(10);
  
  runtouchAction(); // Check for touch sensor input every loop iteration

  checkNfcTag(); // Check for NFC tag input every loop iteration
  delay(10); // Small delay to yield clock cycles gracefully to ESP32 core background tasks
  if (isStandingBy) {
    updateAnimation(false); 
  delay(2); 
}