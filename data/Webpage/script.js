const bowlPercent = document.getElementById("bowlPercent");
const bowlFill = document.getElementById("bowlFill");
const bowlCaption = document.getElementById("bowlCaption");
const systemStatus = document.getElementById("systemStatus");
const activityLog = document.getElementById("activityLog");
const feedTime = document.getElementById("feedTime");
const scheduleFeed = document.getElementById("scheduleFeed");
const remoteFeed = document.getElementById("remoteFeed");
const togglePresence = document.getElementById("togglePresence");
const mealsTodayStat = document.getElementById("mealsTodayStat");
const nextFeedStat = document.getElementById("nextFeedStat");
const lastFeedStat = document.getElementById("lastFeedStat");
const overfeedStat = document.getElementById("overfeedStat");
const overfeedSub = document.getElementById("overfeedSub");
const feedingHistoryChart = document.getElementById("feedingHistoryChart");
const bowlTrendChart = document.getElementById("bowlTrendChart");
const petActivityChart = document.getElementById("petActivityChart");
const balanceChart = document.getElementById("balanceChart");
const firebaseURL = "https://pet-feeder-eat-please-default-rtdb.europe-west1.firebasedatabase.app/feeder.json";
const storedScheduleKey = "smartPetFeeder.scheduleTime";
const dashboardStateKey = "smartPetFeeder.dashboardState";// Automatically generate the last 6 days + "Today" for the charts
function getDynamicChartLabels() {
  const labels = [];
  for (let i = 6; i > 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    // Formats the date cleanly, e.g., "Jun 28", "Jul 1"
    labels.push(d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
  }
  labels.push("Today");
  return labels;
}

const chartLabels = getDynamicChartLabels();
const defaultDashboardState = {
  mealsToday: 0,
  lastFeedingTime: "Not recorded yet",
  feedingHistory: [2, 3, 3, 4, 3, 4, 5],
  bowlHistory: [72, 69, 67, 64, 66, 63, 68],
  petActivity: [1, 0, 1, 1, 0, 1, 1]
};

let bowlLevel = 68;
let petPresent = true;
let dashboardState = loadDashboardState();
let scheduledTimes = [];
let currentStorageGrams= 0;
let maxStorageGrams = 2000;
let dispenseAmount = 200;

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

function getFeedTimeLabel() {
  return feedTime.value.trim() || "Not set";
}

function normalizeTime(input) {
  const value = input.trim();
  const match = value.match(/^(\d{1,2}):(\d{2})$/);

  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (Number.isNaN(hours) || Number.isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }

  return `${hours}:${match[2]}`;
}

function getStoredDashboardState() {
  try {
    const raw = localStorage.getItem(dashboardStateKey);
    if (!raw) {
      return { ...defaultDashboardState };
    }

    const parsed = JSON.parse(raw);
    return {
      ...defaultDashboardState,
      ...parsed,
      mealsToday: Number(parsed.mealsToday) || 0,
      lastFeedingTime: parsed.lastFeedingTime || "Not recorded yet",
      feedingHistory: Array.isArray(parsed.feedingHistory) && parsed.feedingHistory.length ? parsed.feedingHistory.slice(-7) : defaultDashboardState.feedingHistory.slice(),
      bowlHistory: Array.isArray(parsed.bowlHistory) && parsed.bowlHistory.length ? parsed.bowlHistory.slice(-7) : defaultDashboardState.bowlHistory.slice(),
      petActivity: Array.isArray(parsed.petActivity) && parsed.petActivity.length ? parsed.petActivity.slice(-7) : defaultDashboardState.petActivity.slice()
    };
  } catch {
    return { ...defaultDashboardState };
  }
}

function saveDashboardState() {
  // Package all the chart arrays (including Chart 1: feedingHistory)
  const payload = {
    mealsToday: dashboardState.mealsToday,
    lastFeedingTime: dashboardState.lastFeedingTime,
    feedingHistory: dashboardState.feedingHistory.slice(-7),
    bowlHistory: dashboardState.bowlHistory.slice(-7),
    petActivity: dashboardState.petActivity.slice(-7)
  };

  // Push the payload to Firebase seamlessly in the background
  fetch(firebaseURL, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dashboard_state: payload })
  })
  .then(response => {
    if (!response.ok) console.error("Failed to save analytics to cloud.");
  })
  .catch(error => console.error("Analytics sync error:", error));
}

