const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const fs = require("fs");
const db = require("./services/db");

const app = express();

app.use(cors());
app.use(bodyParser.json({ limit: "15mb" }));
app.use(express.static(path.join(__dirname, "public")));

// Route modules
const authRoutes = require("./routes/auth");
const chatRoutes = require("./routes/chat");
const socialRoutes = require("./routes/social");
const gamificationRoutes = require("./routes/gamification");
const integrationsRoutes = require("./routes/integrations");
const physiqueRoutes = require("./routes/physique");
const activitiesRoutes = require("./routes/activities");
const settingsRoutes = require("./routes/settings");
const adminRoutes = require("./routes/admin");
const notificationsRoutes = require("./routes/notifications");

app.use("/api/auth", authRoutes);
app.use("/", chatRoutes);
app.use("/", socialRoutes);
app.use("/", gamificationRoutes);
app.use("/", integrationsRoutes);
app.use("/", physiqueRoutes);
app.use("/", activitiesRoutes);
app.use("/", settingsRoutes);
app.use("/", adminRoutes);
app.use("/", notificationsRoutes);

// Utilities and cron jobs
const {
  syncAllStravaUsersOnStartup,
  calculateGlobalMaxStats,
  generateAllPublicProfiles,
  sendMorningMessage,
  runDailyRecoveryJob,
} = require("./services/utils");

const { sseClients } = require("./services/sse");
const cron = require('node-cron');

// Startup setup
db.serialize(() => {
  console.log("Database initialized (schema from services/db.js).");
  
  // Sync all Strava users on boot
  syncAllStravaUsersOnStartup();
  
  // Create global leaderboard stats
  calculateGlobalMaxStats();
});

// Periodic Jobs
// Schedule morning message to run every day at 08:00 AM (Europe/Amsterdam timezone)
cron.schedule('0 8 * * *', () => {
  sendMorningMessage();
}, {
  scheduled: true,
  timezone: "Europe/Amsterdam"
});

// Schedule daily recovery & degradation job to run every day at 00:05 AM (Europe/Amsterdam timezone)
cron.schedule('5 0 * * *', () => {
  runDailyRecoveryJob();
}, {
  scheduled: true,
  timezone: "Europe/Amsterdam"
});

setInterval(() => {
  // Sync all Strava users every 2 hours
  syncAllStravaUsersOnStartup();
}, 2 * 60 * 60 * 1000);

setInterval(() => {
  // Update Leaderboard Profiles Daily at 3 AM AMS time
  const amsDate = new Date().toLocaleTimeString("en-CA", {
    timeZone: "Europe/Amsterdam",
    hour12: false,
  });
  if (amsDate.startsWith("03:00:")) {
    generateAllPublicProfiles();
  }
}, 60 * 1000);

setInterval(() => {
  // Update Leaderboard Stats every 6 hours
  calculateGlobalMaxStats();
}, 6 * 60 * 60 * 1000);



// Graceful Shutdown
process.on("SIGINT", () => {
  console.log("Closing database connection...");
  db.close(() => {
    console.log("Database connection closed.");
    process.exit(0);
  });
});

const http = require("http");
const { WebSocketServer } = require("ws");

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message);
      if (data.type === "auth") {
        ws.token = data.token;
      }
    } catch (_) {}
  });
});

const PORT = process.env.PORT || 3009;
const HOST = process.env.HOST || "0.0.0.0";
server.listen(PORT, HOST, () => {
  console.log(`Server is running on http://${HOST}:${PORT} (HTTP & WebSocket)`);
});
