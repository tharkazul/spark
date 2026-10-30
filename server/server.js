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

// api.rooka.io reaches us through a Cloudflare tunnel (cloudflared on this VM), so
// every request arrives from loopback. Trusting only loopback hops makes req.ip the
// address Cloudflare saw, while X-Forwarded-For from a direct caller is ignored.
app.set("trust proxy", "loopback");

app.use(cors());
// Chat, voice transcription and feedback carry base64 images/audio in the JSON
// body; everything else is small, so the global limit stays tight.
app.post(["/api/chat", "/api/chat/transcribe", "/api/feedback"], bodyParser.json({ limit: "25mb" }));
app.use(bodyParser.json({ limit: "1mb" }));
// Localize API error/success messages into the athlete's selected language.
app.use(require("./services/i18n").localizeResponses);
app.use("/api", require("./services/rateLimit").apiLimit);
app.use(express.static(path.join(__dirname, "../public")));
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "../public/uploads")));
app.use("/uploads", express.static(path.join(__dirname, "public/uploads")));

// Admin & Legal static routing
app.get("/admin", (req, res) => res.sendFile(path.join(__dirname, "public", "admin.html")));
app.get("/privacy", (req, res) => res.sendFile(path.join(__dirname, "public", "privacy.html")));
app.get("/terms", (req, res) => res.sendFile(path.join(__dirname, "public", "terms.html")));
app.get("/support", (req, res) => res.sendFile(path.join(__dirname, "public", "support.html")));
// Uptime monitors poll this, so it has to touch the database, not just the process.
app.get("/status", (req, res) => {
  db.get("SELECT 1", (err) => {
    if (err) {
      console.error("[Status] database check failed:", err);
      return res.status(503).json({ status: "unhealthy", service: "rooka-api", error: "database unavailable", timestamp: new Date().toISOString() });
    }
    res.status(200).json({ status: "healthy", service: "rooka-api", timestamp: new Date().toISOString() });
  });
});

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
const discountsRoutes = require("./routes/discounts");
const onboardingRoutes = require("./routes/onboarding");
const webhooksRoutes = require("./routes/webhooks");

app.use("/api/auth", authRoutes);
app.use("/api/webhooks", webhooksRoutes);
app.use("/api/onboarding", onboardingRoutes);
app.use("/", onboardingRoutes);
app.use("/", chatRoutes);
app.use("/", socialRoutes);
app.use("/", gamificationRoutes);
app.use("/", integrationsRoutes);
app.use("/", require("./routes/suunto"));
app.use("/", require("./routes/trainerday"));
app.use("/", require("./routes/garmin"));
app.use("/", require("./routes/devices"));
app.use("/", physiqueRoutes);
app.use("/", activitiesRoutes);
app.use("/", settingsRoutes);
app.use("/", adminRoutes);
app.use("/", notificationsRoutes);
app.use("/", discountsRoutes);
app.use("/", require("./routes/season"));
app.use("/", require("./routes/facts"));
app.use("/", require("./routes/feedback"));
app.use("/", require("./routes/weather"));
app.use("/", require("./routes/liveCoach"));