function loadDashboardState() {
  const state = getStoredDashboardState();
  const todayKey = new Date().toISOString().slice(0, 10);

  return {
    ...state,
    date: todayKey
  };
}

function setStatsFromState() {
  mealsTodayStat.textContent = String(dashboardState.mealsToday);
  nextFeedStat.textContent = getFeedTimeLabel();
  lastFeedStat.textContent = dashboardState.lastFeedingTime;

  if (bowlLevel >= 90) {
    overfeedStat.textContent = "Blocking feed";
    overfeedSub.textContent = "Bowl limit reached";
  } else {
    overfeedStat.textContent = "Active";
    overfeedSub.textContent = "90% bowl limit";
  }
}

function prepareCanvas(canvas) {
  const context = canvas.getContext("2d");
  const rect = canvas.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;

  canvas.width = Math.max(1, Math.round(rect.width * scale));
  canvas.height = Math.max(1, Math.round(rect.height * scale));
  context.setTransform(scale, 0, 0, scale, 0, 0);

  return {
    context,
    width: rect.width,
    height: rect.height
  };
}

function drawGrid(context, width, height) {
  context.strokeStyle = "rgba(255, 255, 255, 0.08)";
  context.lineWidth = 1;

  for (let index = 1; index <= 3; index += 1) {
    const y = (height / 4) * index;
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }
}

function drawBarChart(canvas, values, labels, accentStart, accentEnd) {
  if (!canvas) {
    return;
  }

  const { context, width, height } = prepareCanvas(canvas);
  const padding = 26;
  const chartHeight = height - padding * 2;
  const chartWidth = width - padding * 2;
  const maxValue = Math.max(...values, 1);
  const barWidth = chartWidth / values.length * 0.62;
  const gap = chartWidth / values.length;

  context.clearRect(0, 0, width, height);
  drawGrid(context, width, height);

  values.forEach((value, index) => {
    const barHeight = (value / maxValue) * (chartHeight - 24);
    const x = padding + index * gap + (gap - barWidth) / 2;
    const y = height - padding - barHeight;

    const gradient = context.createLinearGradient(x, y, x, y + barHeight);
    gradient.addColorStop(0, accentStart);
    gradient.addColorStop(1, accentEnd);

    context.fillStyle = gradient;
    context.fillRect(x, y, barWidth, barHeight);

    context.fillStyle = "rgba(238, 246, 251, 0.86)";
    context.font = "12px Segoe UI, Arial, sans-serif";
    context.textAlign = "center";
    context.fillText(String(value), x + barWidth / 2, y - 6);

    context.fillStyle = "rgba(168, 192, 207, 0.9)";
    context.fillText(labels[index], x + barWidth / 2, height - 8);
  });
}

function drawLineChart(canvas, values, labels, lineColor, fillColor) {
  if (!canvas) {
    return;
  }

  const { context, width, height } = prepareCanvas(canvas);
  const padding = 28;
  const chartHeight = height - padding * 2;
  const chartWidth = width - padding * 2;
  const maxValue = Math.max(...values, 1);
  const minValue = Math.min(...values, 0);
  const range = Math.max(maxValue - minValue, 1);
  const step = chartWidth / Math.max(values.length - 1, 1);
  const points = values.map((value, index) => ({
    x: padding + index * step,
    y: height - padding - ((value - minValue) / range) * (chartHeight - 22)
  }));

  context.clearRect(0, 0, width, height);
  drawGrid(context, width, height);

  const areaGradient = context.createLinearGradient(0, padding, 0, height - padding);
  areaGradient.addColorStop(0, fillColor);
  areaGradient.addColorStop(1, "rgba(86, 208, 182, 0.02)");

  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  points.forEach((point) => context.lineTo(point.x, point.y));
  context.strokeStyle = lineColor;
  context.lineWidth = 3;
  context.stroke();

  context.lineTo(points[points.length - 1].x, height - padding);
  context.lineTo(points[0].x, height - padding);
  context.closePath();
  context.fillStyle = areaGradient;
  context.fill();

  points.forEach((point, index) => {
    context.beginPath();
    context.arc(point.x, point.y, 4.5, 0, Math.PI * 2);
    context.fillStyle = "#eef6fb";
    context.fill();
    context.strokeStyle = lineColor;
    context.lineWidth = 2;
    context.stroke();

    context.fillStyle = "rgba(168, 192, 207, 0.9)";
    context.font = "12px Segoe UI, Arial, sans-serif";
    context.textAlign = "center";
    context.fillText(labels[index], point.x, height - 8);
  });
}

