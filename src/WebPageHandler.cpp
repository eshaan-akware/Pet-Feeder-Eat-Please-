#include "WebPageHandler.h"
#include <WiFi.h>
#include <WebServer.h>
#include <LittleFS.h>

const char* ssid     = "motorola razr 40 ultra";
const char* password = "123456789";

WebServer server(80);

bool runremoteAction();
bool runscheduleAction();
bool runTogglePresenceAction();
int getCurrentBowlLevel();

void handleRemoteAction() {
  Serial.println("[SERVER] Remote action triggered!");

    if(runremoteAction()) //remote servo motor control logic ...
    {
        server.send(200, "text/plain", "Remote action received!");
    }
    else {
        server.send(500, "text/plain", "Remote action failed!");    
    }

}

void handleScheduleAction() {
  Serial.println("[SERVER] Schedule action triggered!");

    if(runscheduleAction()) //scheduled servo motor control logic ...
    {
        server.send(200, "text/plain", "Schedule action received!");
    }
    else {
        server.send(500, "text/plain", "Schedule action failed!");    
    }
  server.send(200, "text/plain", "Schedule action received!");
}

void handlePetPresenceToggle() {
  Serial.println("[SERVER] Pet presence toggle triggered!");

   if(runTogglePresenceAction()) //toggle ultrasonic sensor logic ...
    {
        server.send(200, "text/plain", "true");
    }
    else {
        server.send(200, "text/plain", "false");    
    }
}

void handleInitialBowlLevelRequest() {
  Serial.println("[SERVER] Initial bowl level request received!");

  // Placeholder logic to return the current bowl level
  int currentBowlLevel = getCurrentBowlLevel(); // Replace with load sensor logic

  server.send(200, "text/plain", String(currentBowlLevel));
}

// Helper to stream file assets out of the Webpage directory safely
bool streamFile(String path, String contentType) {
  if (LittleFS.exists(path)) {
    File file = LittleFS.open(path, "r");
    server.streamFile(file, contentType);
    file.close();
    return true;
  }
  return false;
}

// 1. Explicitly handle the root URL request
void handleRoot() {
  Serial.println("[SERVER] Browser requested root / -> Serving index.html");
  if (!streamFile("/Webpage/index.html", "text/html")) {
    server.send(404, "text/plain", "index.html missing inside LittleFS");
  }
}

// 2. The dynamic file handler now only handles assets like CSS and JS
void handleAssetRead() {
  String path = "/Webpage" + server.uri();
  String contentType = "text/plain";

  if (path.endsWith(".css"))       contentType = "text/css";
  else if (path.endsWith(".js"))   contentType = "application/javascript";
  else if (path.endsWith(".ico"))  contentType = "image/x-icon";

  Serial.printf("[SERVER] Asset request: %s -> Looking at: %s\n", server.uri().c_str(), path.c_str());

  if (streamFile(path, contentType)) {
    return;
  }

  server.send(404, "text/plain", "Asset Not Found");
}

void initSystemNetwork() {
  if (!LittleFS.begin(true)) {
    Serial.println("An error occurred while mounting LittleFS.");
    return;
  }
  Serial.println("[SYSTEM] LittleFS Partition Mounted Successfully.");

  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);
  Serial.printf("[WIFI] Connecting to network: %s ", ssid);
  
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.printf("\n🎉 Server Operational: http://%s\n", WiFi.localIP().toString().c_str());

  // REGISTER AN EXPLICIT HANDLER FOR THE ROOT PAGE
  server.on("/", handleRoot);
  server.on("/remote", handleRemoteAction);
  server.on("/scheduled", handleScheduleAction);
  server.on("/togglePresence", handlePetPresenceToggle);
  server.on("/initialBowlLevel", handleInitialBowlLevelRequest);
  
  // Anything else (css, js, images) goes to the asset reader
  server.onNotFound(handleAssetRead);
  
  server.begin();
  Serial.println("[SERVER] HTTP Web Listener Active.");
}

void tickWebServer() {
  server.handleClient();
}