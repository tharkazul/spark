const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const db = require("../services/db");
const { authenticateToken } = require("../services/auth");
const { getSparkLevelInfo } = require("../services/utils");

const profileStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, "../public/uploads/profiles");
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `profile_${req.user.id}_${Date.now()}${ext}`);
  },
});
const uploadProfile = multer({ storage: profileStorage });

const coachAvatarStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, "../public/uploads/coaches");
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const mood = req.body.mood || "neutral";
    cb(null, `coach_${req.user.id}_${mood}_${Date.now()}${ext}`);
  },
});
const uploadCoachAvatar = multer({ storage: coachAvatarStorage });


router.post("/api/settings/privacy", authenticateToken, (req, res) => {
  const { searchPrivacy } = req.body;
  db.run(
    `UPDATE users SET search_privacy = ? WHERE id = ?`,
    [searchPrivacy ? 1 : 0, req.user.id],
    function (err) {
      if (err) return res.status(500).json({ error: "DB_ERROR" });
      res.json({ success: true });
    },
  );
});

router.post("/api/notifications/register-push-token", authenticateToken, (req, res) => {
  const { pushToken, platform } = req.body;
  if (!pushToken) return res.status(400).json({ error: "Missing pushToken" });

  db.run(
    `INSERT INTO push_tokens (user_id, push_token, platform) VALUES (?, ?, ?)
     ON CONFLICT(push_token) DO UPDATE SET user_id = excluded.user_id, platform = excluded.platform`,
    [req.user.id, pushToken, platform || 'expo'],
    function (err) {
      if (err) {
        console.error("Push token save error:", err);
        return res.status(500).json({ error: "DB_ERROR" });
      }
      res.json({ success: true });
    }
  );
});

router.post(
  "/api/settings/profile-picture",
  authenticateToken,
  uploadProfile.single("photo"),
  (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const url = `/uploads/profiles/${req.file.filename}`;

    db.run(
      `UPDATE users SET profile_picture_url = ? WHERE id = ?`,
      [url, req.user.id],
      function (err) {
        if (err) {
          console.error(err);
          return res.status(500).json({ error: "DB_ERROR" });
        }
        res.json({ success: true, url });
      },
    );
  },
);

const handleCoachAvatarUpload = (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const mood = (req.body.mood || "neutral").toLowerCase();
  const url = `/uploads/coaches/${req.file.filename}`;

  let colName = "coach_avatar_neutral";
  if (mood === "hype") colName = "coach_avatar_hype";
  else if (mood === "disappointed") colName = "coach_avatar_disappointed";

  db.run(
    `UPDATE users SET ${colName} = ? WHERE id = ?`,
    [url, req.user.id],
    function (err) {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: "DB_ERROR" });
      }
      res.json({ success: true, mood, url });
    },
  );
};

router.post(
  "/api/settings/coach-avatar",
  authenticateToken,
  uploadCoachAvatar.single("photo"),
  handleCoachAvatarUpload
);

router.post(
  "/api/user/settings/coach-avatar",
  authenticateToken,
  uploadCoachAvatar.single("photo"),
  handleCoachAvatarUpload
);