function drawComparisonChart(canvas, dispensedValue, remainingValue, maxValue) {
  if (!canvas) return;

  const { context, width, height } = prepareCanvas(canvas);
  const padding = 28;
  const chartHeight = height - padding * 2;
  const barWidth = (width - padding * 2) / 4;
  const bars = [
    { label: "Dispensed", value: dispensedValue, colorStart: "rgba(141, 216, 255, 0.95)", colorEnd: "rgba(86, 208, 182, 0.95)" },
    { label: "Remaining", value: remainingValue, colorStart: "rgba(255, 202, 122, 0.95)", colorEnd: "rgba(243, 226, 141, 0.95)" }
  ];

  context.clearRect(0, 0, width, height);
  drawGrid(context, width, height);

  // Prevent division by zero if the hopper is entirely empty
  const safeMaxValue = Math.max(maxValue, 1);

  bars.forEach((bar, index) => {
    const x = padding + index * (barWidth + 22);
    
    // Calculate height relative to the dynamic peak storage
    const barHeight = (Math.max(bar.value, 0) / safeMaxValue) * (chartHeight - 14);
    const y = height - padding - barHeight;
    
    const gradient = context.createLinearGradient(x, y, x, y + barHeight);
    gradient.addColorStop(0, bar.colorStart);
    gradient.addColorStop(1, bar.colorEnd);

    context.fillStyle = gradient;
    context.fillRect(x, y, barWidth, barHeight);

    context.fillStyle = "rgba(238, 246, 251, 0.9)";
    context.font = "13px Segoe UI, Arial, sans-serif";
    context.textAlign = "center";
    
    // Append 'g' for grams to the label
    context.fillText(`${bar.value}g`, x + barWidth / 2, y - 6);
    context.fillText(bar.label, x + barWidth / 2, height - 8);
  });
}

function renderAnalytics() {
  drawBarChart(feedingHistoryChart, dashboardState.feedingHistory, chartLabels, "rgba(86, 208, 182, 0.92)", "rgba(141, 216, 255, 0.92)");
  drawLineChart(bowlTrendChart, dashboardState.bowlHistory, chartLabels, "rgba(255, 202, 122, 0.96)", "rgba(255, 202, 122, 0.18)");
  drawBarChart(petActivityChart, dashboardState.petActivity, chartLabels, "rgba(141, 216, 255, 0.95)", "rgba(86, 208, 182, 0.95)");
  const dispensedGrams = Math.max(0, maxStorageGrams - currentStorageGrams);
  
  // Draw the chart using absolute gram values and the dynamic 100% capacity
  drawComparisonChart(balanceChart, dispensedGrams, currentStorageGrams, maxStorageGrams);
}

function syncDashboard() {
  setStatsFromState();
  saveDashboardState();
  renderAnalytics();
}

function recordSuccessfulFeed(portion) {
  dashboardState.mealsToday += 1;
  dashboardState.lastFeedingTime = timestamp();
  
  // Find the index for "Today" (the last slot in the 7-day array)
  const todayIndex = dashboardState.feedingHistory.length - 1;
  
  // Overwrite today's value instead of shifting the whole week
  dashboardState.feedingHistory[todayIndex] = dashboardState.mealsToday;
  
  // If the pet is present, ensure today is marked as active
  if (petPresent) {
    dashboardState.petActivity[todayIndex] = 1;
  }

  // We use Math.max to ensure it never visually drops below 0g
  currentStorageGrams = Math.max(0, currentStorageGrams - portion);
  
  // Push the new storage value to Firebase so the cloud knows the new weight
  // (The ESP32 will overwrite this with the true physical weight on its next check-in!)
  fetch(firebaseURL, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storage_grams: currentStorageGrams })
  });
  
  updateBowl(bowlLevel + portion, true);
  addLog(`Feeding recorded. ${portion}% portion logged for the dashboard.`);
}


