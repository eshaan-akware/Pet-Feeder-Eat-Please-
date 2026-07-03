#include <Arduino.h>
#include <ESP32Servo.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <HX711.h>
#include "WebPageHandler.h" // Pull in your modular network/filesystem abstraction layer

//Defining pins
#define SERVO_PIN D2
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET    -1  
#define SCREEN_ADDRESS 0x3C
#define TOUCH_PIN D6
#define HX711_DOUT_PIN D10
#define HX711_SCK_PIN D8


Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);
Servo feederServo;
HX711 scale;

// --- OLED HELPER FUNCTION ---
void updateDisplay(String line1, String line2) {
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  
  // Print first line
  display.setCursor(0, 10);
  display.println(line1);
  
  // Print second line
  display.setCursor(0, 30);
  display.setTextSize(2); // Make the main status bigger
  display.println(line2);
  
  display.display(); // Push the drawing to the physical screen
}

void testServo() {
  Serial.println("Running Servo Hardware Test...");
  
  // Standard ESP32 hardware timer allocation
  ESP32PWM::allocateTimer(0);
  ESP32PWM::allocateTimer(1);
  ESP32PWM::allocateTimer(2);
  ESP32PWM::allocateTimer(3);
  
  // Attach the servo with standard microsecond pulses (500us to 2400us)
  feederServo.setPeriodHertz(50); 
  feederServo.attach(SERVO_PIN, 500, 2400);

  // Sweep Test
  Serial.println("Moving to 0 degrees...");
  feederServo.write(0);
  delay(1000);

  Serial.println("Moving to 90 degrees...");
  feederServo.write(90);
  delay(1000);

  Serial.println("Moving to 180 degrees...");
  feederServo.write(180);
  delay(1000);

  // Return to home position
  Serial.println("Returning to 0 (Home)...");
  feederServo.write(0);
  delay(500);
  
  Serial.println("Servo Test Complete.");
}




void runremoteAction(){

  updateDisplay("Remote Command", "Dispensing");
  Serial.println("Opening lid slowly (0 to 90)...");
  
  int currentAngle = feederServo.read(); // Ask the ESP32 for the last known angle
    if (currentAngle > 0) {
      Serial.println("[FAILSAFE] Servo not at home. Easing to 0 slowly...");
      for (int pos = currentAngle; pos >= 0; pos -= 1) {
        feederServo.write(pos);
        delay(40);
      }
      delay(200); // Brief pause to let the power settle
    }

  // Ultra-slow open to prevent power spikes
  // Moving 1 degree every 40ms means a 90-degree sweep takes 3.6 seconds
  for (int pos = 0; pos <= 90; pos += 1) { 
    feederServo.write(pos);
    delay(40); 
  }
  
  Serial.println("Lid open. Dispensing food for 3 seconds...");
  
  // Wait for gravity to pull the food through the chute
  delay(3000);
  
  Serial.println("Closing lid slowly (90 back to 0)...");
  
  // Ultra-slow close
  for (int pos = 90; pos >= 0; pos -= 1) { 
    feederServo.write(pos);
    delay(40);
  }
  
  updateDisplay("System Ready", "Standing By"); // Reset screen when done
  Serial.println("Lid safely closed.");
  //Remote action handler
  //return true; // Placeholder return value
}

void runtouchAction(){
  // This variable remembers if the lid is currently open or closed
  static bool isLidOpen = false; 
  
  bool currentTouchState = digitalRead(TOUCH_PIN);

  // 1. FINGER TOUCHED: Open the lid and keep it open
  if (currentTouchState == HIGH && !isLidOpen) {
    Serial.println("[OFFLINE] Touch Sensor held! Opening lid...");
    updateDisplay("Manual Feed", "Dispensing..."); 

    //int currentAngle = feederServo.read(); // Ask the ESP32 for the last known angle
    /*if (currentAngle > 0) {
      Serial.println("[FAILSAFE] Servo not at home. Easing to 0 slowly...");
      for (int pos = currentAngle; pos >= 0; pos -= 1) {
        feederServo.write(pos);
        delay(40);
      }
      delay(200); // Brief pause to let the power settle
    }*/
   // Serial.println(currentAngle + ": Current Angle b4 opening");
    
    // Slowly open (0 to 90)
    for (int pos = 0; pos <= 90; pos += 1) { 
      feederServo.write(pos);
      delay(40); 
    }
    
    isLidOpen = true; // Lock the state so it doesn't try to open again
  }
  
  // 2. FINGER REMOVED: Close the lid
  else if (currentTouchState == LOW && isLidOpen) {
    Serial.println("[OFFLINE] Touch Sensor released! Closing lid...");
    
    // Slowly close (90 back to 0)
    for (int pos = 90; pos >= 0; pos -= 1) { 
      feederServo.write(pos);
      delay(40);
    }
    
    updateDisplay("System Ready", "Standing By"); // Reset the screen
    isLidOpen = false; // Reset the state lock
  }
}

bool runTogglePresenceAction(){
  // Toggle presence action handler
  return true; // Placeholder return value
}

int getCurrentBowlLevel() {
  // Placeholder logic to return the current bowl level
  return 20; // Replace with actual load sensor reading logic between 1 - 100
}

void setup() {
  // Open the system diagnostic channel
  Serial.begin(115200);
  delay(1000);
  
  Serial.println("--- System Initialization Starting ---");

  Serial.println("Initializing HX711 Load Cell...");
  scale.begin(HX711_DOUT_PIN, HX711_SCK_PIN);
  delay(2000); // Allow some time for the scale to stabilize
  scale.tare(); // Tare the scale to zero
  scale.set_scale(1.0); // Set the scale factor (calibration value)
  Serial.println("HX711 Load Cell Initialized and Tared.");

  pinMode(TOUCH_PIN, INPUT); // Set the touch pin as input for presence detection
  Serial.println("Touch pin initialized for presence detection.");

  Wire.begin(D4, D5); 
  if(!display.begin(SSD1306_SWITCHCAPVCC, SCREEN_ADDRESS)) {
    Serial.println(F("OLED allocation failed! Check wiring."));
  } else {
    updateDisplay("Smart Feeder", "Booting...");
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
  feederServo.write(0);
  delay(2000);
  
  //testServo();
  // Mount, Connect, Delegate Server Routing – All in one clean line!
  updateDisplay("Wi-Fi & Cloud", "Connecting");
  initSystemNetwork();
  
  updateDisplay("System Ready", "Standing By");
  Serial.println("--- System Initialization Finished ---");
}

void loop() {

  static unsigned long lastScalePrint = 0;
  
  // Only print the weight once every 1000ms (1 second) without freezing the board
  /*if (millis() - lastScalePrint > 1000) {
    if(scale.is_ready()) {
      float weight = scale.get_units(1); // Change 10 to 1! One quick read prevents hanging.
      Serial.printf("[SCALE] Current Weight: %.2f grams\n", weight);
    } else {
      Serial.println("[SCALE] HX711 not ready. Check wiring.");
    }
    lastScalePrint = millis(); // Reset the timer
  }*/

  // Keep the server ticking continuously
  tickWebServer();
  delay(10); // Small delay to yield clock cycles gracefully to ESP32 core background tasks
  
  runtouchAction(); // Check for touch sensor input every loop iteration
  delay(10); // Small delay to yield clock cycles gracefully to ESP32 core background tasks
  //runremoteAction();
  //Serial.println("Remote action executed in loop.");
  
  // Small baseline delay to yield clock cycles gracefully to ESP32 core background tasks
  delay(2); 
}