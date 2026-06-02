#include <Arduino.h>
#include "WebPageHandler.h" // Pull in your modular network/filesystem abstraction layer

void setup() {
  // Open the system diagnostic channel
  Serial.begin(115200);
  delay(1000);
  
  Serial.println("--- System Initialization Starting ---");

  // Mount, Connect, Delegate Server Routing – All in one clean line!
  initSystemNetwork();
  
  Serial.println("--- System Initialization Finished ---");
}

bool runremoteAction(){
  //Remote action handler
  return true; // Placeholder return value
}

bool runscheduleAction(){
  //Schedule action handler
  return true; // Placeholder return value
}

bool runTogglePresenceAction(){
  // Toggle presence action handler
  return true; // Placeholder return value
}

int getCurrentBowlLevel() {
  // Placeholder logic to return the current bowl level
  return 20; // Replace with actual load sensor reading logic between 1 - 100
}

void loop() {
  // Keep the server ticking continuously
  tickWebServer();
  
  // Small baseline delay to yield clock cycles gracefully to ESP32 core background tasks
  delay(2); 
}