function initializeCloudData() {
  fetch(firebaseURL)
  .then(response => {
    if (!response.ok) throw new Error("Cloud database refused connection.");    
    return response.json(); 
  })
  .then(data => {
    // 1. Sync the Live Bowl Level
    const numericLevel = data && data.bowl_level !== undefined ? parseInt(data.bowl_level, 10) : 10;
    updateBowl(Number.isNaN(numericLevel) ? 10 : numericLevel, false);

    // Sync the hardware-defined portion size
    if (data && data.dispense_amount !== undefined) {
      dispenseAmount = parseInt(data.dispense_amount, 10);
    }

    //storage grams logic
    if (data && data.storage_grams !== undefined) {
      const liveWeight = parseInt(data.storage_grams, 10);
      
      // The High-Water Mark Logic: If the new weight is higher than our current weight, 
      // the user just added food! Set this new high value as the 100% baseline.
      if (liveWeight > currentStorageGrams) {
        maxStorageGrams = liveWeight;
        addLog(`Hopper refilled! New capacity set to ${maxStorageGrams}g.`);
      }
      
      currentStorageGrams = liveWeight;
    }

    // 2. Sync the Historical Analytics Charts (Chart 1 Data!)
    if (data && data.scheduled_times && Array.isArray(data.scheduled_times)) {
      scheduledTimes = data.scheduled_times;
    } else {
      scheduledTimes = []; // Start empty if nothing is in Firebase
    }
    renderScheduleList();
    if (data && data.dashboard_state) {
      dashboardState = {
        ...defaultDashboardState,
        ...data.dashboard_state
      };
      addLog("Historical analytics loaded from the cloud.");
    } else {
      dashboardState = { ...defaultDashboardState };
    }

    // 3. Render the UI with the fresh cloud data
    setStatsFromState();
    renderAnalytics();
  })
  .catch(error => {
    addLog(`[ERROR] ${error.message}`);
    updateBowl(10, false); 
  }); 
}

function updateBowl(level, recordHistory = false) {
  bowlLevel = Math.max(0, Math.min(100, level));
  bowlPercent.textContent = `${bowlLevel}%`;
  bowlFill.style.width = `${bowlLevel}%`;

  const safetyDot = document.getElementById("safetyDot");
  if (safetyDot) {
    // Strip old classes
    safetyDot.className = "status-dot"; 
    
    // Apply colors based on safety status
    if (bowlLevel >= 90) {
      safetyDot.classList.add("danger"); // Make sure to add this to your CSS!
    } else if (bowlLevel >= 60) {
      safetyDot.classList.add("warn");   // Uses your existing yellow class
    } else {
      safetyDot.classList.add("on");     // Uses your existing green class
    }
  }
  if (bowlLevel >= 60) {
    bowlCaption.textContent = "Enough food available for the next scheduled feed.";
  } else if (bowlLevel >= 30) {
    bowlCaption.textContent = "Food is running low. The system can still dispense a safe portion.";
  } else {
    bowlCaption.textContent = "Bowl is nearly empty. Refill recommended before the next cycle.";
  }

  if (recordHistory) {
    // Find the index for "Today"
    const todayIndex = dashboardState.bowlHistory.length - 1;
    
    // Update today's final bowl level instead of creating a new day
    dashboardState.bowlHistory[todayIndex] = bowlLevel;
    
    syncDashboard();
  } else {
    setStatsFromState();
    renderAnalytics();
  }
}

function getScheduledTimeLabel() {
  const normalizedTime = normalizeTime(feedTime.value);

  if (!normalizedTime) {
    addLog("Please enter a valid time like 6:30 before saving.");
    systemStatus.textContent = "Invalid time format";
    return null;
  }

  return normalizedTime;
}

scheduleFeed.addEventListener("click", () => {
  const newTime = getScheduledTimeLabel();
  if (!newTime) {
    return;
  }

  // Prevent adding the exact same time twice
  if (scheduledTimes.includes(newTime)) {
    addLog("This time is already on the schedule.");
    return;
  }

  scheduleFeed.disabled = true;
  scheduleFeed.style.opacity = "0.5";
  systemStatus.textContent = "Saving schedule to cloud...";

  const scheduledObj = { time: newTime, status: "SCHEDULED" };
  const updatedSchedule = [...scheduledTimes, scheduledObj];

  fetch(firebaseURL, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scheduled_times: updatedSchedule })
  })
  .then(response => {
    if (!response.ok) throw new Error("Failed to save schedule.");

    // 3. Cloud confirmed!
    scheduledTimes = updatedSchedule;
    systemStatus.textContent = `Scheduled for ${newTime}`;
    addLog(`Scheduled feeding time saved to cloud as ${newTime}.`);
    renderScheduleList(); 
    // Unlock the UI
    scheduleFeed.disabled = false;
    scheduleFeed.style.opacity = "1";
  })
  .catch(error => {
    addLog(`[ERROR] ${error.message}`);
    systemStatus.textContent = "Cloud Error";
    scheduleFeed.disabled = false;
    scheduleFeed.style.opacity = "1";
  });
});