// Body/upload limit errors as JSON the app can show, instead of Express's HTML page.
app.use((err, req, res, next) => {
  if (err && (err.type === "entity.too.large" || err.code === "LIMIT_FILE_SIZE")) {
    return res.status(413).json({ error: "Upload too large." });
  }
  if (err && (err.code === "UNSUPPORTED_FILE_TYPE" || err.name === "MulterError")) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

// Utilities and cron jobs
const {
  sendMorningMessage,
  runDailyRecoveryJob,
  resetDailyTokensForAllUsers,
  resetDailyNutritionForAllUsers,
  generateWeeklyAthleteDescriptionsJob,
  enforceMaxTitlesForAllUsers,
  syncAllStravaUsersOnStartup,
} = require("./services/utils");

const { sseClients, initWebSocketServer } = require("./services/sse");
const { runWeeklyFeatureOnboardingJob } = require("./services/onboarding");
const { runWeeklyWorkoutPlanningJob } = require("./services/workoutPlanning");
const { sendWeeklyNewUsersReport } = require("./services/weeklyReportService");
const cron = require('node-cron');

// Initialize WebSocket server attached to HTTP server
initWebSocketServer(server);

// Startup setup
db.serialize(() => {
  console.log("Database initialized (schema from services/db.js).");

  // Reset tokens & nutrition for any overdue accounts on startup
  resetDailyTokensForAllUsers();
  resetDailyNutritionForAllUsers();
  enforceMaxTitlesForAllUsers(5);
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

// Race moments every day at 09:00: race-plan offer when the taper starts, debrief the day after a race
cron.schedule('0 9 * * *', () => {
  require("./services/racePlan").runDailyRaceMomentsJob().catch((err) => console.error("[RaceMoments] job failed:", err));
}, {
  scheduled: true,
  timezone: "Europe/Amsterdam"
});

// Garmin refresh tokens last ~90 days; renew the ones running out so idle athletes stay connected
cron.schedule('30 3 * * *', () => {
  require("./services/garmin")
    .refreshExpiringConnections()
    .then((r) => r.checked && console.log(`[Garmin] renewed ${r.renewed}/${r.checked} expiring connection(s)`))
    .catch((err) => console.error("[Garmin] token renewal job failed:", err));
}, {
  scheduled: true,
  timezone: "Europe/Amsterdam"
});

// Schedule morning message to run every day at 07:00 AM (Europe/Amsterdam timezone)
cron.schedule('0 7 * * *', () => {
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

// Schedule weekly workout plan generation for coming week (Mon-Sun) on Sundays at 20:00 (Europe/Amsterdam timezone)
cron.schedule('0 20 * * 0', () => {
  runWeeklyWorkoutPlanningJob().catch((err) =>
    console.error('[CRON] Weekly workout planning job failed:', err)
  );
}, {
  scheduled: true,
  timezone: "Europe/Amsterdam"
});

// Schedule weekly new athlete registration & subscription digest on Sundays at 21:00 (Europe/Amsterdam timezone)
cron.schedule('0 21 * * 0', () => {
  sendWeeklyNewUsersReport().catch((err) =>
    console.error('[CRON] Weekly athlete digest email failed:', err)
  );
}, {
  scheduled: true,
  timezone: "Europe/Amsterdam"
});

// Schedule weekly public athlete description generator on Sunday nights at 23:00 (Europe/Amsterdam timezone)
cron.schedule('0 23 * * 0', () => {
  generateWeeklyAthleteDescriptionsJob();
}, {
  scheduled: true,
  timezone: "Europe/Amsterdam"
});

// Schedule automated daily database snapshot at 03:00 AM (Europe/Amsterdam timezone)
const { createSnapshot } = require("./services/backup");
cron.schedule('0 3 * * *', () => {
  createSnapshot('daily_auto').catch(err => console.error('[BACKUP] Daily snapshot failed:', err));
}, {
  scheduled: true,
  timezone: "Europe/Amsterdam"
});

// Every 5 minutes: read Expo push receipts and drop tokens of uninstalled apps
cron.schedule('*/5 * * * *', () => {
  require("./services/pushNotificationService").processPushReceipts().catch((err) =>
    console.error('[CRON] Push receipt check failed:', err)
  );
});

// Every 15 minutes: mirror plan changes onto connected TrainerDay calendars (only changed sessions cost API requests)
cron.schedule('*/15 * * * *', () => {
  require("./services/trainerday").syncAllTrainerDayUsers().catch((err) =>
    console.error('[CRON] TrainerDay sync failed:', err)
  );
});

// Every 15 minutes: mirror plan changes onto Garmin calendars over the official connection (Training API; unchanged sessions cost no calls)
cron.schedule('*/15 * * * *', () => {
  require("./services/garminTraining").syncAllGarminUsers().catch((err) =>
    console.error('[CRON] Garmin workout sync failed:', err)
  );
});

setInterval(() => {
  // Sync all Strava users every 2 hours
  syncAllStravaUsersOnStartup();
}, 2 * 60 * 60 * 1000);



// Graceful Shutdown (SIGINT from the terminal, SIGTERM from systemd/pm2 on a restart)
let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received, closing server and database connection...`);
  server.close(() => {
    db.close(() => {
      console.log("Database and server closed.");
      process.exit(0);
    });
  });
  // In-flight requests get 5s to finish; open SSE streams would otherwise keep
  // server.close() waiting forever.
  setTimeout(() => server.closeAllConnections(), 5000).unref();
  setTimeout(() => {
    console.error("Shutdown took longer than 10s, exiting anyway.");
    process.exit(1);
  }, 10000).unref();
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// With this many crons and background workers, one forgotten .catch() would
// otherwise take the whole API down (Node exits on an unhandled rejection).
process.on("unhandledRejection", (reason) => {
  console.error("🚨 [UNHANDLED REJECTION] (process kept alive):", reason);
});
// After an uncaught exception the process state is unknown: log and exit so the
// process manager restarts a clean one.
process.on("uncaughtException", (err, origin) => {
  console.error(`🚨 [FATAL] Uncaught exception (${origin}), exiting:`, err);
  process.exit(1);
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  require("./services/liveSessionWorker")
    .resumeLiveSessions()
    .catch((err) => console.error("[LiveCoach] resume failed:", err));
});
