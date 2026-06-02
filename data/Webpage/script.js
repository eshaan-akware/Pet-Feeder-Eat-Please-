const bowlPercent = document.getElementById("bowlPercent");
const bowlFill = document.getElementById("bowlFill");
const bowlCaption = document.getElementById("bowlCaption");
const systemStatus = document.getElementById("systemStatus");
const activityLog = document.getElementById("activityLog");
const scheduleFeed = document.getElementById("scheduleFeed");
const remoteFeed = document.getElementById("remoteFeed");
const togglePresence = document.getElementById("togglePresence");

let bowlLevel = 68;
let petPresent = true;

const statusCopy = {
  ready: "Ready for feeding",
  low: "Bowl level low",
  safe: "Feeding complete",
  blocked: "Feed blocked"
};

function timestamp() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function addLog(message) {
  const item = document.createElement("li");
  item.textContent = `[${timestamp()}] ${message}`;
  activityLog.prepend(item);
}

function initializeBowl(){
  fetch("/initialBowlLevel")
  .then(response => {
    if (!response.ok)
      throw new Error("Hardware refused connection.");    
    return response.text();
  })
  .then(level => {
    const numericLevel = parseInt(level, 10);
    updateBowl(numericLevel);
  })
  .catch(error => {
    addLog(`[ERROR] ${error.message}`);
    updateBowl(10); // Default bowl level
  }); 
}

function updateBowl(level) {
  bowlLevel = Math.max(0, Math.min(100, level));
  bowlPercent.textContent = `${bowlLevel}%`;
  bowlFill.style.width = `${bowlLevel}%`;

  if (bowlLevel >= 60) {
    bowlCaption.textContent = "Enough food available for the next scheduled feed.";
  } else if (bowlLevel >= 30) {
    bowlCaption.textContent = "Food is running low. The system can still dispense a safe portion.";
  } else {
    bowlCaption.textContent = "Bowl is nearly empty. Refill recommended before the next cycle.";
  }
}

function attemptFeed(source) {
  if (bowlLevel >= 90) {
    systemStatus.textContent = statusCopy.blocked;
    addLog(`${source} request blocked to prevent overfeeding.`);
    return;
  }

  
  addLog(`${source} feed sequence initiated...`);

  const endpoint = source === "Scheduled" ? "/scheduled" : "/remote";
  fetch(endpoint)
  .then(response => {
    if (!response.ok)
      throw new Error("Hardware refused connection.");
      return response.text();    
    })
    .then(serverReceipt => {
      addLog('[SERVER] ${serverReceipt}');
      
      const portion = petPresent ? 14 : 10;
      updateBowl(bowlLevel + portion);
      systemStatus.textContent = statusCopy.safe;
    } 
    )
    .catch(error => {
      addLog(`[ERROR] ${error.message}`);
      systemStatus.textContent = statusCopy.blocked;
    });
}

scheduleFeed.addEventListener("click", () => {
  addLog("Scheduled feed check started.");
  if (bowlLevel >= 85) {
    systemStatus.textContent = statusCopy.blocked;
    addLog("Scheduled feed stopped because the bowl already has sufficient food.");
    return;
  }

  attemptFeed("Scheduled");
});

remoteFeed.addEventListener("click", () => {
  addLog("Remote feed requested from mobile interface.");
  if (bowlLevel >= 90) {
    systemStatus.textContent = statusCopy.blocked;
    addLog("Remote request denied because the bowl is too full.");
    return;
  }

  attemptFeed("Remote");
});

togglePresence.addEventListener("click", () => {
  fetch("/togglePresence")
  .then(response => {
    if (!response.ok)
      throw new Error("Hardware refused connection.");
      return response.text();    
    })
    .then(presence => {
      // Convert the string response to a real JavaScript boolean
      petPresent = (presence === 'true');
      
      if (petPresent) {
        addLog("Monitoring unit detected the pet near the feeder.");
        systemStatus.textContent = statusCopy.ready;
      } else {
      addLog("No pet detected. Alert can be sent to the user.");
      systemStatus.textContent = "Pet not detected";
      }
    } 
    )
    .catch(error => {
      addLog(`[ERROR] ${error.message}`);
      systemStatus.textContent = statusCopy.blocked;
    });
});

addLog("System online. Feeder unit and monitoring unit are connected.");
addLog("Initial bowl check completed before dispensing.");
updateBowl(bowlLevel);

initializeBowl();
