const express = require("express");
const router = express.Router();
const db = require("../services/db");
const { authenticateToken } = require("../services/auth");
const { getUserLeaderboardString } = require("../services/utils");
const { generateWithFallback } = require("../services/ai");
const { sendSSEEvent } = require("../services/sse");

const adminAuthMiddleware = (req, res, next) => {
  const isRutger = req.user.username && req.user.username.toLowerCase().includes("rutger");
  const isFelix = req.user.username && req.user.username.toLowerCase().includes("felixson");
  const isAdminTier = req.user.subscription_tier === 'admin';
  if (!isRutger && !isFelix && !isAdminTier && req.user.id !== 1) {
    return res.status(403).json({ error: "Unauthorized" });
  }
  next();
};

router.use("/api/admin", adminAuthMiddleware);

router.post("/api/admin/simulate-24h", authenticateToken, async (req, res) => {
  const user = req.user;
  console.log(`🤖 Simulating 24h inactivity for user ${user.id}...`);

  db.get(
    `SELECT coach_tone FROM users WHERE id = ?`,
    [user.id],
    async (err, row) => {
      const lbString = await getUserLeaderboardString(user.id);
      const prompt = `The user has not logged any activities or sent any messages in over 24 hours. Write a short, proactive message checking in on them and asking how their training is going. Use the tone: ${row ? row.coach_tone : "Friendly and motivating"}. Keep it under 2 sentences. If applicable, playfully use their standing on the leaderboard to motivate them: ${lbString}`;
      try {
        const systemPrompt = `You are Spark, an elite endurance coach. Your tone is: ${row ? row.coach_tone : "Friendly and motivating"}. Act like a real human in a continuous text message thread.`;
        const aiReply = await generateWithFallback(prompt, systemPrompt);
        db.run(
          `INSERT INTO chat_history (user_id, role, content, mood) VALUES (?, 'coach', ?, 'curious')`,
          [user.id, aiReply],
          (err) => {
             if (err) { console.error(err); return; }
             sendSSEEvent(user.id, "unread_message", {
               message: aiReply,
               mood: "curious",
             });
          }
        );
        res.json({ success: true, message: "Trigger fired." });
      } catch (e) {
        console.error("Simulated AI generation failed:", e);
        res.status(500).json({ error: "Failed" });
      }
    },
  );
});

router.post("/api/admin/trigger-morning", authenticateToken, async (req, res) => {
  const { sendMorningMessage } = require("../services/utils");
  console.log(`🤖 Admin triggering morning message job...`);
  try {
    await sendMorningMessage();
    res.json({ success: true, message: "Morning message job triggered!" });
  } catch (e) {
    console.error("Admin trigger morning failed:", e);
    res.status(500).json({ error: "Failed" });
  }
});

router.get("/api/admin/usage", authenticateToken, (req, res) => {
  const query = `
        SELECT 
            u.username, 
            u.login_count, 
            u.chat_count,
            u.daily_token_usage,
            u.common_token_usage,
            u.daily_token_limit,
            u.subscription_tier,
            u.last_token_reset_date,
            u.spark_plus_clicks,
            u.data_request_clicks,
            CASE WHEN u.strava_refresh_token IS NOT NULL AND u.strava_refresh_token != '' THEN 1 ELSE 0 END as strava_connected,
            CASE WHEN u.garmin_username IS NOT NULL AND u.garmin_username != '' THEN 1 ELSE 0 END as garmin_connected,
            (SELECT COUNT(*) FROM activities WHERE user_id = u.id) as activities_count
        FROM users u
        WHERE u.deleted_at IS NULL
        ORDER BY u.login_count DESC
    `;
  db.all(query, [], (err, rows) => {
    if (err) return res.status(500).json({ error: "Database error" });
    const { getEffectiveTokenLimit, getAMSDateString } = require('../services/utils');
    const todayStr = getAMSDateString();
    const enrichedRows = rows.map(r => {
      if (r.last_token_reset_date !== todayStr) {
        r.daily_token_usage = 0;
        r.common_token_usage = 0;
      }
      r.effective_limit = getEffectiveTokenLimit(r);
      return r;
    });
    res.json(enrichedRows);
  });
});

