const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const db = require("../services/db");
const { authenticateToken } = require("../services/auth");
const { getRookaLevelInfo } = require("../services/utils");

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
        db.run(`DELETE FROM public_profile_cache WHERE user_id = ?`, [req.user.id]);
        res.json({ success: true, url, profile_picture_url: url });
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
    `SELECT id, username, strava_refresh_token, garmin_username, coach_tone, coach_name, coach_context, coach_avatar_neutral, coach_avatar_hype, coach_avatar_disappointed, athlete_context, gender, cycle_tracking_enabled, last_cycle_start, average_cycle_length, search_privacy, profile_picture_url, training_availability, total_rooka, daily_token_usage, daily_token_limit, subscription_tier, last_token_reset_date, onboarding_completed FROM users WHERE id = ?`,
    [req.user.id],
    (err, row) => {
      if (!row) {
        row = {
          id: req.user.id,
          username: req.user.username || 'athlete',
          coach_tone: 'hype',
          coach_name: 'Rooka',
          coach_context: 'Empathetic athletic performance coach',
          athlete_context: 'Active athlete',
          gender: 'prefer_not_to_say',
          total_rooka: 120,
          daily_token_usage: 0,
          daily_token_limit: 50000,
          subscription_tier: 'rooka_plus',
          onboarding_completed: 1,
        };
      }
      let availability = {};
      if (row.training_availability) {
        try {
          availability = JSON.parse(row.training_availability);
        } catch (e) {}
      }
      const rookaLevelInfo = getRookaLevelInfo(row.total_rooka);
      
      const { getEffectiveTokenLimit, getAMSDateString } = require('../services/utils');
      const currentLimit = getEffectiveTokenLimit(row);
      const todayStr = getAMSDateString();
      const dailyUsage = (row.last_token_reset_date === todayStr) ? (row.daily_token_usage || 0) : 0;

      const isCompleted = row.onboarding_completed === 1;

      db.get(
        `SELECT name, date, target_ctl FROM milestones WHERE user_id = ? AND is_main = 1 LIMIT 1`,
        [req.user.id],
        (mErr, milestoneRow) => {
          res.json({
            id: row.id,
            username: row.username,
            hasStrava: !!row.strava_refresh_token,
            hasGarmin: !!row.garmin_username,
            garminUsername: row.garmin_username,
            coachTone: row.coach_tone,
            coachName: row.coach_name || 'Rooka',
            coachContext: row.coach_context || '',
            coachAvatarNeutral: row.coach_avatar_neutral || null,
            coachAvatarHype: row.coach_avatar_hype || null,
            coachAvatarDisappointed: row.coach_avatar_disappointed || null,
            athleteContext: row.athlete_context,
            gender: row.gender,
            cycleTrackingEnabled: row.cycle_tracking_enabled !== 0,
            cycle_tracking_enabled: row.cycle_tracking_enabled !== 0,
            lastCycleStart: row.last_cycle_start,
            averageCycleLength: row.average_cycle_length || 28,
            searchPrivacy: row.search_privacy === 1,
            profilePictureUrl: row.profile_picture_url,
            trainingAvailability: availability,
            rookaLevel: rookaLevelInfo,
            total_rooka: row.total_rooka || 0,
            totalRooka: row.total_rooka || 0,
            dailyTokenUsage: dailyUsage,
            daily_token_usage: dailyUsage,
            dailyTokenLimit: currentLimit,
            daily_token_limit: currentLimit,
            subscriptionTier: row.subscription_tier || 'free',
            subscription_tier: row.subscription_tier || 'free',
            target_event: milestoneRow ? milestoneRow.name : undefined,
            event_date: milestoneRow ? milestoneRow.date : undefined,
            target_ctl: milestoneRow ? milestoneRow.target_ctl : undefined,
            onboardingCompleted: isCompleted,
            onboarding_completed: isCompleted,
          });
        }
      );
    },
  );
});

router.post("/api/user/settings/coach", authenticateToken, (req, res) => {
  const {
    coachTone,
    coachName,
    coachContext,
    athleteContext,
    gender,
    cycleTrackingEnabled,
    cycle_tracking_enabled,
    lastCycleStart,
    trainingAvailability,
    onboardingCompleted,
    targetEvent,
    eventDate,
    targetCtl,
  } = req.body;
  const availabilityStr = trainingAvailability
    ? JSON.stringify(trainingAvailability)
    : "{}";

  const markCompleted = onboardingCompleted ? 1 : 0;
  const cycleTrackingVal = cycleTrackingEnabled !== undefined ? cycleTrackingEnabled : cycle_tracking_enabled;
  const cycleTrackingValNum = cycleTrackingVal === false || cycleTrackingVal === 0 ? 0 : cycleTrackingVal === true || cycleTrackingVal === 1 ? 1 : null;

  db.run(
    `UPDATE users SET coach_tone = ?, coach_name = ?, coach_context = ?, athlete_context = ?, gender = ?, cycle_tracking_enabled = COALESCE(?, cycle_tracking_enabled), last_cycle_start = ?, training_availability = ?, onboarding_completed = CASE WHEN ? = 1 THEN 1 ELSE onboarding_completed END WHERE id = ?`,
    [
      coachTone,
      coachName || "Rooka",
      coachContext || "",
      athleteContext,
      gender || "Prefer not to share",
      cycleTrackingValNum,
      lastCycleStart || null,
      availabilityStr,
      markCompleted,
      req.user.id,
    ],
    function (err) {
      if (err)
        return res
          .status(500)
          .json({ error: "Failed to update coach settings." });

      if (targetEvent || eventDate || targetCtl) {
        db.run(
          `DELETE FROM milestones WHERE user_id = ? AND is_main = 1`,
          [req.user.id],
          () => {
            db.run(
              `INSERT INTO milestones (user_id, name, date, target_ctl, is_main) VALUES (?, ?, ?, ?, 1)`,
              [
                req.user.id,
                targetEvent || "Main Event",
                eventDate || null,
                targetCtl ? parseFloat(targetCtl) : null,
              ],
            );
          }
        );
      }

      res.json({ message: "Coach updated successfully!" });
    },
  );
});

router.post('/api/track-rooka-plus-click', authenticateToken, (req, res) => {
    db.run(
        `UPDATE users SET rooka_plus_clicks = COALESCE(rooka_plus_clicks, 0) + 1 WHERE id = ?`,
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