remoteFeed.addEventListener("click", () => {
  addLog("Remote feed requested from mobile interface.");
  if (bowlLevel >= 90) {
    systemStatus.textContent = statusCopy.blocked;
    addLog("Remote request denied because the bowl is too full.");
    syncDashboard();
    return;
  }

  addLog("Command sent. Waiting for hardware verification...");
  systemStatus.textContent = "Dispensing...";
  remoteFeed.disabled = true; // Prevent spam-clicking the button
  remoteFeed.style.opacity = "0.5"

  fetch(firebaseURL, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ feed_command: 1, feed_status: "PENDING" }) // 1 means "dispense now"
  })
  .then(response => {
    if (!response.ok) throw new Error("Failed to send command to cloud.");
    let attempts = 0;
    const maxAttempts = 30; // Give the hardware (or yourself) 30 seconds to reply
    
    const receiptInterval = setInterval(() => {
      attempts++;
      
      fetch(firebaseURL)
      .then(res => res.json())
      .then(data => {
        // --- HANDSHAKE: SUCCESS ---
        if (data.feed_status === "SUCCESS") {
          clearInterval(receiptInterval);
          const portion = dispenseAmount; // Use the defined dispense amount
          systemStatus.textContent = statusCopy.safe;
          recordSuccessfulFeed(portion); // ONLY update charts upon hardware success!
          addLog("Hardware verified: Food successfully dispensed.");
          resetHandshake();
        } 
        // --- HANDSHAKE: ERROR ---
        else if (data.feed_status === "ERROR") {
          clearInterval(receiptInterval);
          systemStatus.textContent = "Hardware Error";
          addLog("CRITICAL: Hardware reported a jam or empty hopper.");
          resetHandshake();
        } 
        // --- HANDSHAKE: TIMEOUT ---
        else if (attempts >= maxAttempts) {
          clearInterval(receiptInterval);
          systemStatus.textContent = "Hardware Timeout";
          addLog("WARNING: Hardware did not respond in time.");
          resetHandshake();
        }
      });
    }, 1000); // Check once every 1 second
  })
  .catch(error => {
    addLog(`[ERROR] ${error.message}`);
    systemStatus.textContent = "Cloud Error";
    resetHandshake();
  });
});

function resetHandshake() {
  remoteFeed.disabled = false;
  remoteFeed.style.opacity = "1";
  fetch(firebaseURL, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    // Reset back to idle state
    body: JSON.stringify({ feed_status: "IDLE", feed_command: 0 })
  });
}

togglePresence.addEventListener("click", () => {
  togglePresence.disabled = true;
  togglePresence.style.opacity = "0.5";
  systemStatus.textContent = "Updating presence...";

  const newState = !petPresent; // Calculate the new state

  fetch(firebaseURL, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pet_present: newState }) 
  })
  .then(response => {
    if (!response.ok)
      throw new Error("cloud database refused connection.");
    petPresent = newState;
    if (petPresent) {
      addLog("Cloud simulated: Monitoring unit detected the pet.");
      systemStatus.textContent = statusCopy.ready;
    } else {
      addLog("Cloud simulated: No pet detected.");
      systemStatus.textContent = "Pet not detected";
    }
    
    // Log the activity to your charts
    const todayIndex = dashboardState.petActivity.length - 1;
    dashboardState.petActivity[todayIndex] = petPresent ? 1 : 0;
    syncDashboard();   
    
    // Unlock the UI
    togglePresence.disabled = false;
    togglePresence.style.opacity = "1";   
    })
    .catch(error => {
    addLog(`[ERROR] ${error.message}`);
    systemStatus.textContent = statusCopy.blocked;
    // Revert the variable if the cloud update failed
    togglePresence.disabled = false;
    togglePresence.style.opacity = "1";
  });
});