router.post("/api/admin/add-tokens", authenticateToken, (req, res) => {
  const { targetUsername } = req.body;
  if (!targetUsername) return res.status(400).json({ error: "Missing username" });

  db.run(
    `UPDATE users SET daily_token_limit = COALESCE(daily_token_limit, 50000) + 50000 WHERE username = ? AND deleted_at IS NULL`,
    [targetUsername],
    function (err) {
      if (err) return res.status(500).json({ error: "Database error" });
      if (this.changes === 0) return res.status(404).json({ error: "User not found or deleted" });
      
      db.run(
        `INSERT INTO audit_logs (admin_username, action, target_username, details) VALUES (?, 'add_tokens', ?, '+50000 tokens')`,
        [req.user.username, targetUsername]
      );
      
      res.json({ success: true, message: "Added 50k tokens to limit." });
    },
  );
});

router.delete("/api/admin/delete-user/:targetUsername", authenticateToken, (req, res) => {
  const { targetUsername } = req.params;
  if (!targetUsername) return res.status(400).json({ error: "Missing username" });
  
  if (targetUsername.toLowerCase().includes("rutger") || targetUsername.toLowerCase().includes("felixson")) {
      return res.status(403).json({ error: "Cannot delete admin accounts" });
  }

  db.run(
    `UPDATE users SET deleted_at = CURRENT_TIMESTAMP WHERE username = ? AND deleted_at IS NULL`,
    [targetUsername],
    function (err) {
      if (err) return res.status(500).json({ error: "Database error" });
      if (this.changes === 0) return res.status(404).json({ error: "User not found or already deleted" });
      
      db.run(
        `INSERT INTO audit_logs (admin_username, action, target_username, details) VALUES (?, 'soft_delete', ?, 'Account soft deleted')`,
        [req.user.username, targetUsername]
      );
      
      res.json({ success: true, message: "Account deleted (soft)." });
    }
  );
});

router.post("/api/admin/set-tier", authenticateToken, (req, res) => {

    const { targetUsername, tier } = req.body;
    if (!targetUsername || !tier) return res.status(400).json({ error: "Missing parameters" });

    // Set tier, and automatically adjust daily_token_limit so it takes effect immediately
    const limit = tier === 'spark_plus' ? 50000 : 10000;

    db.run(
        `UPDATE users SET subscription_tier = ?, daily_token_limit = ? WHERE username = ?`,
        [tier, limit, targetUsername],
        function (err) {
            if (err) return res.status(500).json({ error: "Database error" });
            if (this.changes === 0) return res.status(404).json({ error: "User not found" });
            res.json({ success: true, message: `Set ${targetUsername} tier to ${tier}` });
        }
    );
});

router.post("/api/admin/trigger-weekly-onboarding", authenticateToken, async (req, res) => {
  const { runWeeklyFeatureOnboardingJob } = require("../services/onboarding");
  console.log(`🤖 Admin triggering weekly onboarding job...`);
  try {
    await runWeeklyFeatureOnboardingJob();
    res.json({ success: true, message: "Weekly feature onboarding job triggered!" });
  } catch (e) {
    console.error("Admin trigger onboarding failed:", e);
    res.status(500).json({ error: "Failed to trigger onboarding job" });
  }
});

router.get("/api/admin/onboarding-status/:userId", authenticateToken, async (req, res) => {
  const { evaluateUserFeatureUsage, FEATURES_REGISTRY } = require("../services/onboarding");
  const userId = parseInt(req.params.userId, 10);
  if (isNaN(userId)) return res.status(400).json({ error: "Invalid userId" });

  await evaluateUserFeatureUsage(userId);

  db.all(
    `SELECT feature_key, status, introduced_at, first_used_at FROM user_feature_onboarding WHERE user_id = ?`,
    [userId],
    (err, rows) => {
      if (err) return res.status(500).json({ error: "Database error" });

      const statusMap = new Map();
      if (rows) {
        rows.forEach((r) => statusMap.set(r.feature_key, r));
      }

      const featureStatusList = FEATURES_REGISTRY.map((f) => {
        const record = statusMap.get(f.key);
        return {
          key: f.key,
          name: f.name,
          description: f.description,
          status: record ? record.status : "not_introduced",
          introduced_at: record ? record.introduced_at : null,
          first_used_at: record ? record.first_used_at : null
        };
      });

      res.json({ userId, features: featureStatusList });
    }
  );
});

module.exports = router;