router.get("/api/user/settings", authenticateToken, (req, res) => {
  db.get(
    `SELECT id, username, email, strava_refresh_token, garmin_username, coach_tone, coach_name, coach_context, coach_avatar_neutral, coach_avatar_hype, coach_avatar_disappointed, coach_avatar_horny, athlete_context, gender, language, last_cycle_start, average_cycle_length, search_privacy, profile_picture_url, training_availability, total_spark, daily_token_usage, daily_token_limit, subscription_tier, last_token_reset_date FROM users WHERE id = ?`,
    [req.user.id],
    (err, row) => {
      if (err || !row) return res.status(500).json({ error: "DB Error" });
      let availability = {};
      if (row.training_availability) {
        try {
          availability = JSON.parse(row.training_availability);
        } catch (e) {}
      }
      const sparkLevelInfo = getSparkLevelInfo(row.total_spark);
      
      const { getEffectiveTokenLimit, getAMSDateString } = require('../services/utils');
      const currentLimit = getEffectiveTokenLimit(row);
      const todayStr = getAMSDateString();
      const dailyUsage = (row.last_token_reset_date === todayStr) ? (row.daily_token_usage || 0) : 0;

      res.json({
        id: row.id,
        username: row.username,
        email: row.email,
        hasStrava: !!row.strava_refresh_token,
        hasGarmin: !!row.garmin_username,
        garminUsername: row.garmin_username,
        coachTone: row.coach_tone,
        coachName: row.coach_name || 'Spark',
        coachContext: row.coach_context || '',
        coachAvatarNeutral: row.coach_avatar_neutral || null,
        coachAvatarHype: row.coach_avatar_hype || null,
        coachAvatarDisappointed: row.coach_avatar_disappointed || null,
        coachAvatarHorny: row.coach_avatar_horny || null,
        athleteContext: row.athlete_context,
        gender: row.gender,
        language: row.language || 'en',
        lastCycleStart: row.last_cycle_start,
        averageCycleLength: row.average_cycle_length || 28,
        searchPrivacy: row.search_privacy === 1,
        profilePictureUrl: row.profile_picture_url,
        trainingAvailability: availability,
        sparkLevel: sparkLevelInfo,
        dailyTokenUsage: dailyUsage,
        dailyTokenLimit: currentLimit,
        subscriptionTier: row.subscription_tier || 'free',
        subscription_tier: row.subscription_tier || 'free',
      });
    },
  );
});

router.post("/api/user/settings/account", authenticateToken, (req, res) => {
  const { email } = req.body;
  // Note: we can also add username here later if we want to allow username changes, but that requires checking for uniqueness.
  
  if (email !== undefined) {
    db.run(
      `UPDATE users SET email = ? WHERE id = ?`,
      [email, req.user.id],
      function (err) {
        if (err) {
          if (err.message.includes('UNIQUE constraint failed')) {
            return res.status(400).json({ error: "Email is already in use by another account." });
          }
          return res.status(500).json({ error: "Failed to update account details." });
        }
        res.json({ success: true, message: "Account updated successfully" });
      }
    );
  } else {
    res.status(400).json({ error: "No fields to update." });
  }
});

router.post("/api/user/settings/coach", authenticateToken, (req, res) => {
  db.get(`SELECT * FROM users WHERE id = ?`, [req.user.id], (err, row) => {
    if (err || !row) return res.status(500).json({ error: "Database error." });

    const reqTone = req.body.coachTone !== undefined ? req.body.coachTone : row.coach_tone;
    const reqName = req.body.coachName !== undefined ? req.body.coachName : row.coach_name;
    const reqContext = req.body.coachContext !== undefined ? req.body.coachContext : row.coach_context;
    const athleteContext = req.body.athleteContext !== undefined ? req.body.athleteContext : row.athlete_context;
    const gender = req.body.gender !== undefined ? req.body.gender : row.gender;
    const lastCycleStart = req.body.lastCycleStart !== undefined ? req.body.lastCycleStart : row.last_cycle_start;
    const availabilityStr = req.body.trainingAvailability !== undefined
      ? JSON.stringify(req.body.trainingAvailability)
      : row.training_availability;

    let finalTone = reqTone;
    let finalName = reqName;
    let finalContext = reqContext;

    // Check premium/admin status
    const isPremium = row.subscription_tier === 'admin' || row.subscription_tier === 'premium' || row.subscription_tier === 'rooka_plus';

    if (!isPremium && finalTone === 'custom') {
      // Revert to defaults if non-premium tries to set custom coach
      finalTone = "Empathetic but demanding elite endurance coach.";
      finalName = "Rooka";
      finalContext = "";
    }

    db.run(
      `UPDATE users SET coach_tone = ?, coach_name = ?, coach_context = ?, athlete_context = ?, gender = ?, last_cycle_start = ?, training_availability = ? WHERE id = ?`,
      [
        finalTone,
        finalName || "Spark",
        finalContext || "",
        athleteContext,
        gender || "Prefer not to say",
        lastCycleStart || null,
        availabilityStr,
        req.user.id,
      ],
      function (err) {
        if (err)
          return res
            .status(500)
            .json({ error: "Failed to update coach settings." });
        res.json({ message: "Coach updated successfully!" });
      },
    );
  });
});

