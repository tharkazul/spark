const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const http = require("http");
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const fs = require("fs");
const db = require("./services/db");

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(bodyParser.json({ limit: "50mb" }));
app.use(express.static("public"));

// Admin & Legal static routing
app.get("/admin", (req, res) => res.sendFile(path.join(__dirname, "public", "admin.html")));
app.get("/privacy", (req, res) => res.sendFile(path.join(__dirname, "public", "privacy.html")));
app.get("/terms", (req, res) => res.sendFile(path.join(__dirname, "public", "terms.html")));
app.get("/support", (req, res) => res.sendFile(path.join(__dirname, "public", "support.html")));

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
const onboardingRoutes = require("./routes/onboarding");

app.use("/api/auth", authRoutes);
app.use("/api/onboarding", onboardingRoutes);
app.use("/", onboardingRoutes);
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
  resetDailyTokensForAllUsers,
  resetDailyNutritionForAllUsers,
} = require("./services/utils");

const { sseClients, initWebSocketServer } = require("./services/sse");
const { runWeeklyFeatureOnboardingJob } = require("./services/onboarding");
const cron = require('node-cron');

// Initialize WebSocket server attached to HTTP server
initWebSocketServer(server);

// Startup setup
db.serialize(() => {
  console.log("Database initialized (schema from services/db.js).");

  // Sync all Strava users on boot
  syncAllStravaUsersOnStartup();

  // Create global leaderboard stats
  calculateGlobalMaxStats();

  // Reset tokens & nutrition for any overdue accounts on startup
  resetDailyTokensForAllUsers();
  resetDailyNutritionForAllUsers();
});

// Periodic Jobs
// Schedule daily token & nutrition reset at midnight (Europe/Amsterdam timezone)
cron.schedule('0 0 * * *', () => {
  resetDailyTokensForAllUsers();
  resetDailyNutritionForAllUsers();
}, {
  scheduled: true,
  timezone: "Europe/Amsterdam"
});

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

// Schedule weekly feature onboarding check on Sundays at 10:00 AM (Europe/Amsterdam timezone)
cron.schedule('0 10 * * 0', () => {
  runWeeklyFeatureOnboardingJob();
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
  server.close(() => {
    db.close(() => {
      console.log("Database and server closed.");
      process.exit(0);
    });
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
