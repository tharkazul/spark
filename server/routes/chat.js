const express = require('express');
const { resolveCoachName, PLAIN_LANGUAGE_RULE } = require("../services/coachPersona");
const router = express.Router();
const db = require('../services/db');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const physiqueStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, "../secure_uploads/physique");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `physique_${req.user.id}_${crypto.randomUUID()}${ext}`);
  },
});
const uploadPhysique = multer({ storage: physiqueStorage });

const profileStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, "../public/uploads/profiles");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `profile_${req.user.id}_${Date.now()}${ext}`);
  },
});
const uploadProfile = multer({ storage: profileStorage });
const { authenticateToken } = require('../services/auth');
const { sseClients, sendSSEEvent } = require('../services/sse');
const { sendPushToUser } = require('../services/pushNotificationService');
const { generateWithFallback, generateImage } = require('../services/ai');
const { encrypt, decrypt } = require('../services/crypto');
const muscleLoad = require('../services/muscleLoad');
const { getUserGoalPromptContext, getGoalDependentPromptContext } = require('../services/goalPromptContext');
const { formatHrZonesForPrompt } = require('../services/athleteZones');
const constraintsService = require('../services/athleteConstraints');
const longTermMemory = require('../services/longTermMemory');
const {
  extractAndCleanFoodItems,
  matchGarminExercise,
  getAMSDateString,
  getAMSWeekday,
  getUserGamificationContext,
  getUserLeaderboardString,
  getWeatherContext,
  getUserMacroPhase,
  getUserGoalsContext,
  generatePublicProfile,
  processTokenRefresh,
  getStravaTokenForUser,
  getRookaLevelInfo,
  calculateRookaScoreZoned,
  mapStravaSportToRooka,
  formatStepsForStrava,
  tagStravaActivity,
  getStravaActivity,
  syncAllStravaUsersOnStartup,
  triggerBackgroundSummary,
  updateUserRookaAndCheckLevel,
  triggerLevelUpCoachPrompt,
  generateQuestForUser,
  evaluateQuestsAgainstActivity,
  canAccessQuests,
  getEffectiveTokenLimit
} = require('../services/utils');

// The coach's standing rules open every chat prompt and are byte-identical for every
// athlete and every message, so ai.js keeps them in an explicit Gemini cache billed at a
// tenth of the input price (cachedSystemPrefix). Anything athlete-, date- or tier-specific
// belongs after them, never inside: a changing rules text means a new cache per variant.
const COACH_CHAT_RULES = fs
  .readFileSync(path.join(__dirname, "../prompts/coach_chat_rules.md"), "utf8")
  .trim()
  .replace("{{PLAIN_LANGUAGE_RULE}}", PLAIN_LANGUAGE_RULE);

function splitCoachReply(text) {
  if (!text) return [];
  const parts = text
    .split(/(?:\r?\n)?(?:---(?:MSG|SPLIT|BREAK)---|\[\[SPLIT\]\]|<break\s*\/?>|<br\s*\/?>)(?:\r?\n)?/gi)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  return parts.length > 0 ? parts : [text.trim()];
}

router.get("/api/events", authenticateToken, (req, res) => {
  const userId = req.user.id;

  // Set headers for SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // Disable Nginx/Cloudflare buffering if applicable

  // Send initial connection event
  res.write(`data: ${JSON.stringify({ connected: true })}\n\n`);

  // Store the client
  if (!sseClients.has(userId)) {
    sseClients.set(userId, new Set());
  }
  const clients = sseClients.get(userId);
  clients.add(res);

  // Send a heartbeat ping every 30 seconds to keep connection alive (prevents Cloudflare QUIC timeout)
  const heartbeat = setInterval(() => {
    try {
      res.write(": ping\n\n");
    } catch (err) {
      clearInterval(heartbeat);
    }
  }, 30000);

  // Remove client when connection closes
  req.on("close", () => {
    clearInterval(heartbeat);
    clients.delete(res);
    if (clients.size === 0) {
      sseClients.delete(userId);
    }
  });
});

router.get("/api/chat/history", authenticateToken, (req, res) => {
  db.all(
    `SELECT id, role, content, mood, timestamp, image_path, payload_json FROM chat_history WHERE user_id = ? ORDER BY id ASC`,
    [req.user.id],
    (err, rows) => {
      if (err)
        return res.status(500).json({ error: "Failed to load chat history." });
      res.json(rows || []);
    },
  );
});