router.post("/api/user/settings/language", authenticateToken, (req, res) => {
  const { language } = req.body;
  if (!language) return res.status(400).json({ error: "Language required" });
  db.run(
    `UPDATE users SET language = ? WHERE id = ?`,
    [language, req.user.id],
    function (err) {
      if (err) return res.status(500).json({ error: "Failed to update language setting." });
      res.json({ success: true, language });
    }
  );
});

router.post('/api/track-spark-plus-click', authenticateToken, (req, res) => {
    db.run(
        `UPDATE users SET spark_plus_clicks = COALESCE(spark_plus_clicks, 0) + 1 WHERE id = ?`,
        [req.user.id],
        function(err) {
            if (err) return res.status(500).json({ error: 'Database error' });
            res.json({ success: true });
        }
    );
});

router.post('/api/request-account-data', authenticateToken, (req, res) => {
    db.run(
        `UPDATE users SET data_request_clicks = COALESCE(data_request_clicks, 0) + 1 WHERE id = ?`,
        [req.user.id],
        function(err) {
            if (err) return res.status(500).json({ error: 'Database error' });
            res.json({ success: true, message: 'Account data request recorded.' });
        }
    );
});

router.delete('/api/user/account', authenticateToken, (req, res) => {
    const userId = req.user.id;
    if (!userId) return res.status(400).json({ error: "Missing user ID" });

    db.get(`SELECT username FROM users WHERE id = ?`, [userId], (err, user) => {
        if (err || !user) return res.status(404).json({ error: "User not found" });

        const username = user.username || "";
        if (username.toLowerCase().includes("rutger") || username.toLowerCase().includes("felixson")) {
            return res.status(403).json({ error: "Admin accounts cannot be deleted directly." });
        }

        const tablesWithUserId = [
            "activities", "micro_plan", "weight_log", "chat_history", 
            "athlete_metrics", "user_daily_metrics", "user_quests", 
            "completed_quests", "user_xp", "nutrition_protocols", 
            "nutrition_intake", "daily_diet_logs", "biometrics",
            "physique_logs", "milestones", "kudos", "public_profile_cache", 
            "completed_micro_steps", "push_subscriptions", "garmin_health_data", 
            "user_titles", "athlete_niggles", "bonus_points"
        ];

        db.serialize(() => {
            db.run("BEGIN TRANSACTION");
            
            tablesWithUserId.forEach(table => {
                db.run(`DELETE FROM ${table} WHERE user_id = ?`, [userId], function(err) {
                    if (err && !err.message.includes("no such table")) {
                        console.error(`Error deleting from ${table}:`, err.message);
                    }
                });
            });

            db.run(`DELETE FROM connections WHERE user_id = ? OR friend_id = ?`, [userId, userId], function(err) {
                if (err) console.error("Error deleting connections:", err.message);
            });

            db.run(`DELETE FROM users WHERE id = ?`, [userId], function (err) {
                if (err) {
                    console.error("Error deleting user:", err.message);
                    db.run("ROLLBACK");
                    return res.status(500).json({ error: "Failed to delete account" });
                }
                db.run("COMMIT", function(err) {
                    if (err) return res.status(500).json({ error: "Failed to commit deletion" });
                    res.json({ success: true, message: "Account deleted successfully." });
                });
            });
        });
    });
});

module.exports = router;
