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
const dashboardStateKey = "smartPetFeeder.dashboardState";
const chartLabels = ["D-6", "D-5", "D-4", "D-3", "D-2", "D-1", "Today"];
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
  const payload = {
    ...dashboardState,
    feedingHistory: dashboardState.feedingHistory.slice(-7),
    bowlHistory: dashboardState.bowlHistory.slice(-7),
    petActivity: dashboardState.petActivity.slice(-7)
  };

  try {
    localStorage.setItem(dashboardStateKey, JSON.stringify(payload));
  } catch {
    // Ignore storage errors in demo mode.
  }
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

function drawComparisonChart(canvas, dispensedValue, remainingValue) {
  if (!canvas) {
    return;
  }

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

  bars.forEach((bar, index) => {
    const x = padding + index * (barWidth + 22);
    const barHeight = (Math.max(bar.value, 1) / 100) * (chartHeight - 14);
    const y = height - padding - barHeight;
    const gradient = context.createLinearGradient(x, y, x, y + barHeight);
    gradient.addColorStop(0, bar.colorStart);
    gradient.addColorStop(1, bar.colorEnd);

    context.fillStyle = gradient;
    context.fillRect(x, y, barWidth, barHeight);

    context.fillStyle = "rgba(238, 246, 251, 0.9)";
    context.font = "13px Segoe UI, Arial, sans-serif";
    context.textAlign = "center";
    context.fillText(String(bar.value), x + barWidth / 2, y - 6);
    context.fillText(bar.label, x + barWidth / 2, height - 8);
  });
}

function renderAnalytics() {
  drawBarChart(feedingHistoryChart, dashboardState.feedingHistory, chartLabels, "rgba(86, 208, 182, 0.92)", "rgba(141, 216, 255, 0.92)");
  drawLineChart(bowlTrendChart, dashboardState.bowlHistory, chartLabels, "rgba(255, 202, 122, 0.96)", "rgba(255, 202, 122, 0.18)");
  drawBarChart(petActivityChart, dashboardState.petActivity, chartLabels, "rgba(141, 216, 255, 0.95)", "rgba(86, 208, 182, 0.95)");
  drawComparisonChart(balanceChart, Math.min(100, dashboardState.mealsToday * 14), bowlLevel);
}

function syncDashboard() {
  setStatsFromState();
  saveDashboardState();
  renderAnalytics();
}

function recordSuccessfulFeed(portion) {
  dashboardState.mealsToday += 1;
  dashboardState.lastFeedingTime = timestamp();
  dashboardState.feedingHistory.push(dashboardState.mealsToday);
  dashboardState.petActivity.push(petPresent ? 1 : 0);
  dashboardState.feedingHistory = dashboardState.feedingHistory.slice(-7);
  dashboardState.petActivity = dashboardState.petActivity.slice(-7);
  updateBowl(bowlLevel + portion, true);
  addLog(`Feeding recorded. ${portion}% portion logged for the dashboard.`);
}

function loadStoredScheduleTime() {
  const savedTime = localStorage.getItem(storedScheduleKey);

  if (savedTime) {
    feedTime.value = savedTime;
    addLog(`Loaded saved schedule time ${savedTime}.`);
  }
}

function initializeBowl(){
  fetch(firebaseURL)
  .then(response => {
    if (!response.ok)
      throw new Error("cloud database refused connection.");    
    return response.text();
  })
  .then(level => {
    const numericLevel = parseInt(level, 10);
    updateBowl(Number.isNaN(numericLevel) ? 10 : numericLevel, true);
  })
  .catch(error => {
    addLog(`[ERROR] ${error.message}`);
    updateBowl(10, true); // Default bowl level
  }); 
}

function updateBowl(level, recordHistory = false) {
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

  if (recordHistory) {
    dashboardState.bowlHistory.push(bowlLevel);
    dashboardState.bowlHistory = dashboardState.bowlHistory.slice(-7);
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
  const scheduledTime = getScheduledTimeLabel();
  if (!scheduledTime) {
    return;
  }

  localStorage.setItem(storedScheduleKey, scheduledTime);
  systemStatus.textContent = `Scheduled for ${scheduledTime}`;
  addLog(`Scheduled feeding time saved as ${scheduledTime}.`);
  syncDashboard();
});

remoteFeed.addEventListener("click", () => {
  addLog("Remote feed requested from mobile interface.");
  if (bowlLevel >= 90) {
    systemStatus.textContent = statusCopy.blocked;
    addLog("Remote request denied because the bowl is too full.");
    syncDashboard();
    return;
  }

  fetch(firebaseURL, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ feed_command: 1 }) // 1 means "dispense now"
  })
  .then(response => {
    if (!response.ok) throw new Error("Failed to send command to cloud.");
    const portion = petPresent ? 14 : 10;
    addLog(`Command sent to cloud. Expecting ${portion}% portion dispense.`);
    systemStatus.textContent = "Command Sent";
    recordSuccessfulFeed(portion);
  })
  .catch(error => {
    addLog(`[ERROR] ${error.message}`);
    systemStatus.textContent = "Cloud Error";
  });
});

togglePresence.addEventListener("click", () => {
  fetch(firebaseURL, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pet_present: petPresent }) 
  })
  .then(response => {
    if (!response.ok)
      throw new Error("cloud database refused connection.");
    if (petPresent) {
      addLog("Cloud simulated: Monitoring unit detected the pet.");
      systemStatus.textContent = statusCopy.ready;
    } else {
      addLog("Cloud simulated: No pet detected.");
      systemStatus.textContent = "Pet not detected";
    }
    
    // Log the activity to your charts
    dashboardState.petActivity.push(petPresent ? 1 : 0);
    dashboardState.petActivity = dashboardState.petActivity.slice(-7);
    syncDashboard();   
    })
    .catch(error => {
    addLog(`[ERROR] ${error.message}`);
    systemStatus.textContent = statusCopy.blocked;
    // Revert the variable if the cloud update failed
    petPresent = !petPresent;
  });
});

function syncSystemStatus() {
  const feederDot = document.getElementById("feederDot");
  const monitorDot = document.getElementById("monitorDot");

  // Hit the cloud root to see if the database is responsive
  fetch(firebaseURL)
  .then(response => {
    if (!response.ok) throw new Error("Database unresponsive");
    return response.json();
  })
  .then(data => {
    // Turn on the green indicators
   if (data && data.feeder_online === true) {
      // 🟢 HARDWARE CONNECTED
      if (feederDot) feederDot.classList.add("on");
      if (monitorDot) monitorDot.classList.add("on");
  } else {
      // 🔴 HARDWARE OFFLINE (Even if Firebase is reachable)
      if (feederDot) feederDot.classList.remove("on");
      if (monitorDot) monitorDot.classList.remove("on");
    }
  })
  .catch(error => {
    // 🔴 NO INTERNET / FIREBASE DOWN
    if (feederDot) feederDot.classList.remove("on");
    if (monitorDot) monitorDot.classList.remove("on");
    console.log(`[STATUS CHECK ERROR] ${error.message}`);
  });
}
addLog("System online. Feeder unit and monitoring unit are connected.");
addLog("Initial bowl check completed before dispensing.");
dashboardState = loadDashboardState();
updateBowl(bowlLevel, false);
feedTime.value = localStorage.getItem(storedScheduleKey) || "6:30";
loadStoredScheduleTime();
setStatsFromState();
renderAnalytics();
window.addEventListener("resize", () => renderAnalytics());

syncSystemStatus();
initializeBowl();
setInterval(syncSystemStatus, 30000); // Check system status every 30 seconds