function syncSystemStatus() {
  const feederDot = document.getElementById("feederDot");
  const monitorDot = document.getElementById("monitorDot");

  fetch(firebaseURL)
  .then(response => {
    if (!response.ok) throw new Error("Database unresponsive");
    return response.json();
  })
  .then(data => {
    // 1. Refresh local state from cloud
    if (data && data.scheduled_times) {
      scheduledTimes = data.scheduled_times;
    }
    
    // Update connection indicators
    feederDot.className = "status-dot"; 
    monitorDot.className = "status-dot"; 
    
    if (data && data.feeder_online === true) {
      feederDot.classList.add("on");
      monitorDot.classList.add("on");
    } else {
      feederDot.classList.add("danger");
      monitorDot.classList.add("danger");
    }

    //Checking storage updates
    if (data && data.storage_grams !== undefined) {
      const liveWeight = parseInt(data.storage_grams, 10);
      
      // The High-Water Mark Logic: If the new weight is higher than our current weight, 
      // the user just added food! Set this new high value as the 100% baseline.
      if (liveWeight > currentStorageGrams) {
        maxStorageGrams = liveWeight;
        addLog(`Hopper refilled! New capacity set to ${maxStorageGrams}g.`);
      }
      
      currentStorageGrams = liveWeight;
    }


    // Sync the hardware-defined portion size
    if (data && data.dispense_amount !== undefined) {
      dispenseAmount = parseInt(data.dispense_amount, 10);
    }
    
    // 2. THE BACKGROUND HANDSHAKE: Detect completion
    const completedFeed = scheduledTimes.find(s => s.status === "SUCCESS");

    if (completedFeed) {
      const portion = dispenseAmount; // Use the defined dispense amount
  
      // Update charts and log
      recordSuccessfulFeed(portion);
      addLog(`Background sync: Hardware finished the ${completedFeed.time} feed.`);
  
      scheduledTimes = scheduledTimes.filter(s => s.time !== completedFeed.time);
  
      // Push the updated array back to Firebase
      fetch(firebaseURL, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduled_times: scheduledTimes })
      }).then(() => renderScheduleList());
    } 
  })
  .catch(error => {
    feederDot.className = "status-dot danger"; 
    monitorDot.className = "status-dot danger"; 
    console.log(`[STATUS CHECK ERROR] ${error.message}`);
  });
}

function renderScheduleList() {
  const scheduleList = document.getElementById("scheduleList");
  if (!scheduleList) return;
  scheduleList.innerHTML = ""; 
  
  // Sort times chronologically using object properties
  scheduledTimes.sort((a, b) => a.time.localeCompare(b.time));

  scheduledTimes.forEach((schedule, index) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <span>${schedule.time} <small>(${schedule.status})</small></span>
      <button class="control-button" style="padding: 2px 8px; margin-left: 10px; border-color: #ff6b6b; color: #ff6b6b;" onclick="removeTime(${index})">X</button>
    `;
    scheduleList.appendChild(li);
  });

  // Target the '.time' property specifically to prevent [object Object] from showing
  nextFeedStat.textContent = scheduledTimes.length > 0 ? scheduledTimes[0].time : "Not set";
}

// Global function to remove a time and instantly sync to Firebase
window.removeTime = function(index) {
  systemStatus.textContent = "Updating schedule...";
  
  // Remove the time from our local array
  scheduledTimes.splice(index, 1); 
  
  // Push the newly updated array back to Firebase
  fetch(firebaseURL, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scheduled_times: scheduledTimes })
  })
  .then(() => {
    systemStatus.textContent = "Schedule Updated";
    renderScheduleList(); // Redraw the UI
  });
};

//helper function to update the dispense amount in Firebase
window.updateDispenseAmount = function(newGrams) {
  const amount = parseInt(newGrams, 10);
  if (isNaN(amount) || amount <= 0) {
    addLog("Invalid portion size.");
    return;
  }

  systemStatus.textContent = "Updating portion size...";

  fetch(firebaseURL, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dispense_amount: amount })
  })
  .then(response => {
    if (!response.ok) throw new Error("Failed to update cloud.");
    dispenseAmount = amount;
    addLog(`Success: System will now dispense ${amount}g per meal.`);
    systemStatus.textContent = "Portion Updated";
  })
  .catch(error => addLog(`[ERROR] ${error.message}`));
};

addLog("System online. Attempting cloud handshake...");
dashboardState = loadDashboardState();
updateBowl(bowlLevel, false);
setStatsFromState();
renderAnalytics();
window.addEventListener("resize", () => renderAnalytics());

syncSystemStatus();
initializeCloudData();
setInterval(syncSystemStatus, 30000); // Check system status every 30 seconds
