#ifndef WEBPAGE_HANDLER_H
#define WEBPAGE_HANDLER_H

// Initializes LittleFS, connects to Wi-Fi, and binds server routing paths
void initSystemNetwork();

extern int networkfailCount;
extern int checkCurrentBowlLevel();
extern void runStorageCheck();
extern bool isOfflineMode;
extern void keepCloudAlive();

// Polls the server stack to handle incoming web browser client connections
void tickWebServer();

#endif