router.post("/api/chat", authenticateToken, async (req, res) => {
  const { message, imagesBase64 } = req.body;
  db.run(`UPDATE users SET chat_count = chat_count + 1 WHERE id = ?`, [
    req.user.id,
  ]);

  let base64DataArray = [];
  let imagePathsDB = [];

  if (imagesBase64 && Array.isArray(imagesBase64)) {
    for (const b64 of imagesBase64) {
      try {
        const matches = b64.match(
          /^data:image\/([A-Za-z-+\/]+);base64,(.+)$/,
        );
        if (matches && matches.length === 3) {
          const ext = matches[1];
          const base64Data = matches[2];
          const fileName = `img_${req.user.id}_${crypto.randomUUID()}.${ext}`;
          const dir = path.join(__dirname, "secure_uploads/chat_images");
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          const savePath = path.join(dir, fileName);
          fs.writeFileSync(savePath, base64Data, "base64");
          imagePathsDB.push(`/api/images/chat/${fileName}`);
          base64DataArray.push(base64Data);
        }
      } catch (e) {
        console.error("Image saving error:", e);
      }
    }
  }

  db.get(
    `SELECT coach_tone, coach_name, coach_context, athlete_context, gender, language, long_term_memory, daily_token_usage, common_token_usage, last_token_reset_date, daily_token_limit, subscription_tier, role, daily_image_count, last_image_reset_date, training_availability FROM users WHERE id = ?`,
    [req.user.id],
    async (err, user) => {
      if (err) {
        console.error("DB Error fetching user context:", err);
        return res
          .status(500)
          .json({ error: "Failed to load athlete context." });
      }
      if (!user) {
        user = {
          coach_tone: 'hype',
          coach_name: 'Rooka',
          coach_context: 'Empathetic athletic performance coach',
          athlete_context: 'Active athlete',
          gender: 'prefer_not_to_say',
          language: 'en',
          long_term_memory: '',
          daily_token_usage: 0,
          common_token_usage: 0,
          last_token_reset_date: new Date().toISOString().split("T")[0],
          daily_token_limit: 50000,
          subscription_tier: 'rooka_plus',
          role: 'user',
          daily_image_count: 0,
          last_image_reset_date: new Date().toISOString().split("T")[0],
          training_availability: null
        };
      }

      // Token limit logic
      const todayStr = new Date().toISOString().split("T")[0];
      let currentDailyUsage = user.daily_token_usage || 0;
      let currentDailyLimit = getEffectiveTokenLimit(user);

      if (user.last_token_reset_date !== todayStr) {
        currentDailyUsage = 0;
        // Reset to their tier default limit on a new day
        currentDailyLimit = user.subscription_tier === 'rooka_plus' ? 50000 : 10000;
        db.run(
          `UPDATE users SET daily_token_usage = 0, common_token_usage = 0, daily_token_limit = ?, last_token_reset_date = ? WHERE id = ?`,
          [currentDailyLimit, todayStr, req.user.id],
        );
      }

      // Image generation quota logic (Admin tier only: 1 image/day)
      const isAdminTier = user.subscription_tier === 'admin' || user.role === 'admin';
      let dailyImageCount = user.daily_image_count || 0;
      if (user.last_image_reset_date !== todayStr) {
        dailyImageCount = 0;
        db.run(
          `UPDATE users SET daily_image_count = 0, last_image_reset_date = ? WHERE id = ?`,
          [todayStr, req.user.id]
        );
      }
      const canGenerateImage = isAdminTier && dailyImageCount < 1;

      if (currentDailyUsage > currentDailyLimit) {
        const replyText = require("../services/i18n").t(user.language, "chat.tokenLimit");
        return db.run(
          `INSERT INTO chat_history (user_id, role, content) VALUES (?, 'user', ?)`,
          [req.user.id, message],
          (err) => {
            db.run(
              `INSERT INTO chat_history (user_id, role, content, mood) VALUES (?, 'coach', ?, 'default')`,
              [req.user.id, replyText],
              (err) => {
                return res.json({ reply: replyText, mood: "default" });
              }
            );
          }
        );
      }

      // Check if the athlete recently sent this exact message (within the last 3 minutes)
      // and we already generated a coach response in a previous attempt (e.g. client connection dropped).
      db.all(
        `SELECT id, role, content, mood, timestamp FROM chat_history WHERE user_id = ? ORDER BY id DESC LIMIT 6`,
        [req.user.id],
        async (historyCheckErr, recentRows) => {
          if (!historyCheckErr && recentRows && recentRows.length > 0) {
            const userMsgTrimmed = (message || '').trim();
            const latestUserRow = recentRows.find((r) => r.role === 'user');

            if (latestUserRow && latestUserRow.content && latestUserRow.content.trim() === userMsgTrimmed) {
              const rawTs = latestUserRow.timestamp;
              const msgAgeMs = rawTs 
                ? (Date.now() - new Date(typeof rawTs === 'string' && (rawTs.includes('Z') || rawTs.includes('T')) ? rawTs : String(rawTs).replace(' ', 'T') + 'Z').getTime())
                : 0;

              // If sent within the last 3 minutes (180,000 ms) or fresh timestamp
              if (msgAgeMs >= 0 && msgAgeMs < 180000) {
                const matchedCoachRows = recentRows.filter((r) => r.role === 'coach' && r.id > latestUserRow.id);
                if (matchedCoachRows.length > 0) {
                  matchedCoachRows.reverse(); // chronological ASC
                  const existingReplies = matchedCoachRows.map((r) => r.content);
                  const existingReply = existingReplies.join('\n\n');
                  const mood = matchedCoachRows[0].mood || 'default';
                  console.log(`⚡️ Replaying existing coach response for retried message (User ${req.user.id})`);
                  return res.json({
                    reply: existingReply,
                    replies: existingReplies,
                    mood: mood,
                    planUpdated: false,
                    replayed: true,
                  });
                }
              }
            }
          }

          const imagePathValue = imagePathsDB.length > 0 ? JSON.stringify(imagePathsDB) : null;
          let userMessageId = null;
          try {
            userMessageId = await new Promise((resolve, reject) => {
              db.run(
                `INSERT INTO chat_history (user_id, role, content, image_path, timestamp) VALUES (?, 'user', ?, ?, datetime('now'))`,
                [req.user.id, message, imagePathValue],
                function (err) {
                  if (err) return reject(err);
                  resolve(this.lastID);
                }
              );
            });
          } catch (userInsertErr) {
            console.error("Failed to insert user chat message immediately:", userInsertErr);
          }

          db.all(
            `SELECT metric, value FROM athlete_metrics WHERE user_id = ?`,
            [req.user.id],
            async (err, metricsRows) => {
              const metricsText =
                metricsRows && metricsRows.length > 0
                  ? metricsRows.map((m) => `${m.metric}: ${m.value}`).join(", ")
                  : "None explicitly recorded yet.";
              const hrZonesText = await formatHrZonesForPrompt(req.user.id).catch(() => "");

              const recentBiometrics = await new Promise((resolve) => {
                db.all(
                  `SELECT date, resting_hr, avg_hr, hrv_sdnn, sleep_minutes, sleep_deep_minutes, sleep_rem_minutes, sleep_core_minutes, sleep_awake_minutes, steps, active_calories, weight_kg, vo2_max 
                   FROM biometrics WHERE user_id = ? ORDER BY date DESC LIMIT 7`,
                  [req.user.id],
                  (err, rows) => resolve(rows || [])
                );
              });

              let biometricsContextText = "No Apple Health / Garmin biometric records synced yet.";
              if (recentBiometrics && recentBiometrics.length > 0) {
                const todayStr = getAMSDateString();
                const todayBio = recentBiometrics.find(b => b.date === todayStr) || recentBiometrics[0];
                const lines = [];
                if (todayBio) {
                  lines.push(`TODAY (${todayBio.date}):`);
                  if (todayBio.sleep_minutes && todayBio.sleep_minutes > 0) {
                    const h = Math.floor(todayBio.sleep_minutes / 60);
                    const m = Math.round(todayBio.sleep_minutes % 60);
                    let stageStr = "";
                    if (todayBio.sleep_deep_minutes || todayBio.sleep_rem_minutes) {
                      stageStr = ` (Deep: ${Math.round(todayBio.sleep_deep_minutes || 0)}m, REM: ${Math.round(todayBio.sleep_rem_minutes || 0)}m, Core: ${Math.round(todayBio.sleep_core_minutes || 0)}m, Awake: ${Math.round(todayBio.sleep_awake_minutes || 0)}m)`;
                    }
                    lines.push(`- Sleep: ${h}h ${m}m total${stageStr}`);
                  }
                  if (todayBio.hrv_sdnn) lines.push(`- HRV (SDNN): ${todayBio.hrv_sdnn} ms`);
                  if (todayBio.resting_hr) lines.push(`- Resting Heart Rate: ${todayBio.resting_hr} bpm`);
                  if (todayBio.steps) lines.push(`- Steps: ${todayBio.steps}`);
                  if (todayBio.active_calories) lines.push(`- Active Calories Burned: ${todayBio.active_calories} kcal`);
                  if (todayBio.vo2_max) lines.push(`- VO2 Max: ${todayBio.vo2_max}`);
                  if (todayBio.weight_kg) lines.push(`- Weight: ${todayBio.weight_kg} kg`);
                }
                if (recentBiometrics.length > 1) {
                  const hrvs = recentBiometrics.filter(b => b.hrv_sdnn).map(b => b.hrv_sdnn);
                  const rhrs = recentBiometrics.filter(b => b.resting_hr).map(b => b.resting_hr);
                  if (hrvs.length > 0) {
                    const avgHrv = hrvs.reduce((a, b) => a + b, 0) / hrvs.length;
                    lines.push(`- 7-Day Baseline HRV: ${Math.round(avgHrv * 10) / 10} ms`);
                  }
                  if (rhrs.length > 0) {
                    const avgRhr = rhrs.reduce((a, b) => a + b, 0) / rhrs.length;
                    lines.push(`- 7-Day Baseline Resting HR: ${Math.round(avgRhr * 10) / 10} bpm`);
                  }
                }
                biometricsContextText = lines.join("\n");
              }

              const phase = await getUserMacroPhase(req.user.id);
              try {
                db.all(
                  `SELECT name, sport_type, distance_km, moving_time_min, rooka_score, start_date, laps_json FROM activities WHERE user_id = ? ORDER BY start_date DESC LIMIT 3`,
                  [req.user.id],
                  async (err, recentActivities) => {
                const recentActivitiesText =
                  recentActivities && recentActivities.length > 0
                    ? recentActivities
                        .map(
                          (a) => {
                            let lapStr = "";
                            if (a.laps_json) {
                              try {
                                const laps = JSON.parse(a.laps_json);
                                if (laps && laps.length > 0) {
                                  lapStr = " | Laps: " + laps.map(l => {
                                    let pace = "";
                                    if (l.average_speed > 0) {
                                      const paceSecs = 1000 / l.average_speed;
                                      const m = Math.floor(paceSecs / 60);
                                      const s = Math.floor(paceSecs % 60);
                                      pace = `, ${m}:${s.toString().padStart(2, '0')}/km`;
                                    }
                                    const hr = l.average_heartrate ? `, ${Math.round(l.average_heartrate)}bpm` : "";
                                    return `[${l.name || 'Lap'}: ${(l.distance/1000).toFixed(1)}km in ${Math.round(l.moving_time/60)}m${pace}${hr}]`;
                                  }).join(" ");
                                }
                              } catch (e) {}
                            }
                            return `- ${getAMSDateString(a.start_date)} at ${new Date(a.start_date).toLocaleTimeString("en-GB", { timeZone: "Europe/Amsterdam", hour: "2-digit", minute: "2-digit" })}: ${a.name} (${a.sport_type}) | ${parseFloat(a.distance_km).toFixed(1)}km | ${Math.round(a.moving_time_min)}min | ${Math.round(a.rooka_score || 0)} Rooka${lapStr}`;
                          }
                        )
                        .join("\n")
                    : "No recent activities recorded.";

                db.all(
                  `SELECT sport_type, start_date, sets_json FROM activities WHERE user_id = ? AND sets_json IS NOT NULL AND sets_json != '[]' ORDER BY start_date DESC LIMIT 5`,
                  [req.user.id],
                  async (err, recentSetsRows) => {
                    let recentSetsText = "No recent strength/PB data recorded.";
                    if (recentSetsRows && recentSetsRows.length > 0) {
                      recentSetsText = recentSetsRows
                        .map(
                          (row) =>
                            `Date: ${row.start_date}, Sport: ${row.sport_type}, Details: ${row.sets_json}`,
                        )
                        .join("\n");
                    }

                    const todayStr = getAMSDateString();
                    db.all(
                      `SELECT * FROM micro_plan WHERE user_id = ? AND date >= date(?, '-2 days') ORDER BY date ASC LIMIT 20`,
                      [req.user.id, todayStr],
                      async (err, planRows) => {
                        const planText =
                          planRows && planRows.length > 0
                            ? planRows
                                .map((p) => {
                                  let line = `- ${p.date}: ${p.sport} - ${p.description} (${p.target_rooka || p.target_tss || 0} Rooka)`;
                                  if (p.source === 'template') {
                                    line += ` [standard template week, not yet personalized by you]`;
                                  } else if (p.source === 'user') {
                                    line += ` [added by the athlete themselves: kept unless you output this date with the same sport or Rest]`;
                                  } else if (p.origin === 'chat') {
                                    line += ` [agreed with the athlete in chat]`;
                                  }
                                  if (p.details && p.details.trim()) {
                                    line += `\n    Details: ${p.details.trim()}`;
                                  }
                                  if (p.steps_json && p.steps_json.trim() && p.steps_json !== "[]") {
                                    try {
                                      const parsed = JSON.parse(p.steps_json);
                                      line += `\n    Steps: ${JSON.stringify(parsed)}`;
                                    } catch (e) {
                                      line += `\n    Steps: ${p.steps_json.trim()}`;
                                    }
                                  }
                                  return line;
                                })
                                .join("\n")
                            : "No upcoming workouts scheduled.";

                        const deletedRows = await new Promise((resolve) => {
                          db.all(
                            `SELECT * FROM deleted_micro_plan WHERE user_id = ? AND deleted_at >= datetime('now', '-7 days') ORDER BY id DESC LIMIT 5`,
                            [req.user.id],
                            (err, rows) => resolve(rows || []),
                          );
                        });

                        let deletedWorkoutsText = "No recently deleted workouts in archive.";
                        if (deletedRows && deletedRows.length > 0) {
                          deletedWorkoutsText = deletedRows
                            .map((d) => {
                              let line = `- [Archive ID: ${d.id}] Date: ${d.date}, Sport: ${d.sport}, Description: "${d.description}" (${d.target_rooka || 0} Rooka, deleted: ${d.deleted_at})`;
                              if (d.details && d.details.trim()) {
                                line += `\n    Details: ${d.details.trim()}`;
                              }
                              if (d.steps_json && d.steps_json.trim() && d.steps_json !== "[]") {
                                try {
                                  const parsed = JSON.parse(d.steps_json);
                                  line += `\n    Steps: ${JSON.stringify(parsed)}`;
                                } catch (e) {
                                  line += `\n    Steps: ${d.steps_json.trim()}`;
                                }
                              }
                              return line;
                            })
                            .join("\n");
                        }

                        const milestonesText = await getUserGoalsContext(req.user.id);
                        const goalContext = await getUserGoalPromptContext(req.user.id, user);

                            db.all(
                              `SELECT body_part, severity, notes, status FROM athlete_niggles WHERE user_id = ?`,
                              [req.user.id],
                              async (err, allNiggleRows) => {
                                const activeNiggles = (allNiggleRows || []).filter((n) => n.status === "active");
                                const resolvedNiggles = (allNiggleRows || []).filter((n) => n.status === "resolved");

                                let nigglesText = "No active injuries or niggles reported. Athlete is 100% healthy with no active physical limitations.";
                                if (activeNiggles.length > 0) {
                                  nigglesText = activeNiggles
                                    .map(
                                      (n) =>
                                        `- ${n.body_part}: Severity ${n.severity}/5. ${n.notes || ""}`,
                                    )
                                    .join("\n");
                                }

                                let resolvedNigglesText = "";
                                if (resolvedNiggles.length > 0) {
                                  resolvedNigglesText =
                                    "\nRESOLVED / HEALED INJURIES (NO LONGER ACTIVE):\n" +
                                    resolvedNiggles
                                      .map((n) => `- ${n.body_part}: FULLY HEALED / RESOLVED`)
                                      .join("\n");
                                }
                                    // Muscle load now comes from the athlete's own activities via the
                                    // shared model, not from `athlete_muscle_status`. That table was filled
                                    // by one AI call per synced activity, so it held nothing for anyone
                                    // whose activities landed after the daily quota ran out — and the coach
                                    // then reasoned from "no significant fatigue" about an athlete in the
                                    // middle of a heavy block. These are the numbers the athlete is looking
                                    // at on the Progress tab.
                                    db.all(
                                      `SELECT ${muscleLoad.ACTIVITY_COLUMNS} FROM activities WHERE user_id = ? AND substr(replace(start_date, 'T', ' '), 1, 10) >= date('now', '-8 days')`,
                                      [req.user.id],
                                      async (err, muscleRows) => {
                                        const muscleStatusText = muscleLoad.describeMuscleStatus(
                                          err ? [] : muscleRows || []
                                        );

                                        db.all(
                                          `SELECT sport_type, test_name, metrics_json, coach_notes, completed_at FROM benchmark_tests WHERE user_id = ? ORDER BY created_at DESC LIMIT 5`,
                                          [req.user.id],
                                          async (err, benchmarkRows) => {
                                            let benchmarkText = "No completed benchmark test yet. Encourage athlete to complete their initial onboarding benchmark assessment.";
                                            if (benchmarkRows && benchmarkRows.length > 0) {
                                              benchmarkText = benchmarkRows.map(b => `- ${b.sport_type} [${b.test_name}]: ${b.metrics_json} (${b.coach_notes || 'Completed'})`).join("\n");
                                            }

                                            const historyQuery = userMessageId
                                              ? `SELECT role, content FROM (SELECT * FROM chat_history WHERE user_id = ? AND id != ? ORDER BY id DESC LIMIT 24) ORDER BY id ASC`
                                              : `SELECT role, content FROM (SELECT * FROM chat_history WHERE user_id = ? ORDER BY id DESC LIMIT 24) ORDER BY id ASC`;
                                            const historyParams = userMessageId
                                              ? [req.user.id, userMessageId]
                                              : [req.user.id];

                                            db.all(
                                              historyQuery,
                                              historyParams,
                                              async (err, historyRows) => {
                                                const todayStr = getAMSDateString();
                                                db.get(
                                                  `SELECT logged_carbs, logged_protein, logged_fat, items_summary FROM daily_diet_logs WHERE user_id = ? AND date = ?`,
                                                  [req.user.id, todayStr],
                                                  async (err, todayDietRow) => {
                                                    const loggedCarbs = Math.round((todayDietRow && todayDietRow.logged_carbs) || 0);
                                                    const loggedProtein = Math.round((todayDietRow && todayDietRow.logged_protein) || 0);
                                                    const loggedFat = Math.round((todayDietRow && todayDietRow.logged_fat) || 0);
                                                    const itemsSummary = todayDietRow && todayDietRow.items_summary ? todayDietRow.items_summary.trim() : "";

                                                    let nutritionContextText = "TODAY'S LOGGED NUTRITION (SINGLE SOURCE OF TRUTH FOR DIET):\n";
                                                    if (itemsSummary || loggedCarbs > 0 || loggedProtein > 0 || loggedFat > 0) {
                                                      nutritionContextText += `- Current Logged Intake: ${loggedCarbs}g Carbs, ${loggedProtein}g Protein, ${loggedFat}g Fat\n`;
                                                      nutritionContextText += `- Items Already Logged Today: ${itemsSummary || "None explicitly named"}`;
                                                    } else {
                                                      nutritionContextText += "No food or drinks have been logged yet today. (0g Carbs, 0g Protein, 0g Fat)";
                                                    }

                                    // Declared out here so the catch below can release it.
                                    let releaseTx = null;
                                    try {
                                      let cleanHistory = [];

                                      (historyRows || []).forEach((row) => {
                                        let currentRole =
                                          row.role === "coach"
                                            ? "model"
                                            : "user";

                                        if (
                                          cleanHistory.length > 0 &&
                                          cleanHistory[cleanHistory.length - 1]
                                            .role === currentRole
                                        ) {
                                          cleanHistory[
                                            cleanHistory.length - 1
                                          ].parts[0].text +=
                                            "\n\n" + row.content;
                                        } else {
                                          cleanHistory.push({
                                            role: currentRole,
                                            parts: [{ text: row.content }],
                                          });
                                        }
                                      });

                                      if (
                                        cleanHistory.length > 0 &&
                                        cleanHistory[0].role !== "user"
                                      ) {
                                        cleanHistory.shift();
                                      }
                                      if (
                                        cleanHistory.length > 0 &&
                                        cleanHistory[cleanHistory.length - 1]
                                          .role === "user"
                                      ) {
                                        cleanHistory.pop();
                                      }

                                      // Deduplicate: If previous turn in cleanHistory answered this exact message,
                                      // strip it out so Gemini treats this message fresh without repetition.
                                      const incomingTrimmed = (message || "").trim();
                                      if (cleanHistory.length >= 2) {
                                        const lastTurnUser = cleanHistory[cleanHistory.length - 2];
                                        if (
                                          lastTurnUser &&
                                          lastTurnUser.role === "user" &&
                                          lastTurnUser.parts &&
                                          lastTurnUser.parts[0] &&
                                          lastTurnUser.parts[0].text &&
                                          lastTurnUser.parts[0].text.trim() === incomingTrimmed
                                        ) {
                                          cleanHistory.pop();
                                          cleanHistory.pop();
                                        }
                                      }

                                      const todayStr = getAMSDateString();
                                      const next7Days = Array.from(
                                        { length: 7 },
                                        (_, i) => {
                                          const d = new Date();
                                          d.setDate(d.getDate() + i);
                                          return `${getAMSWeekday(d)}: ${getAMSDateString(d)}`;
                                        },
                                      ).join(", ");

                                       const gamification =
                                         await getUserGamificationContext(
                                           req.user.id,
                                         );

                                       // Fetch recurring weekly sports (non-Rooka activities)
                                       const recurringRows = await new Promise((resolve) => {
                                         db.all(
                                           `SELECT title, day_of_week, start_time, duration_minutes, sport, intensity FROM recurring_trainings WHERE user_id = ? AND is_active = 1 ORDER BY id ASC`,
                                           [req.user.id],
                                           (err, rows) => resolve(err || !rows ? [] : rows)
                                         );
                                       });
                                       let recurringTrainingsText = "No recurring weekly sports configured.";
                                       if (recurringRows && recurringRows.length > 0) {
                                         recurringTrainingsText = recurringRows
                                           .map(
                                             (r) =>
                                               `- ${r.day_of_week}: "${r.title}" (Sport: ${r.sport || 'Other'}, Duration: ${r.duration_minutes || 60}m, Intensity: ${r.intensity || 'moderate'}${r.start_time ? `, Start Time: ${r.start_time}` : ''})`
                                           )
                                           .join("\n");
                                       }

                                       // Parse daily exercise limitations & training availability
                                       let availabilityText = "No specific schedule boundaries or daily duration limits set.";
                                       if (user.training_availability) {
                                         try {
                                           const availObj = typeof user.training_availability === 'string'
                                             ? JSON.parse(user.training_availability)
                                             : user.training_availability;
                                           if (availObj && typeof availObj === 'object' && Object.keys(availObj).length > 0) {
                                             const dayOrder = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
                                             const dayNames = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday' };
                                             const formattedDays = [];

                                             dayOrder.forEach((d) => {
                                               const match = availObj[d] || availObj[d.toLowerCase()] || availObj[d.toUpperCase()] ||
                                                 availObj[dayNames[d]] || availObj[dayNames[d].toLowerCase()];
                                               if (match) {
                                                 const isAvail = match.available !== false && match.status !== 'blocked';
                                                 const maxM = match.maxMinutes !== undefined ? match.maxMinutes : (match.max_minutes !== undefined ? match.max_minutes : 0);
                                                 formattedDays.push(`- ${dayNames[d]}: ${isAvail && maxM > 0 ? `Available (Max: ${maxM} min)` : 'Rest day / Blocked (0 min)'}`);
                                               }
                                             });

                                             Object.entries(availObj).forEach(([day, data]) => {
                                               const dNorm = day.slice(0, 3).toLowerCase();
                                               const matchedOrder = dayOrder.some(d => d.toLowerCase() === dNorm);
                                               if (!matchedOrder && data) {
                                                 const isAvail = data.available !== false && data.status !== 'blocked';
                                                 const maxM = data.maxMinutes ?? data.max_minutes ?? 0;
                                                 formattedDays.push(`- ${day.charAt(0).toUpperCase() + day.slice(1)}: ${isAvail && maxM > 0 ? `Available (Max: ${maxM} min)` : 'Rest day / Blocked (0 min)'}`);
                                               }
                                             });

                                             if (formattedDays.length > 0) {
                                               availabilityText = formattedDays.join("\n");
                                             }
                                           }
                                         } catch (e) {
                                           console.error("Error parsing training_availability:", e);
                                         }
                                       }

                                       const activeConstraints = await constraintsService
                                         .getCurrentAndUpcomingConstraints(req.user.id, todayStr)
                                         .catch(() => []);
                                       const constraintsText = constraintsService.formatConstraintsForPrompt(activeConstraints, todayStr);

                                       const coachName = resolveCoachName(user);
                                       let coachToneText = user.coach_tone;
                                       if (user.coach_tone === 'custom' || user.coach_tone === 'Configure own coach') {
                                           coachToneText = user.coach_context ? `Custom tone: ${user.coach_context}` : 'Custom coach persona';
                                       }

                                       const userLanguage = user.language || 'en';

                                       const imageStatusText = !isAdminTier
                                         ? `IMAGES: disabled for this athlete (admin-only test). If they ask you to generate, show or draw an image, photo or visual guide, explain the coaching cues and biomechanics in text and mention: "AI visual coaching guides and custom race artwork are currently in testing for administrators." Never output a generate_image block.`
                                         : dailyImageCount >= 1
                                         ? `IMAGES: today's visual coaching credit is used (1 of 1). If the athlete asks for an image, photo or visual guide, explain the coaching cues and biomechanics thoroughly in text and tell them: "You've used your 1 visual coaching credit for today (it resets tomorrow)!" Never output a generate_image block.`
                                         : `IMAGES: this admin athlete has 1 visual guide credit left today. When they ask for a visual explanation or an image, explain the concept in text AND add a block that generates a studio photograph:
\`\`\`json
{"type": "generate_image", "data": {"prompt": "Studio sports photography of a real human athlete executing [precise movement/technique details, exact limb angles, and body alignment]. Deep depth of field, f/8 aperture, razor-sharp focus across entire body and equipment, bright even studio/pool/track lighting, freeze-frame, 1/4000s shutter speed, zero motion blur, authentic human anatomy, clean background, 8k commercial sports quality", "caption": "Short descriptive title of the visual guide", "aspectRatio": "1:1"}}
\`\`\`
Never request illustrations, drawings, sketches or cartoons, and never use words like "cinematic depth of field" or "motion blur", which cause distortion. Always request razor-sharp, studio-lit commercial sports photography.`;

                                       const cycleText =
                                         (user.gender === "Female" || user.gender === "Prefer not to share" || user.gender === "Prefer not to say") && user.cycle_tracking_enabled !== 0
                                           ? `MENSTRUAL CYCLE: Proactively ask when her/their menstrual cycle starts to optimize training, track these dates in long-term memory, and distribute exercises carefully, reducing physical demand during the strenuous days of the cycle. When the athlete mentions that their period started today or on a specific date, add:
\`\`\`json
{"type": "log_cycle", "data": {"start_date": "YYYY-MM-DD"}}
\`\`\``
                                           : "";

                                       // Ordered from most to least shared, so the longest possible prefix
                                       // repeats across requests: the rules, then per-discipline drills, then
                                       // this athlete, then what changes by the minute.
                                       const systemPrompt = `${COACH_CHAT_RULES}
${getGoalDependentPromptContext(goalContext.discipline, { includeBaseHeader: false })}
${imageStatusText}
${cycleText}

COACH PERSONA:
Name: ${coachName}
Tone: ${coachToneText}
${user.coach_context ? `Coach Custom Context & Rules: ${user.coach_context}` : ""}

Current Training Phase: ${phase || user.training_phase || "Base/General"}

TIME CONTEXT:
Current Date & Time: ${todayStr} at ${new Date().toLocaleTimeString("en-GB", { timeZone: "Europe/Amsterdam", hour: "2-digit", minute: "2-digit" })}
The upcoming week mapping is:
${next7Days}
${await getWeatherContext()}
ATHLETE CONTEXT:
Gender: ${user.gender || "Prefer not to share"}
${user.athlete_context}

${nutritionContextText}

LONG-TERM MEMORY (From Past Conversations):
${user.long_term_memory}

PHYSIOLOGICAL METRICS:
${metricsText}

HEART-RATE ZONES:
${hrZonesText}

ATHLETE RECOVERY & BIOMETRICS (FROM APPLE HEALTH / GARMIN):
${biometricsContextText}

UPCOMING EVENTS/MILESTONES:
${milestonesText}

DAILY EXERCISE LIMITATIONS & WEEKLY SCHEDULE BOUNDARIES:
${availabilityText}

RECURRING SPORTS & PERIODICAL TRAININGS (NON-ROOKA ACTIVITIES):
${recurringTrainingsText}

TRAINING CONSTRAINTS: TRAVEL / ILLNESS / EQUIPMENT (REAL-TIME SINGLE SOURCE OF TRUTH):
${constraintsText}

UPCOMING SCHEDULED WORKOUTS (Microplan):
${planText}

RECENTLY DELETED WORKOUTS (TEMPORARY ARCHIVE - AVAILABLE FOR RESTORATION):
${deletedWorkoutsText}

RECENT COMPLETED WORKOUTS (For context):
${recentActivitiesText}

RECENT STRENGTH & PB HISTORY:
${recentSetsText}

MUSCLE STATUS (Fatigue vs Peak Development):
${muscleStatusText}

BENCHMARK ASSESSMENTS & PERFORMANCE BASELINES:
${benchmarkText}

ACTIVE INJURIES / NIGGLES (REAL-TIME SINGLE SOURCE OF TRUTH):
${nigglesText}${resolvedNigglesText}

GAMIFICATION:
Current activity streak: ${gamification.streak} days. Bonus rooka points earned: ${gamification.bonusPoints}. Latest title/badge: "${gamification.latestTitle}".`;

                                      let aiReply = await generateWithFallback(
                                        message,
                                        systemPrompt,
                                        cleanHistory,
                                        base64DataArray,
                                        req.user.id,
                                        "personal",
                                        false,
                                        { language: userLanguage, cachedSystemPrefix: COACH_CHAT_RULES },
                                      );
                                      let planUpdated = false;
                                      const pendingImageTasks = [];
                                      let questCelebrationPrompt = null;
                                      let createdWorkouts = null;

                                      // Wrap the plan mutations below and the chat_history writes further down
                                      // in a single transaction, so a workout can never get committed to the
                                      // plan without the chat message that produced it being saved (or vice versa).
                                      // Serialised: one SQLite connection means two overlapping chat
                                      // requests would otherwise interleave their BEGIN/COMMIT and
                                      // commit each other's half-written work.
                                      releaseTx = await db.beginSerializedTransaction("chat");

                                      const jsonMatches = [
                                        ...aiReply.matchAll(
                                          /```(?:json)?\n?([\s\S]*?)```/gi,
                                        ),
                                      ];

                                      // Fallback: if no fenced code block was found, check if a raw JSON object exists in the reply
                                      if (jsonMatches.length === 0) {
                                        const rawJsonMatch = aiReply.match(/\{\s*"type"\s*:\s*"(?:log_diet|log_nutrition|log_activity|log_weight|log_cycle|log_niggle|resolve_niggle|metrics|memory|life_event|travel|log_constraint|end_constraint|cancel_constraint|generate_image)"[\s\S]*?\}/);
                                        if (rawJsonMatch) {
                                          jsonMatches.push([rawJsonMatch[0], rawJsonMatch[0]]);
                                        }
                                      }

                                      // Constraints first, so workouts in the same reply are checked
                                      // against the rules the coach just recorded.
                                      let constraintsChanged = false;
                                      for (const match of jsonMatches) {
                                        let parsedDirective = null;
                                        try {
                                          parsedDirective = JSON.parse(match[1]);
                                        } catch (_) {
                                          continue;
                                        }
                                        if (
                                          parsedDirective &&
                                          ["log_constraint", "end_constraint", "cancel_constraint"].includes(parsedDirective.type)
                                        ) {
                                          try {
                                            const result = await constraintsService.applyConstraintDirective(
                                              req.user.id,
                                              parsedDirective,
                                              getAMSDateString(),
                                            );
                                            console.log(`[Constraints] ${parsedDirective.type} for user ${req.user.id}: ${result.action}${result.id ? ` #${result.id}` : ""}`);
                                            if (result.id) constraintsChanged = true;
                                          } catch (constraintErr) {
                                            console.error("Failed to apply constraint directive from chat:", constraintErr);
                                          }
                                        }
                                      }

                                      for (const match of jsonMatches) {
                                        try {
                                          const parsedData = JSON.parse(
                                            match[1],
                                          );

                                          if (Array.isArray(parsedData)) {
                                            const planData = parsedData;
                                            createdWorkouts = planData;
                                            const affectedDates = [
                                              ...new Set(
                                                planData.map((day) => day.date),
                                              ),
                                            ];

                                            if (affectedDates.length > 0) {
                                              // The athlete's own sessions on these dates stay, unless the coach
                                              // re-sent that same sport (an edit) or cleared the day with Rest.
                                              const userRowsOnDates = await new Promise((resolveRows) => {
                                                db.all(
                                                  `SELECT id, date, sport FROM micro_plan WHERE user_id = ? AND source = 'user' AND date IN (${affectedDates.map(() => "?").join(",")})`,
                                                  [req.user.id, ...affectedDates],
                                                  (rowsErr, rows) => resolveRows(rowsErr || !rows ? [] : rows),
                                                );
                                              });
                                              const replacedUserIds = userRowsOnDates
                                                .filter((r) => {
                                                  const sameDay = planData.filter((d) => d.date === r.date);
                                                  const canon = constraintsService.canonicalSport(r.sport);
                                                  return (
                                                    sameDay.some((d) => constraintsService.canonicalSport(d.sport) === canon) ||
                                                    sameDay.every((d) => constraintsService.canonicalSport(d.sport) === "Rest")
                                                  );
                                                })
                                                .map((r) => r.id);
                                              const replaceableClause = `((source IS NULL OR source != 'user')${replacedUserIds.length > 0 ? ` OR id IN (${replacedUserIds.join(",")})` : ""})`;

                                              await new Promise((resolvePlan) => {
                                                const placeholders = affectedDates
                                                  .map(() => "?")
                                                  .join(",");
                                                db.serialize(() => {
                                                  // Archive existing workouts before overwriting or clearing
                                                  db.run(
                                                    `INSERT INTO deleted_micro_plan (original_id, user_id, date, sport, description, target_rooka, details, steps_json, source, deleted_at)
                                                     SELECT id, user_id, date, sport, description, target_rooka, details, steps_json, source, datetime('now')
                                                     FROM micro_plan 
                                                     WHERE user_id = ? AND date IN (${placeholders}) AND ${replaceableClause} AND (LOWER(sport) != 'rest' OR (details IS NOT NULL AND details != ''))`,
                                                    [req.user.id, ...affectedDates],
                                                    (archiveErr) => {
                                                      if (archiveErr)
                                                        console.error(
                                                          "Failed to archive old plan data before chat overwrite:",
                                                          archiveErr,
                                                        );
                                                    }
                                                  );

                                                  db.run(
                                                    `DELETE FROM micro_plan WHERE user_id = ? AND date IN (${placeholders}) AND ${replaceableClause}`,
                                                    [req.user.id, ...affectedDates],
                                                    (err) => {
                                                      if (err)
                                                        console.error(
                                                          "Failed to clear old plan data:",
                                                          err,
                                                        );
                                                    }
                                                  );

                                                  // origin 'chat': the Sunday auto-plan keeps these days.
                                                  const stmt = db.prepare(`
                                                      INSERT INTO micro_plan (user_id, date, sport, description, target_rooka, details, steps_json, source, origin) 
                                                      VALUES (?, ?, ?, ?, ?, ?, ?, 'coach', 'chat')
                                                  `);

                                                  planData.forEach((day) => {
                                                    stmt.run(
                                                      req.user.id,
                                                      day.date,
                                                      day.sport,
                                                      day.description,
                                                      require('../services/zones').planDayTargetRooka(day),
                                                      day.details,
                                                      day.steps ? JSON.stringify(day.steps) : (day.steps_json || "[]"),
                                                    );
                                                  });
                                                  stmt.finalize(() => {
                                                    // Clean up matching restored entries from deleted archive
                                                    planData.forEach((day) => {
                                                      if (day.sport && day.sport.toLowerCase() !== "rest") {
                                                        db.run(
                                                          `DELETE FROM deleted_micro_plan WHERE user_id = ? AND date = ? AND LOWER(sport) = LOWER(?)`,
                                                          [req.user.id, day.date, day.sport]
                                                        );
                                                      }
                                                    });
                                                    resolvePlan();
                                                  });
                                                });
                                              });
                                            }
                                            planUpdated = true;
                                          } else if (
                                            parsedData &&
                                            parsedData.type === "metrics" &&
                                            parsedData.data
                                          ) {
                                            await new Promise((resolveMetrics) => {
                                              db.serialize(() => {
                                                const stmt = db.prepare(
                                                  `INSERT INTO athlete_metrics (user_id, metric, value) VALUES (?, ?, ?) ON CONFLICT(user_id, metric) DO UPDATE SET value=excluded.value`,
                                                );
                                                for (const [
                                                  key,
                                                  val,
                                                ] of Object.entries(
                                                  parsedData.data,
                                                )) {
                                                  stmt.run(
                                                    req.user.id,
                                                    key,
                                                    String(val),
                                                  );
                                                }
                                                stmt.finalize(() => resolveMetrics());
                                              });
                                            });
                                          } else if (
                                            parsedData &&
                                            (parsedData.type === "memory" || parsedData.type === "life_event" || parsedData.type === "travel") &&
                                             (parsedData.data || parsedData.text || parsedData.notes)
                                           ) {
                                             const memoryNote = typeof parsedData.data === "string"
                                               ? parsedData.data
                                               : (parsedData.text || parsedData.notes || JSON.stringify(parsedData.data));
                                             if (memoryNote && memoryNote.trim()) {
                                               try {
                                                 await longTermMemory.appendMemoryNote(req.user.id, memoryNote);
                                               } catch (memErr) {
                                                 console.error("Failed to update long_term_memory from chat:", memErr);
                                               }
                                             }
                                           } else if (
                                             parsedData &&
                                             parsedData.type === "log_cycle" &&
                                            parsedData.data &&
                                            parsedData.data.start_date
                                          ) {
                                            const startDate =
                                              parsedData.data.start_date;
                                            await new Promise((resolveCycle) => {
                                              db.run(
                                                `UPDATE users SET last_cycle_start = ? WHERE id = ?`,
                                                [startDate, req.user.id],
                                                (err) => {
                                                  if (err)
                                                    console.error(
                                                      "Failed to update cycle start date from chat:",
                                                      err,
                                                    );
                                                  resolveCycle();
                                                },
                                              );
                                            });
                                            planUpdated = true;
                                          } else if (
                                             parsedData &&
                                             parsedData.type === "log_weight" &&
                                             parsedData.data &&
                                             parsedData.data.weight_kg
                                           ) {
                                             const weightKg = parseFloat(parsedData.data.weight_kg);
                                             const bodyFat = parsedData.data.body_fat_percent !== undefined ? parseFloat(parsedData.data.body_fat_percent) : null;
                                             const todayStr = getAMSDateString();

                                             // Wait for both inserts to complete before continuing
                                             await new Promise((resolveWeight) => {
                                               let completed = 0;
                                               const checkDone = () => {
                                                 completed++;
                                                 if (completed === 2) resolveWeight();
                                               };

                                               db.run(
                                                 `INSERT INTO physique_logs (user_id, date, weight_kg, notes) VALUES (?, ?, ?, ?)`,
                                                 [req.user.id, todayStr, weightKg, "Caught via AI Coach chat"],
                                                 (err) => {
                                                   if (err) console.error("Failed to log physique weight from chat:", err);
                                                   checkDone();
                                                 }
                                               );

                                               db.run(
                                                 `INSERT INTO biometrics (user_id, date, weight_kg, body_fat_percent) VALUES (?, ?, ?, ?)
                                                  ON CONFLICT(user_id, date) DO UPDATE SET weight_kg=excluded.weight_kg, body_fat_percent=COALESCE(excluded.body_fat_percent, biometrics.body_fat_percent)`,
                                                 [req.user.id, todayStr, weightKg, bodyFat],
                                                 (err) => {
                                                   if (err) console.error("Failed to log biometrics from chat:", err);
                                                   checkDone();
                                                 }
                                               );
                                             });
                                          } else if (
                                            parsedData &&
                                            (parsedData.type === "log_nutrition" || parsedData.type === "log_diet") &&
                                            parsedData.data
                                          ) {
                                            const diet = parsedData.data;
                                            const todayStr = getAMSDateString();
                                            const carbs = Number(diet.carbs || 0);
                                            const protein = Number(diet.protein || 0);
                                            const fat = Number(diet.fat || 0);

                                            // Sync daily_diet_logs & nutrition_intake with smart item extraction and deduplication
                                            await new Promise((resolveDiet) => {
                                              db.get(
                                                `SELECT logged_carbs, logged_protein, logged_fat, items_summary FROM daily_diet_logs WHERE user_id = ? AND date = ?`,
                                                [req.user.id, todayStr],
                                                (err, existingRow) => {
                                                  const existingSummary = existingRow ? (existingRow.items_summary || "") : "";
                                                  const existingItems = existingSummary
                                                    ? existingSummary.split(',').map((s) => s.trim()).filter(Boolean)
                                                    : [];
                                                  const existingNormalized = existingItems.map((s) => s.toLowerCase().replace(/[^a-z0-9]/g, ''));

                                                  const candidateItems = extractAndCleanFoodItems(diet);

                                                  // Filter out items that already exist in today's log
                                                  const newItems = candidateItems.filter((item) => {
                                                    const norm = item.toLowerCase().replace(/[^a-z0-9]/g, '');
                                                    if (!norm) return false;
                                                    const isDuplicate = existingNormalized.some(
                                                      (exNorm) =>
                                                        exNorm === norm ||
                                                        (exNorm.length > 5 && norm.length > 5 && (exNorm.includes(norm) || norm.includes(exNorm)))
                                                    );
                                                    return !isDuplicate;
                                                  });

                                                  // Guard: If all candidate items were already logged today, skip adding duplicate calories/macros
                                                  if (newItems.length === 0 && candidateItems.length > 0) {
                                                    console.log(`[Diet] Skipping duplicate diet log. All items already logged: "${candidateItems.join(', ')}"`);
                                                    return resolveDiet();
                                                  }

                                                  const itemsToAdd = newItems.length > 0 ? newItems : candidateItems;

                                                  const newCarbs = Math.max(0, (existingRow ? (existingRow.logged_carbs || 0) : 0) + carbs);
                                                  const newProtein = Math.max(0, (existingRow ? (existingRow.logged_protein || 0) : 0) + protein);
                                                  const newFat = Math.max(0, (existingRow ? (existingRow.logged_fat || 0) : 0) + fat);

                                                  const updatedItemsList = [...existingItems, ...itemsToAdd];
                                                  const newSummary = updatedItemsList.join(', ');

                                                  // 1. Sync nutrition_intake
                                                  db.run(
                                                    `INSERT INTO nutrition_intake (user_id, date, carbs, protein, fat)
                                                     VALUES (?, ?, ?, ?, ?)
                                                     ON CONFLICT(user_id, date) DO UPDATE SET
                                                       carbs = excluded.carbs,
                                                       protein = excluded.protein,
                                                       fat = excluded.fat`,
                                                    [req.user.id, todayStr, newCarbs, newProtein, newFat],
                                                    (err) => {
                                                      if (err) console.error("Failed to insert nutrition intake:", err);
                                                    }
                                                  );

                                                  // 2. Sync daily_diet_logs
                                                  db.run(
                                                    `INSERT INTO daily_diet_logs (user_id, date, logged_carbs, logged_protein, logged_fat, items_summary, updated_at)
                                                     VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                                                     ON CONFLICT(user_id, date) DO UPDATE SET
                                                       logged_carbs = excluded.logged_carbs,
                                                       logged_protein = excluded.logged_protein,
                                                       logged_fat = excluded.logged_fat,
                                                       items_summary = excluded.items_summary,
                                                       updated_at = CURRENT_TIMESTAMP`,
                                                    [req.user.id, todayStr, newCarbs, newProtein, newFat, newSummary],
                                                    (err) => {
                                                      if (err) console.error("Failed to upsert daily_diet_logs:", err);
                                                      resolveDiet();
                                                    }
                                                  );
                                                }
                                              );
                                            });
                                            planUpdated = true;
                                          } else if (
                                            parsedData &&
                                            parsedData.type ===
                                              "log_activity" &&
                                            parsedData.data
                                          ) {
                                            const act = parsedData.data;
                                            // Use negative ID to avoid collision with real Strava IDs
                                            const manualId = -Date.now();
                                            const startDate =
                                              new Date().toISOString();
                                            const rookaScore =
                                              act.rooka_score ||
                                              (await calculateRookaScoreZoned({
                                                userId: req.user.id,
                                                movingTimeMin: act.moving_time_min,
                                                avgHr: act.average_heartrate,
                                                sport: act.sport_type,
                                              }));

                                            await new Promise((resolveInsert) => {
                                              db.run(
                                                `INSERT INTO activities (id, user_id, name, sport_type, distance_km, moving_time_min, start_date, rooka_score, sets_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                                                [
                                                  manualId,
                                                  req.user.id,
                                                  act.name || "Manual Workout",
                                                  act.sport_type || "Workout",
                                                  act.distance_km || 0,
                                                  act.moving_time_min || 0,
                                                  startDate,
                                                  rookaScore,
                                                  JSON.stringify(act.sets || []),
                                                ],
                                                (err) => {
                                                  if (err)
                                                    console.error(
                                                      "Failed to insert manual activity:",
                                                      err,
                                                    );
                                                  else {
                                                    updateUserRookaAndCheckLevel(
                                                      req.user.id,
                                                    );
                                                    // Invalidate today's nutrition cache so it incorporates the new workout
                                                    const todayStr =
                                                      startDate.split("T")[0];
                                                    db.run(
                                                      `DELETE FROM nutrition_protocols WHERE user_id = ? AND date = ?`,
                                                      [req.user.id, todayStr],
                                                    );
                                                    sendSSEEvent(req.user.id, "activity_logged", { activityId: manualId });
                                                  }
                                                  resolveInsert();
                                                },
                                              );
                                            });

                                            // QUEST EVALUATION AFTER INSERT (paid tiers only)
                                            if (canAccessQuests(req.user.subscription_tier, req.user.role)) {
                                              try {
                                                const completedQuests =
                                                  await evaluateQuestsAgainstActivity(
                                                    req.user.id,
                                                    {
                                                      distance_km:
                                                        act.distance_km || 0,
                                                      moving_time_min:
                                                        act.moving_time_min || 0,
                                                      rooka_score: rookaScore,
                                                      sport_type: act.sport_type || "Workout",
                                                    },
                                                  );

                                                sendSSEEvent(req.user.id, "quest_updated", {});

                                                if (completedQuests && completedQuests.length > 0) {
                                                  // The reward lands in `bonus_points` after the
                                                  // total was recomputed above, so recompute again
                                                  // or the reward — and any level-up it triggers —
                                                  // only appears on some later unrelated request.
                                                  updateUserRookaAndCheckLevel(req.user.id);
                                                }

                                                if (
                                                  completedQuests &&
                                                  completedQuests.length > 0
                                                ) {
                                                  // Deferred until after COMMIT. This only appends celebration
                                                  // text, but awaiting the model here held the transaction open
                                                  // for as long as it took - up to a minute once the rate-limit
                                                  // backoff kicks in.
                                                  questCelebrationPrompt = `The user just manually logged an activity and ALSO completed their active quest: "${completedQuests[0].description}" earning ${completedQuests[0].reward_points} Rooka points! Give a short 1-2 sentence highly motivating response celebrating their completed quest!`;
                                                }
                                              } catch (e) {
                                                console.error(
                                                  "Quest evaluation failed during manual sync:",
                                                  e,
                                                );
                                              }
                                            }
                                            planUpdated = true; // Signal frontend to reload data/charts
                                          } else if (
                                            parsedData &&
                                            parsedData.type === "log_niggle" &&
                                            parsedData.data &&
                                            parsedData.data.body_part
                                          ) {
                                            const { body_part, severity, notes } = parsedData.data;
                                            const sev = Math.max(1, Math.min(5, Math.round(Number(severity) || 2)));
                                            await new Promise((resolveNiggle) => {
                                              db.get(
                                                `SELECT id FROM athlete_niggles WHERE user_id = ? AND body_part = ? AND status = 'active'`,
                                                [req.user.id, body_part],
                                                (err, row) => {
                                                  if (err) {
                                                    console.error("DB error checking niggle:", err);
                                                    return resolveNiggle();
                                                  }
                                                  if (row) {
                                                    db.run(
                                                      `UPDATE athlete_niggles SET severity = ?, notes = ? WHERE id = ?`,
                                                      [sev, notes || "", row.id],
                                                      () => {
                                                        triggerBackgroundSummary(req.user.id);
                                                        resolveNiggle();
                                                      }
                                                    );
                                                  } else {
                                                    db.run(
                                                      `INSERT INTO athlete_niggles (user_id, body_part, severity, notes, status) VALUES (?, ?, ?, ?, 'active')`,
                                                      [req.user.id, body_part, sev, notes || ""],
                                                      () => {
                                                        triggerBackgroundSummary(req.user.id);
                                                        resolveNiggle();
                                                      }
                                                    );
                                                  }
                                                }
                                              );
                                            });
                                            planUpdated = true;
                                          } else if (
                                            parsedData &&
                                            parsedData.type === "resolve_niggle" &&
                                            parsedData.data &&
                                            parsedData.data.body_part
                                          ) {
                                            const { body_part } = parsedData.data;
                                            await new Promise((resolveNiggle) => {
                                              db.run(
                                                `UPDATE athlete_niggles SET status = 'resolved', resolved_date = CURRENT_TIMESTAMP WHERE user_id = ? AND body_part = ? AND status = 'active'`,
                                                [req.user.id, body_part],
                                                (err) => {
                                                  if (err) console.error("Failed to resolve niggle via chat:", err);
                                                  triggerBackgroundSummary(req.user.id);
                                                  resolveNiggle();
                                                }
                                              );
                                            });
                                            planUpdated = true;
                                          } else if (
                                            parsedData &&
                                            parsedData.type === "generate_image" &&
                                            parsedData.data
                                          ) {
                                            const imgPrompt = parsedData.data.prompt || parsedData.data.description;
                                            const caption = parsedData.data.caption || "Coaching Visual";
                                            if (imgPrompt) {
                                              const pendingKey = `pending_${crypto.randomUUID()}`;
                                              pendingImageTasks.push({
                                                prompt: imgPrompt,
                                                caption,
                                                pendingKey,
                                                aspectRatio: parsedData.data.aspectRatio || "1:1",
                                              });
                                            }
                                          }
                                         } catch (e) {
                                           console.error(
                                             "Failed to parse an AI JSON block",
                                             e,
                                           );
                                         }
                                       }

                                       aiReply = aiReply
                                         .replace(/```(?:json)?[\s\S]*?```/gi, "")
                                         .replace(/\{\s*"type"\s*:\s*"(?:log_diet|log_nutrition|log_activity|log_weight|log_cycle|log_niggle|resolve_niggle|metrics|memory|life_event|travel|log_constraint|end_constraint|cancel_constraint|generate_image)"[\s\S]*?\}/gi, "")
                                         .trim();
                                         
                                       aiReply = aiReply.replace(/[^.!?\n]*:\s*$/i, "").trim();

                                       // Last line of defence: rewrite any stored coach day that breaks a
                                       // constraint (including ones the coach wrote just now) and say so.
                                       if (planUpdated || constraintsChanged) {
                                         try {
                                           const repairFrom = getAMSDateString();
                                           const upcomingConstraints = await constraintsService.getCurrentAndUpcomingConstraints(req.user.id, repairFrom);
                                           if (upcomingConstraints.length > 0) {
                                             const repairTo = upcomingConstraints.reduce((max, c) => (c.end_date > max ? c.end_date : max), repairFrom);
                                             const repairChanges = await constraintsService.repairStoredPlan(req.user.id, repairFrom, repairTo, user.language);
                                             if (repairChanges.length > 0) {
                                               planUpdated = true;
                                               aiReply += `\n---MSG---\n${constraintsService.describeChangesForChat(repairChanges, user.language)}`;
                                               if (createdWorkouts && createdWorkouts.length > 0) {
                                                 createdWorkouts = constraintsService.repairPlan(createdWorkouts, upcomingConstraints, user.language).plan;
                                               }
                                             }
                                           }
                                         } catch (repairErr) {
                                           console.error("Failed to enforce constraints on the stored plan:", repairErr);
                                         }
                                       }

                                       for (const task of pendingImageTasks) {
                                         aiReply += `\n\n![${task.caption}](loading://${task.pendingKey})`;
                                       }

                                      let mood = "default";
                                      const lowerReply = aiReply.toLowerCase();

                                      // if (lowerReply.includes('crush') || lowerReply.includes('!')) mood = 'hype';
                                      // if (lowerReply.includes('disappoint') || lowerReply.includes('skip')) mood = 'disappointed';

                                      // Define your keyword arrays here
                                      const hypeKeywords = [
                                        "crush",
                                        "!",
                                        "epic",
                                        "beast",
                                        "machine",
                                        "proud",
                                        "smash",
                                        "nailed",
                                        "unstoppable",
                                        "fire",
                                        "stellar",
                                      ];
                                      const disappointedKeywords = [
                                        "disappoint",
                                        "skip",
                                        "excuse",
                                        "slack",
                                        "shortcut",
                                        "off track",
                                        "slipping",
                                        "warning",
                                      ];
                                      const hornyKeywords = [
                                        "horny",
                                        "sexy",
                                        "flirt",
                                        "desire",
                                        "attractive",
                                        "love",
                                        "passion",
                                        "lust",
                                        "dream",
                                        "hot",
                                      ];
                                      // .some() acts as a giant OR statement across the whole array
                                      if (
                                        hypeKeywords.some((word) =>
                                          lowerReply.includes(word),
                                        )
                                      ) {
                                        mood = "hype";
                                      } else if (
                                        hornyKeywords.some((word) =>
                                          lowerReply.includes(word),
                                        )
                                      ) {
                                        mood = "horny";
                                      } else if (
                                        disappointedKeywords.some((word) =>
                                          lowerReply.includes(word),
                                         )
                                      ) {
                                        mood = "disappointed";
                                      }

                                       const imagePathValue = imagePathsDB.length > 0 ? JSON.stringify(imagePathsDB) : null;

                                       // 1. Fallback insert user message only if it failed to insert earlier
                                       if (!userMessageId) {
                                         try {
                                           await new Promise((resolve, reject) => {
                                             db.run(
                                               `INSERT INTO chat_history (user_id, role, content, image_path, timestamp) VALUES (?, 'user', ?, ?, datetime('now'))`,
                                               [req.user.id, message, imagePathValue],
                                               function (err) {
                                                 if (err) return reject(err);
                                                 resolve(this.lastID);
                                               }
                                             );
                                           });
                                         } catch (userInsertErr) {
                                           console.error("Failed to insert user chat message fallback:", userInsertErr);
                                         }
                                       }

                                       // 2. Sequentially insert coach reply parts with ordered timestamps (+1s, +2s, etc.)
                                       const messageParts = splitCoachReply(aiReply);
                                       for (let i = 0; i < messageParts.length; i++) {
                                         const part = messageParts[i];
                                         const partPayload = (i === messageParts.length - 1 && createdWorkouts && createdWorkouts.length > 0)
                                           ? JSON.stringify({ type: 'created_workout', workouts: createdWorkouts })
                                           : null;
                                         try {
                                           await new Promise((resolve, reject) => {
                                             db.run(
                                               `INSERT INTO chat_history (user_id, role, content, mood, payload_json, timestamp) VALUES (?, 'coach', ?, ?, ?, datetime('now', '+${i + 1} seconds'))`,
                                               [req.user.id, part, mood, partPayload],
                                               function (err) {
                                                 if (err) return reject(err);
                                                 resolve(this.lastID);
                                               }
                                             );
                                           });
                                         } catch (partInsertErr) {
                                           console.error(`Failed to insert coach reply part ${i}:`, partInsertErr);
                                         }
                                       }

                                       longTermMemory
                                         .shouldSummarizeAfterMessage(req.user.id, message)
                                         .then((due) => {
                                           if (due || constraintsChanged) triggerBackgroundSummary(req.user.id);
                                         })
                                         .catch((summaryErr) => console.error("Failed to check memory summary trigger:", summaryErr));

                                       try {
                                         await new Promise((resolve, reject) => {
                                           db.run("COMMIT", (err) => (err ? reject(err) : resolve()));
                                         });
                                       } catch (commitErr) {
                                         if (releaseTx) {
                                           releaseTx();
                                           releaseTx = null;
                                         }
                                         console.error(
                                           "Failed to commit chat/plan transaction:",
                                           commitErr,
                                         );
                                         return res.status(500).json({
                                           error: "Failed to save chat and plan updates.",
                                         });
                                       }

                                       if (releaseTx) {
                                         releaseTx();
                                         releaseTx = null;
                                       }

                                       // The celebration runs here, outside the transaction. The
                                       // stored coach message is patched to match, so history and
                                       // what the athlete sees do not diverge.
                                       if (questCelebrationPrompt) {
                                         try {
                                           const coachAddendum = await generateWithFallback(
                                             questCelebrationPrompt,
                                             "You are a motivating elite coach.",
                                             null,
                                             base64DataArray,
                                             null,
                                             "personal",
                                             false,
                                             { language: user.language },
                                           );
                                           if (coachAddendum) {
                                             aiReply += "\n\n" + coachAddendum;
                                             messageParts.push(coachAddendum);
                                             await new Promise((resolve) => {
                                               db.run(
                                                 `INSERT INTO chat_history (user_id, role, content, mood, timestamp) VALUES (?, 'coach', ?, 'hype', datetime('now', '+${messageParts.length + 1} seconds'))`,
                                                 [req.user.id, coachAddendum],
                                                 () => resolve()
                                               );
                                             });
                                           }
                                         } catch (celebrationErr) {
                                           console.error("Quest celebration generation failed:", celebrationErr.message);
                                         }
                                       }

                                        // 1. Send the instant response to the client immediately if socket is open
                                        if (!res.headersSent && !res.writableEnded) {
                                          try {
                                            res.json({
                                              reply: messageParts.join('\n\n'),
                                              replies: messageParts,
                                              mood: mood,
                                              planUpdated: planUpdated,
                                              workouts: createdWorkouts || undefined,
                                            });
                                          } catch (sendErr) {
                                            console.warn("Client disconnected before res.json completed:", sendErr.message);
                                          }
                                        }

                                        // 2. Broadcast via SSE & Send Push Notification so reply is never lost if app was backgrounded/closed
                                        const finalReplyText = messageParts.join('\n\n');
                                        sendSSEEvent(req.user.id, "unread_message", {
                                          message: finalReplyText,
                                          mood: mood,
                                        });

                                        const pushBody = finalReplyText.length > 1000 ? finalReplyText.slice(0, 997) + "..." : finalReplyText;
                                        sendPushToUser(req.user.id, {
                                          title: coachName || "Coach",
                                          body: pushBody,
                                          data: { url: "/(tabs)/coach", type: "coach" },
                                          badge: 1,
                                        }).catch((pushErr) => {
                                          console.warn("Push notification dispatch failed:", pushErr.message);
                                        });

                                        // 2. Asynchronously generate any requested images in the background ONLY if allowed by tier and quota
                                        if (pendingImageTasks.length > 0) {
                                          if (!canGenerateImage) {
                                            console.log(`🚫 Image generation blocked: User ${req.user.id} has no image credits available (Tier: ${user.subscription_tier}, Used: ${dailyImageCount}/1).`);
                                            for (const task of pendingImageTasks) {
                                              db.run(
                                                `UPDATE chat_history SET content = REPLACE(content, ?, '') WHERE user_id = ? AND content LIKE ?`,
                                                [`![${task.caption}](loading://${task.pendingKey})`, req.user.id, `%loading://${task.pendingKey}%`]
                                              );
                                              sendSSEEvent(req.user.id, "chat_image_failed", {
                                                pendingKey: task.pendingKey,
                                              });
                                            }
                                          } else {
                                            // Increment user's daily image count
                                            db.run(
                                              `UPDATE users SET daily_image_count = daily_image_count + 1 WHERE id = ?`,
                                              [req.user.id]
                                            );

                                            for (const task of pendingImageTasks) {
                                              (async () => {
                                                try {
                                                  console.log(`🎨 Background image generation starting for prompt: "${task.prompt}"...`);
                                                  const { base64Data, mimeType } = await generateImage(task.prompt, { aspectRatio: task.aspectRatio });
                                                  const ext = mimeType.includes("png") ? "png" : "jpg";
                                                  const fileName = `img_${req.user.id}_${crypto.randomUUID()}.${ext}`;
                                                  const dir = path.join(__dirname, "../secure_uploads/chat_images");
                                                  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                                                  const filePath = path.join(dir, fileName);
                                                  fs.writeFileSync(filePath, base64Data, "base64");

                                                  const realImageUrl = `/api/images/chat/${fileName}`;
                                                  // Update SQLite record so history persists
                                                  db.run(
                                                    `UPDATE chat_history SET content = REPLACE(content, ?, ?) WHERE user_id = ? AND content LIKE ?`,
                                                    [`loading://${task.pendingKey}`, realImageUrl, req.user.id, `%loading://${task.pendingKey}%`]
                                                  );

                                                  // Broadcast live to mobile app over WebSocket / SSE
                                                  sendSSEEvent(req.user.id, "chat_image_ready", {
                                                    pendingKey: task.pendingKey,
                                                    imageUrl: realImageUrl,
                                                    caption: task.caption,
                                                  });
                                                  console.log(`✅ Background image completed & broadcasted to athlete!`);
                                                } catch (bgErr) {
                                                  console.error("Background image generation error:", bgErr.message);
                                                  db.run(
                                                    `UPDATE chat_history SET content = REPLACE(content, ?, '') WHERE user_id = ? AND content LIKE ?`,
                                                    [`![${task.caption}](loading://${task.pendingKey})`, req.user.id, `%loading://${task.pendingKey}%`]
                                                  );
                                                  sendSSEEvent(req.user.id, "chat_image_failed", {
                                                    pendingKey: task.pendingKey,
                                                  });
                                                }
                                              })();
                                            }
                                          }
                                        }
                                      } catch (err) {
                                      console.error("Chat parsing error:", err);
                                      db.run("ROLLBACK", () => {
                                        if (releaseTx) {
                                          releaseTx();
                                          releaseTx = null;
                                        }
                                      });
                                      res
                                        .status(500)
                                        .json({
                                          error: err.message || "Failed to generate response.",
                                        });
                                    }
                                  },
                                ); // End daily diet logs
                                        },
                                      ); // End chat history
                                        },
                                      ); // End benchmark tests
                                    },
                                  ); // End muscle status
                                },
                               ); // End niggles fetch
                             },
                           ); // End microplan
                         },
                       ); // End recent sets
                     },
                     );
                 } catch (err) {
                   console.error("Error building context:", err);
                   res.status(500).json({ error: "Context building failed." });
                 }
        },
      ); // End metrics
    },
  ); // End recent history check
},
); // End user fetch
});

router.get("/api/chat/briefing", authenticateToken, (req, res) => {
  db.get(
    `SELECT content, mood, timestamp FROM chat_history 
            WHERE user_id = ? AND role = 'coach' AND date(timestamp, 'localtime') = date('now', 'localtime') 
            ORDER BY timestamp ASC LIMIT 1`,
    [req.user.id],
    (err, row) => {
      if (err) {
        console.error("Error fetching briefing:", err);
        return res.status(500).json({ error: "Failed to fetch briefing." });
      }
      res.json({ briefing: row || null });
    },
  );
});

router.post("/api/chat/checkin", authenticateToken, async (req, res) => {
  const { sendMorningMessageForUser } = require("../services/utils");
  try {
    const morningResult = await sendMorningMessageForUser(req.user.id);
    if (morningResult && morningResult.success) {
      return res.json({ reply: morningResult.message, message: morningResult.message, mood: "hype" });
    }
    if (morningResult && morningResult.skipped) {
      return res.json({ alreadySent: true, reason: morningResult.reason });
    }
  } catch (mErr) {
    console.warn("sendMorningMessageForUser error during checkin:", mErr);
  }

  // If already sent, already interacted, or outside morning window, do not generate unwanted messages
  return res.json({ alreadySent: true });
});

module.exports = router;
