const express = require('express');
const router = express.Router();
// In-memory cache for active Garmin client sessions to avoid repeat logins/rate limits
const garminSessionCache = new Map();
const db = require('../services/db');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { GarminConnect } = require("@flow-js/garmin-connect");
const { authenticateToken } = require('../services/auth');
const { sseClients, sendSSEEvent } = require('../services/sse');
const { generateWithFallback } = require('../services/ai');
const { encrypt, decrypt } = require('../services/crypto');
const {
  matchGarminExercise,
  getAMSDateString,
  getAMSWeekday,
  getUserGamificationContext,
  getUserLeaderboardString,
  getWeatherContext,
  getUserMacroPhase,
  generatePublicProfile,
  processTokenRefresh,
  getStravaTokenForUser,
  getRookaLevelInfo,
  calculateRookaScore,
  calculateRookaScoreZoned,
  mapStravaSportToRooka,
  formatStepsForStrava,
  extractStravaPolyline,
  tagStravaActivity,
  getStravaActivity,
  getStravaUserIdsForAthlete,
  syncAllStravaUsersOnStartup,
  triggerBackgroundSummary,
  updateUserRookaAndCheckLevel,
  triggerLevelUpCoachPrompt,
  generateQuestForUser,
  evaluateQuestsAgainstActivity,
  processActivityCoachAnalysis
} = require('../services/utils');

const SPORT_MAP = {
  Run: { sportTypeId: 1, sportTypeKey: "running" },
  RUN: { sportTypeId: 1, sportTypeKey: "running" },
  run: { sportTypeId: 1, sportTypeKey: "running" },
  running: { sportTypeId: 1, sportTypeKey: "running" },
  Bike: { sportTypeId: 2, sportTypeKey: "cycling" },
  BIKE: { sportTypeId: 2, sportTypeKey: "cycling" },
  bike: { sportTypeId: 2, sportTypeKey: "cycling" },
  cycling: { sportTypeId: 2, sportTypeKey: "cycling" },
  cycle: { sportTypeId: 2, sportTypeKey: "cycling" },
  CYCLE: { sportTypeId: 2, sportTypeKey: "cycling" },
  Swim: { sportTypeId: 4, sportTypeKey: "swimming" },
  SWIM: { sportTypeId: 4, sportTypeKey: "swimming" },
  swim: { sportTypeId: 4, sportTypeKey: "swimming" },
  swimming: { sportTypeId: 4, sportTypeKey: "swimming" },
  Strength: { sportTypeId: 5, sportTypeKey: "strength_training" },
  STRENGTH: { sportTypeId: 5, sportTypeKey: "strength_training" },
  strength: { sportTypeId: 5, sportTypeKey: "strength_training" },
  Walk: { sportTypeId: 1, sportTypeKey: "running" },
  WALK: { sportTypeId: 1, sportTypeKey: "running" },
  walk: { sportTypeId: 1, sportTypeKey: "running" },
};

function getGarminSportDef(sport) {
  if (!sport) return null;
  const raw = String(sport).trim();
  if (SPORT_MAP[raw]) return SPORT_MAP[raw];
  const s = raw.toLowerCase();
  if (s === "rest") return null;
  if (s === "run" || s === "running") return { sportTypeId: 1, sportTypeKey: "running" };
  if (s === "bike" || s === "cycling" || s === "biking" || s === "cycle") return { sportTypeId: 2, sportTypeKey: "cycling" };
  if (s === "swim" || s === "swimming") return { sportTypeId: 4, sportTypeKey: "swimming" };
  if (s === "strength" || s === "strength_training" || s === "gym") return { sportTypeId: 5, sportTypeKey: "strength_training" };
  if (s === "walk" || s === "walking" || s === "hike") return { sportTypeId: 1, sportTypeKey: "running" };
  return null;
}

const STEP_TYPE_MAP = {
  warmup: { id: 1, key: "warmup" },
  cooldown: { id: 2, key: "cooldown" },
  interval: { id: 3, key: "interval" },
  recovery: { id: 4, key: "recovery" },
  rest: { id: 5, key: "rest" },
};

const TARGET_TYPE_MAP = {
  "no.target": { id: 1, key: "no.target" },
  "power.zone": { id: 2, key: "power.zone" },
  "heart.rate.zone": { id: 4, key: "heart.rate.zone" },
  "speed.zone": { id: 5, key: "speed.zone" },
  "pace.zone": { id: 6, key: "pace.zone" },
};

const CONDITION_TYPE_MAP = {
  time: { id: 2, key: "time" },
  time_sec: { id: 2, key: "time" },
  distance: { id: 3, key: "distance" },
  "lap.button": { id: 1, key: "lap.button" },
  reps: { id: 10, key: "reps" },
};

router.get("/webhook/strava", (req, res) => {
  const VERIFY_TOKEN = process.env.STRAVA_VERIFY_TOKEN || "STRAVA";

  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token) {
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("✅ Strava Webhook Verified!");
      res.json({ "hub.challenge": challenge });
    } else {
      res.sendStatus(403);
    }
  }
});

router.post("/webhook/strava", (req, res) => {
  console.log(
    "📥 STRAVA WEBHOOK INCOMING PAYLOAD:",
    JSON.stringify(req.body, null, 2),
  );
  const { aspect_type, object_id, owner_id, object_type, updates } = req.body;

  if (aspect_type === "create" && object_type === "activity") {
    console.log(`🏃‍♂️ New Strava activity detected! Fetching ID: ${object_id}`);
    // A Strava athlete may back more than one Rooka account; give each of them
    // their own copy of the activity rather than only the first one mapped.
    getStravaUserIdsForAthlete(owner_id).then((userIds) => {
      if (!userIds.length) {
        getStravaActivity(owner_id, object_id);
        return;
      }
      userIds.forEach((userId) => getStravaActivity(owner_id, object_id, userId));
    });
  } else if (
    object_type === "athlete" &&
    updates &&
    (updates.authorized === "false" || updates.authorized === false)
  ) {
    const stravaAthleteId = String(owner_id || object_id);
    console.log(
      `🔒 Strava deauthorization webhook received for athlete ID: ${stravaAthleteId}`,
    );

    db.get(
      `SELECT user_id FROM strava_tokens WHERE strava_id = ?`,
      [stravaAthleteId],
      (err, row) => {
        if (row && row.user_id) {
          db.run(`UPDATE users SET strava_refresh_token = NULL WHERE id = ?`, [
            row.user_id,
          ]);
          db.run(
            `DELETE FROM strava_tokens WHERE user_id = ?`,
            [row.user_id],
            (deleteErr) => {
              if (!deleteErr) {
                console.log(
                  `✅ Revoked Strava connection for user_id ${row.user_id}`,
                );
              }
            },
          );
        } else {
          db.run(`DELETE FROM strava_tokens WHERE strava_id = ?`, [
            stravaAthleteId,
          ]);
        }
      },
    );
  }

  res.status(200).send("EVENT_RECEIVED");
});

router.post("/api/user/settings/garmin", authenticateToken, (req, res) => {
  const { garminUsername, garminPassword, oauth1, oauth2 } = req.body;

  if (!garminUsername || (!garminPassword && (!oauth1 || !oauth2))) {
    return res
      .status(400)
      .json({ error: "Username and password (or valid OAuth tokens) are required." });
  }

  // Clear in-memory session if previously cached
  garminSessionCache.delete(req.user.id);

  const encryptedPassword = garminPassword ? encrypt(garminPassword) : null;
  const enc1 = oauth1 ? encrypt(typeof oauth1 === "string" ? oauth1 : JSON.stringify(oauth1)) : null;
  const enc2 = oauth2 ? encrypt(typeof oauth2 === "string" ? oauth2 : JSON.stringify(oauth2)) : null;

  db.run(
    `UPDATE users SET garmin_username = ?, garmin_password = COALESCE(?, garmin_password), garmin_oauth1_token = ?, garmin_oauth2_token = ? WHERE id = ?`,
    [garminUsername, encryptedPassword, enc1, enc2, req.user.id],
    function (err) {
      if (err)
        return res
          .status(500)
          .json({ error: "Failed to save Garmin credentials." });
      res.json({ message: "Garmin connection secured successfully!" });
    },
  );
});

router.post("/api/user/settings/garmin-tokens", authenticateToken, (req, res) => {
  const { oauth1, oauth2, garminUsername } = req.body;

  if (!oauth1 || !oauth2) {
    return res
      .status(400)
      .json({ error: "Both oauth1 and oauth2 tokens are required." });
  }

  garminSessionCache.delete(req.user.id);

  const enc1 = encrypt(typeof oauth1 === "string" ? oauth1 : JSON.stringify(oauth1));
  const enc2 = encrypt(typeof oauth2 === "string" ? oauth2 : JSON.stringify(oauth2));

  db.run(
    `UPDATE users SET garmin_oauth1_token = ?, garmin_oauth2_token = ?, garmin_username = COALESCE(?, garmin_username) WHERE id = ?`,
    [enc1, enc2, garminUsername || null, req.user.id],
    function (err) {
      if (err)
        return res.status(500).json({ error: "Failed to save Garmin OAuth tokens." });
      res.json({ message: "Garmin OAuth tokens imported successfully!" });
    }
  );
});

router.post("/api/user/settings/strava", authenticateToken, (req, res) => {
  const { stravaRefreshToken } = req.body;

  if (!stravaRefreshToken) {
    return res.status(400).json({ error: "Missing Strava refresh token." });
  }

  db.run(
    `UPDATE users SET strava_refresh_token = ? WHERE id = ?`,
    [stravaRefreshToken, req.user.id],
    function (err) {
      if (err)
        return res
          .status(500)
          .json({ error: "Failed to save Strava integration." });
      res.json({ message: "Strava connected successfully!" });
    },
  );
});

router.post("/api/sync-strava", authenticateToken, async (req, res) => {
  db.get(
    "SELECT strava_refresh_token FROM users WHERE id = ?",
    [req.user.id],
    async (err, user) => {
      if (err || !user || !user.strava_refresh_token) {
        return res
          .status(400)
          .json({ error: "Strava token missing from settings." });
      }

      try {
        const tokenRes = await fetch("https://www.strava.com/oauth/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            client_id: process.env.STRAVA_CLIENT_ID,
            client_secret: process.env.STRAVA_CLIENT_SECRET,
            grant_type: "refresh_token",
            refresh_token: user.strava_refresh_token,
          }),
        });

        const tokenData = await tokenRes.json();
        if (!tokenData.access_token)
          throw new Error(
            "Strava rejected the token. Please check your credentials.",
          );

        if (
          tokenData.refresh_token &&
          tokenData.refresh_token !== user.strava_refresh_token
        ) {
          db.run(`UPDATE users SET strava_refresh_token = ? WHERE id = ?`, [
            tokenData.refresh_token,
            req.user.id,
          ]);
          db.run(
            `UPDATE strava_tokens SET refresh_token = ?, access_token = ?, expires_at = ? WHERE user_id = ?`,
            [
              tokenData.refresh_token,
              tokenData.access_token,
              tokenData.expires_at || 0,
              req.user.id,
            ],
          );
        }

        const actRes = await fetch(
          "https://www.strava.com/api/v3/athlete/activities?per_page=200",
          {
            headers: { Authorization: `Bearer ${tokenData.access_token}` },
          },
        );

        const activities = await actRes.json();

        const userRow = await new Promise((resolve) =>
          db.get(`SELECT rooka_start_date FROM users WHERE id = ?`, [req.user.id], (err, row) => resolve(row))
        );
        const userStartDateDay = userRow && userRow.rooka_start_date ? userRow.rooka_start_date.substring(0, 10) : null;

        let storedForUser = 0;
        let failed = 0;

        for (const act of activities) {
          const tss =
            act.suffer_score || Math.round((act.moving_time / 3600) * 50);
          const actStartDateDay = act.start_date ? act.start_date.substring(0, 10) : null;
          let rookaScore = 0;
          if (!userStartDateDay || (actStartDateDay && actStartDateDay >= userStartDateDay)) {
            rookaScore = await calculateRookaScoreZoned({
              userId: req.user.id,
              movingTimeMin: act.moving_time / 60,
              avgHr: act.average_heartrate,
              avgWatts: act.weighted_average_watts || act.average_watts,
              sport: mapStravaSportToRooka(act.sport_type),
            });
          }

          // Upsert on (user_id, strava_activity_id): this athlete's own copy of
          // the Strava activity, independent of any other account that happens
          // to sync the same Strava profile.
          const ok = await new Promise((resolve) =>
            db.run(
              `INSERT INTO activities (user_id, strava_activity_id, name, sport_type, distance_km, elevation_m, moving_time_min, average_heartrate, average_watts, max_heartrate, start_date, tss, rooka_score, polyline) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                     ON CONFLICT(user_id, strava_activity_id) DO UPDATE SET tss=excluded.tss, rooka_score=excluded.rooka_score, moving_time_min=excluded.moving_time_min, average_heartrate=excluded.average_heartrate, average_watts=excluded.average_watts, max_heartrate=excluded.max_heartrate, polyline=COALESCE(excluded.polyline, polyline)`,
              [
                req.user.id,
                String(act.id),
                act.name,
                act.sport_type,
                act.distance / 1000,
                act.total_elevation_gain,
                act.moving_time / 60,
                act.average_heartrate || 0,
                // Power was dropped entirely before this, so a power-only ride
                // reached the scorer with no intensity signal at all.
                act.weighted_average_watts || act.average_watts || null,
                act.max_heartrate || null,
                act.start_date,
                tss,
                rookaScore,
                // The map was drawing a placeholder square because the route
                // never made it into the row. COALESCE on conflict means a
                // re-sync of an older activity fills the gap without a
                // summary_polyline-less response wiping a route we already have.
                extractStravaPolyline(act),
              ],
              (insertErr) => {
                if (insertErr) console.error("Strava activity upsert failed:", insertErr.message);
                resolve(!insertErr);
              },
            ),
          );

          if (ok) storedForUser++;
          else failed++;

          tagStravaActivity(req.user.id, act, tokenData.access_token);
        }

        // `evaluateQuestsAgainstActivity` was imported here but never called, so
        // the Sync button inserted activities and skipped quest evaluation
        // entirely — a 10 km run synced this way left the quest on 0/1. The
        // webhook path in services/utils.js has always called it.
        //
        // Once after the loop, not once per activity: the evaluator re-reads the
        // whole activity history from the database, and it generates a
        // replacement quest (an AI call) whenever none is left active.
        let completedQuests = [];
        try {
          completedQuests = await evaluateQuestsAgainstActivity(req.user.id, null);
          if (completedQuests && completedQuests.length > 0) {
            console.log(
              `🏅 Strava sync completed ${completedQuests.length} quest(s) for user ${req.user.id}`,
            );
          }
        } catch (e) {
          console.error("Quest evaluation failed after Strava sync:", e.message);
        }

        // After quest evaluation, not before. A completed quest writes its
        // reward to `bonus_points`, and `total_rooka` is activities + bonus — so
        // recomputing first left the reward out of the total until some later,
        // unrelated request happened to recompute it. That is when the level-up
        // fired: minutes after a sync that appeared to add nothing new.
        updateUserRookaAndCheckLevel(req.user.id);

        // Check if any recent unanalyzed activity (past 48h) needs coach feedback
        db.all(
          `SELECT * FROM activities WHERE user_id = ? AND (coach_analyzed = 0 OR coach_analyzed IS NULL) AND datetime(start_date) >= datetime('now', '-2 days') ORDER BY start_date DESC LIMIT 1`,
          [req.user.id],
          async (unErr, unRows) => {
            if (!unErr && unRows && unRows.length > 0) {
              await processActivityCoachAnalysis(req.user.id, unRows[0]);
            }
          }
        );

        // Report what was actually stored for this athlete, never the raw count
        // returned by Strava.
        res.json({
          message: `Successfully synced ${storedForUser} activities!`,
          synced: storedForUser,
          failed,
          completedQuests: (completedQuests || []).map((q) => ({
            id: q.id,
            description: q.description,
            reward_points: q.reward_points,
          })),
        });
      } catch (err) {
        console.error("Strava Sync Error:", err);
        res
          .status(500)
          .json({ error: "Strava sync failed. Check server logs." });
      }
    },
  );
});

router.get("/oauthredirect", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Strava Connected - Rooka</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0d1117; color: #f0f6fc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; }
          .card { background: #161b22; border: 1px solid #30363d; border-radius: 16px; padding: 32px; max-width: 360px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
          h2 { color: #FC4C02; margin-top: 0; }
          p { color: #8b949e; font-size: 14px; }
        </style>
        <script>
          const search = window.location.search;
          window.location.href = "rookanative://oauthredirect" + search;
          setTimeout(function() {
            window.location.href = "rooka://oauthredirect" + search;
          }, 300);
        </script>
      </head>
      <body>
        <div class="card">
          <h2>⚡️ Strava Authorization</h2>
          <p>Redirecting back to Rooka...</p>
        </div>
      </body>
    </html>
  `);
});

router.post(
  "/api/user/settings/strava-exchange",
  authenticateToken,
  async (req, res) => {
    const { code, allowShared } = req.body;

    if (!code)
      return res.status(400).json({ error: "No authorization code provided." });

    try {
      const response = await fetch("https://www.strava.com/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: process.env.STRAVA_CLIENT_ID,
          client_secret: process.env.STRAVA_CLIENT_SECRET,
          code: code,
          grant_type: "authorization_code",
        }),
      });

      const data = await response.json();

      if (data.errors) {
        console.error("Strava OAuth exchange error response:", data);
        const errMsg = data.message || (Array.isArray(data.errors) ? data.errors.map(e => `${e.field || e.resource}: ${e.code}`).join(', ') : 'Strava rejected authorization');
        return res
          .status(400)
          .json({ error: `Strava rejected the authorization: ${errMsg}` });
      }

      const stravaAthleteId = String(data.athlete.id);

      // Activities are stored per user, so a second account connecting the same
      // Strava athlete is now safe — it gets its own copy of every activity.
      // It is still usually a mistake (the same person would appear twice in
      // the feed and on leaderboards), so warn once and let the caller confirm.
      const conflict = allowShared ? null : await new Promise((resolve) =>
        db.get(
          `SELECT st.user_id, u.username
             FROM strava_tokens st
             JOIN users u ON u.id = st.user_id
            WHERE st.strava_id = ? AND st.user_id != ? AND u.deleted_at IS NULL`,
          [stravaAthleteId, req.user.id],
          (err, row) => resolve(err ? null : row),
        ),
      );

      if (conflict) {
        return res.status(409).json({
          error: `This Strava account is already connected to another Rooka account (${conflict.username}). Connect it here as well?`,
          code: "STRAVA_ALREADY_LINKED",
          linkedUsername: conflict.username,
        });
      }

      db.run(`UPDATE users SET strava_refresh_token = ? WHERE id = ?`, [
        data.refresh_token,
        req.user.id,
      ]);

      db.run(
        `INSERT OR REPLACE INTO strava_tokens (user_id, access_token, refresh_token, expires_at, strava_id) VALUES (?, ?, ?, ?, ?)`,
        [
          req.user.id,
          data.access_token,
          data.refresh_token,
          data.expires_at,
          stravaAthleteId,
        ],
        (err) => {
          if (err)
            return res.status(500).json({ error: "Failed to map Strava ID." });
          res.json({ message: "Strava connected successfully!" });
        },
      );
    } catch (error) {
      console.error("Server error during Strava authentication:", error);
      res
        .status(500)
        .json({ error: "Server error during Strava authentication." });
    }
  },
);

router.post("/api/user/disconnect/strava", authenticateToken, (req, res) => {
  db.get(
    `SELECT access_token FROM strava_tokens WHERE user_id = ?`,
    [req.user.id],
    async (err, row) => {
      if (row && row.access_token) {
        try {
          await fetch("https://www.strava.com/oauth/deauthorize", {
            method: "POST",
            headers: { Authorization: `Bearer ${row.access_token}` },
          });
        } catch (e) {
          console.error("Failed to deauthorize Strava:", e);
        }
      }
      db.run(`UPDATE users SET strava_refresh_token = NULL WHERE id = ?`, [
        req.user.id,
      ]);
      db.run(
        `DELETE FROM strava_tokens WHERE user_id = ?`,
        [req.user.id],
        (err) => {
          if (err)
            return res
              .status(500)
              .json({ error: "Failed to disconnect Strava from database." });
          res.json({ message: "Strava disconnected successfully!" });
        },
      );
    },
  );
});


/**
 * Normalizes any date format (e.g. "Sep 12", "2026-09-12", "Sat Sep 12")
 * into strict YYYY-MM-DD required by Garmin Connect schedule API.
 */
function normalizeToYYYYMMDD(dateInput) {
  if (!dateInput) return getAMSDateString();
  const trimmed = String(dateInput).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) return trimmed.split("T")[0];
  const currentYear = new Date().getFullYear();
  let parsed = new Date(`${trimmed}, ${currentYear}`);
  if (isNaN(parsed.getTime())) {
    parsed = new Date(`${trimmed} ${currentYear}`);
  }
  if (!isNaN(parsed.getTime())) {
    return getAMSDateString(parsed);
  }
  return getAMSDateString();
}

/**
 * Obtains an authenticated GarminConnect client instance for a user.
 * Tries:
 *  1. In-memory active session cache
 *  2. Saved OAuth tokens (OAuth1 + OAuth2) from SQLite database (completely skips login page!)
 *  3. Full login via username/password, and automatically persists tokens to DB
 */
async function getAuthenticatedGarminClient(user) {
  const userId = user.id;

  // 1. In-memory active session check
  const cached = garminSessionCache.get(userId);
  if (cached?.client) {
    try {
      await cached.client.client.checkTokenVaild();
      cached.lastUsed = Date.now();
      console.log("DEBUG: Using active in-memory Garmin session for user:", user.garmin_username);
      return cached.client;
    } catch (err) {
      console.warn("Cached in-memory Garmin session invalid/expired:", err.message);
      garminSessionCache.delete(userId);
    }
  }

  // 2. Persistent tokens from database
  if (user.garmin_oauth1_token && user.garmin_oauth2_token) {
    try {
      const oauth1 = JSON.parse(decrypt(user.garmin_oauth1_token));
      const oauth2 = JSON.parse(decrypt(user.garmin_oauth2_token));

      if (oauth1 && oauth2) {
        console.log("DEBUG: Loading stored Garmin OAuth tokens from database for user:", user.garmin_username);
        const decryptedPassword = decrypt(user.garmin_password);
        const GCClient = new GarminConnect({
          username: user.garmin_username,
          password: decryptedPassword,
        });

        GCClient.loadToken(oauth1, oauth2);

        // checkTokenVaild() automatically refreshes oauth2 using oauth1 if expired
        await GCClient.client.checkTokenVaild();

        // If tokens were refreshed, save updated tokens to DB
        try {
          const updatedTokens = GCClient.exportToken();
          if (updatedTokens?.oauth1 && updatedTokens?.oauth2) {
            const enc1 = encrypt(JSON.stringify(updatedTokens.oauth1));
            const enc2 = encrypt(JSON.stringify(updatedTokens.oauth2));
            db.run(
              `UPDATE users SET garmin_oauth1_token = ?, garmin_oauth2_token = ? WHERE id = ?`,
              [enc1, enc2, userId]
            );
          }
        } catch (exportErr) {
          console.warn("Could not export refreshed Garmin tokens:", exportErr.message);
        }

        garminSessionCache.set(userId, { client: GCClient, lastUsed: Date.now() });
        return GCClient;
      }
    } catch (tokenErr) {
      console.warn("Stored Garmin OAuth tokens invalid or refresh failed, falling back to full login:", tokenErr.message);
    }
  }

  // 3. Fallback: Full login
  const decryptedPassword = decrypt(user.garmin_password);
  if (!decryptedPassword) {
    throw new Error("Unable to decrypt Garmin password");
  }

  const GCClient = new GarminConnect({
    username: user.garmin_username,
    password: decryptedPassword,
  });

  console.log("DEBUG: Attempting full Garmin login for user:", user.garmin_username);
  await GCClient.login(user.garmin_username, decryptedPassword);

  // Successfully logged in: export tokens and persist to SQLite database
  try {
    const tokens = GCClient.exportToken();
    if (tokens?.oauth1 && tokens?.oauth2) {
      const enc1 = encrypt(JSON.stringify(tokens.oauth1));
      const enc2 = encrypt(JSON.stringify(tokens.oauth2));
      db.run(
        `UPDATE users SET garmin_oauth1_token = ?, garmin_oauth2_token = ? WHERE id = ?`,
        [enc1, enc2, userId],
        (err) => {
          if (err) console.error("Error storing Garmin OAuth tokens:", err);
          else console.log("DEBUG: Garmin OAuth tokens successfully stored in database for user:", user.garmin_username);
        }
      );
    }
  } catch (exportErr) {
    console.warn("Could not export Garmin OAuth tokens after login:", exportErr.message);
  }

  garminSessionCache.set(userId, { client: GCClient, lastUsed: Date.now() });
  return GCClient;
}

router.post("/api/user/disconnect/garmin", authenticateToken, (req, res) => {
  garminSessionCache.delete(req.user.id);
  db.run(
    `UPDATE users SET garmin_username = NULL, garmin_password = NULL, garmin_oauth1_token = NULL, garmin_oauth2_token = NULL WHERE id = ?`,
    [req.user.id],
    (err) => {
      if (err)
        return res.status(500).json({ error: "Failed to disconnect Garmin." });
      res.json({ message: "Garmin disconnected successfully!" });
    },
  );
});

router.post("/api/sync-garmin", authenticateToken, async (req, res) => {
  console.log("DEBUG: Sync route triggered for user:", req.user.id);
  const selectedWorkouts = Array.isArray(req.body.workouts) ? req.body.workouts : null;

  try {
    const user = await new Promise((resolve, reject) => {
      db.get(
        `SELECT id, garmin_username, garmin_password, garmin_oauth1_token, garmin_oauth2_token FROM users WHERE id = ?`,
        [req.user.id],
        (err, row) => {
          if (err || !row || !row.garmin_username || !row.garmin_password) {
            reject(new Error("User Garmin credentials not found. Please connect your Garmin account first."));
          } else {
            resolve(row);
          }
        },
      );
    });

    const GCClient = await getAuthenticatedGarminClient(user);
    const client = GCClient.client || GCClient.http;
    if (!client) throw new Error("Garmin client initialization failed.");

    let workoutsToSync = [];

    // Case 1: Client explicitly sent specific workout(s) with steps/title (e.g. from AddWorkoutModal)
    if (selectedWorkouts && selectedWorkouts.length > 0 && selectedWorkouts.some(sw => sw.steps || sw.title)) {
      console.log(`DEBUG: Syncing ${selectedWorkouts.length} explicit workout(s) from client payload`);
      workoutsToSync = selectedWorkouts.map(sw => ({
        date: normalizeToYYYYMMDD(sw.date),
        sport: sw.sport,
        title: sw.title,
        description: sw.description || sw.title,
        target_rooka: sw.rookaPoints || sw.target_rooka || 50,
        steps: Array.isArray(sw.steps) ? sw.steps : [],
        steps_json: Array.isArray(sw.steps) ? JSON.stringify(sw.steps) : (sw.steps_json || "[]")
      }));
    } else {
      // Case 2: Client sent date/sport filter, or sent nothing (sync upcoming micro plan workouts from DB)
      const todayStr = getAMSDateString();
      const dbWorkouts = await new Promise((resolve, reject) => {
        db.all(
          `SELECT date, sport, description, target_rooka, steps_json FROM micro_plan WHERE user_id = ? AND date >= ?`,
          [req.user.id, todayStr],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          },
        );
      });

      if (selectedWorkouts && selectedWorkouts.length > 0) {
        workoutsToSync = dbWorkouts.filter((w) =>
          selectedWorkouts.some((sw) => sw.date === w.date && sw.sport === w.sport),
        );
      } else {
        workoutsToSync = dbWorkouts;
      }

      workoutsToSync = workoutsToSync.map(w => ({
        ...w,
        date: normalizeToYYYYMMDD(w.date),
      }));
    }

    if (workoutsToSync.length === 0)
      return res
        .status(400)
        .json({ error: "No valid workouts found to sync." });

    let syncedCount = 0;
    let lastSyncError = null;
    const monthCalendarCache = new Map();

    for (const workout of workoutsToSync) {
      const sportDef = getGarminSportDef(workout.sport);
      if (!sportDef) {
        console.warn(`[Garmin Sync] Skipping unsupported or rest sport: "${workout.sport}"`);
        continue;
      }
      let stepsArray = [];
      if (Array.isArray(workout.steps) && workout.steps.length > 0) {
        stepsArray = workout.steps;
      } else {
        try {
          stepsArray = JSON.parse(workout.steps_json);
        } catch (e) {
          stepsArray = [];
        }
      }

      if (stepsArray.length === 0) {
        let durationMins = Math.max(
          5,
          Math.round((workout.target_rooka / 55) * 60),
        );
        stepsArray = [
          {
            type: "interval",
            condition_type: "time",
            condition_value: durationMins,
            target_type: "no.target",
          },
        ];
      }

      const garminSteps = stepsArray.map((step, index) => {
        if (step.type === "repeat") {
          return {
            type: "RepeatGroupDTO",
            stepOrder: index + 1,
            smartRepeat: false,
            numberOfIterations: step.iterations || 1,
            workoutSteps: (step.steps || []).map((subStep, subIndex) => {
              const nType =
                subStep.type === "drill" ? "interval" : subStep.type;
              const sDef = STEP_TYPE_MAP[nType] || STEP_TYPE_MAP["interval"];
              const tDef =
                TARGET_TYPE_MAP[subStep.target_type] ||
                TARGET_TYPE_MAP["no.target"];
              const cDef =
                CONDITION_TYPE_MAP[subStep.condition_type] ||
                CONDITION_TYPE_MAP["time"];

              const sDTO = {
                type: "ExecutableStepDTO",
                stepOrder: subIndex + 1,
                stepType: { stepTypeId: sDef.id, stepTypeKey: sDef.key },
                endCondition: {
                  conditionTypeId: cDef.id,
                  conditionTypeKey: cDef.key,
                },
                endConditionValue:
                  subStep.condition_type === "time"
                    ? subStep.condition_value * 60
                    : subStep.condition_value,
                targetType: {
                  workoutTargetTypeId: tDef.id,
                  workoutTargetTypeKey: tDef.key,
                },
                targetValueOne: null,
                targetValueTwo: null,
                zoneNumber: subStep.zone ? parseInt(subStep.zone, 10) : null,
              };
              if (subStep.target_value) {
                if (
                  subStep.target_value.includes("min/km") ||
                  subStep.target_type === "pace.exact"
                ) {
                  const match = subStep.target_value.match(/(\d+):(\d+)/);
                  if (match) {
                    const speedMs =
                      1000 /
                      (parseInt(match[1], 10) * 60 + parseInt(match[2], 10));
                    sDTO.targetType = {
                      workoutTargetTypeId: TARGET_TYPE_MAP["pace.zone"].id,
                      workoutTargetTypeKey: TARGET_TYPE_MAP["pace.zone"].key,
                    };
                    sDTO.targetValueOne = speedMs * 0.95;
                    sDTO.targetValueTwo = speedMs * 1.05;
                    sDTO.zoneNumber = null;
                  }
                } else if (subStep.target_value.toLowerCase().includes("w")) {
                  const match = subStep.target_value.match(/(\d+)/);
                  if (match) {
                    const watts = parseInt(match[1], 10);
                    sDTO.targetType = {
                      workoutTargetTypeId: TARGET_TYPE_MAP["power.zone"].id,
                      workoutTargetTypeKey: TARGET_TYPE_MAP["power.zone"].key,
                    };
                    sDTO.targetValueOne = watts * 0.9;
                    sDTO.targetValueTwo = watts * 1.1;
                    sDTO.zoneNumber = null;
                  }
                }
              }
              if (subStep.condition_type === "distance") {
                sDTO.preferredEndConditionUnit = {
                  unitId: 1,
                  unitKey: "meter",
                  factor: 100,
                };
              }
              if (subStep.weight) {
                sDTO.weightValue = subStep.weight;
                sDTO.weightUnit = { unitId: 9, unitKey: "kilogram" };
              }
              if (subStep.exerciseName) {
                const match = matchGarminExercise(subStep.exerciseName);
                if (match) {
                  sDTO.category = match.category_key;
                  sDTO.exerciseName = match.exercise_key;
                } else {
                  sDTO.description = subStep.exerciseName; // Fallback to notes if no match
                }
              }
              return sDTO;
            }),
          };
        }

        const normalizedType = step.type === "drill" ? "interval" : step.type;
        const stepDef =
          STEP_TYPE_MAP[normalizedType] || STEP_TYPE_MAP["interval"];
        const targetDef =
          TARGET_TYPE_MAP[step.target_type] || TARGET_TYPE_MAP["no.target"];
        const conditionDef =
          CONDITION_TYPE_MAP[step.condition_type] || CONDITION_TYPE_MAP["time"];

        const stepDTO = {
          type: "ExecutableStepDTO",
          stepOrder: index + 1,
          stepType: { stepTypeId: stepDef.id, stepTypeKey: stepDef.key },
          endCondition: {
            conditionTypeId: conditionDef.id,
            conditionTypeKey: conditionDef.key,
          },
          endConditionValue:
            step.condition_type === "time"
              ? step.condition_value * 60
              : step.condition_value,
          targetType: {
            workoutTargetTypeId: targetDef.id,
            workoutTargetTypeKey: targetDef.key,
          },
          targetValueOne: null,
          targetValueTwo: null,
          zoneNumber: step.zone ? parseInt(step.zone, 10) : null,
        };
        if (step.target_value) {
          if (
            step.target_value.includes("min/km") ||
            step.target_type === "pace.exact"
          ) {
            const match = step.target_value.match(/(\d+):(\d+)/);
            if (match) {
              const speedMs =
                1000 / (parseInt(match[1], 10) * 60 + parseInt(match[2], 10));
              stepDTO.targetType = {
                workoutTargetTypeId: TARGET_TYPE_MAP["pace.zone"].id,
                workoutTargetTypeKey: TARGET_TYPE_MAP["pace.zone"].key,
              };
              stepDTO.targetValueOne = speedMs * 0.95;
              stepDTO.targetValueTwo = speedMs * 1.05;
              stepDTO.zoneNumber = null;
            }
          } else if (step.target_value.toLowerCase().includes("w")) {
            const match = step.target_value.match(/(\d+)/);
            if (match) {
              const watts = parseInt(match[1], 10);
              stepDTO.targetType = {
                workoutTargetTypeId: TARGET_TYPE_MAP["power.zone"].id,
                workoutTargetTypeKey: TARGET_TYPE_MAP["power.zone"].key,
              };
              stepDTO.targetValueOne = watts * 0.9;
              stepDTO.targetValueTwo = watts * 1.1;
              stepDTO.zoneNumber = null;
            }
          }
        }

        if (step.condition_type === "distance") {
          stepDTO.preferredEndConditionUnit = {
            unitId: 1,
            unitKey: "meter",
            factor: 100,
          };
        }
        if (step.weight) {
          stepDTO.weightValue = step.weight;
          stepDTO.weightUnit = { unitId: 9, unitKey: "kilogram" };
        }
        if (step.exerciseName) {
          const match = matchGarminExercise(step.exerciseName);
          if (match) {
            stepDTO.category = match.category_key;
            stepDTO.exerciseName = match.exercise_key;
          } else {
            stepDTO.description = step.exerciseName; // Fallback to notes if no match
          }
        }
        return stepDTO;
      });

      const workoutTitle = workout.title || workout.description || `${workout.sport} Workout`;
      const wkt = {
        workoutName: `rooka: ${workoutTitle.slice(0, 40)}`,
        description: workout.description || workoutTitle,
        sportType: sportDef,
        workoutSegments: [
          { segmentOrder: 1, sportType: sportDef, workoutSteps: garminSteps },
        ],
      };

      if (String(workout.sport).toLowerCase().includes("swim")) {
        wkt.poolLength = 25;
        wkt.poolLengthUnit = { unitId: 1, unitKey: "meter", factor: 100 };
      }

      const scheduleDate = normalizeToYYYYMMDD(workout.date);
      console.log(`DEBUG: Sending workout "${wkt.workoutName}" (${sportDef.sportTypeKey}) to Garmin for date: ${scheduleDate}`);

      // Auto-Deduplication: Check if there is already a Rooka workout of the SAME sport on this date.
      // If so, delete the prior workout from Garmin so we replace it instead of creating duplicates.
      // Brick sessions (e.g. Bike + Run on the same day) have different sportTypeKeys and will NOT be touched!
      try {
        const dateParts = scheduleDate.split("-").map(n => parseInt(n, 10));
        if (dateParts.length >= 2) {
          const sYear = dateParts[0];
          const sMonth = dateParts[1];
          const monthCacheKey = `${sYear}-${sMonth}`;
          if (!monthCalendarCache.has(monthCacheKey)) {
            if (typeof GCClient.getMonthCalendarEvents === "function") {
              const cal = await GCClient.getMonthCalendarEvents(sYear, sMonth - 1);
              monthCalendarCache.set(monthCacheKey, cal?.calendarItems || []);
            } else {
              monthCalendarCache.set(monthCacheKey, []);
            }
          }

          const calendarItems = monthCalendarCache.get(monthCacheKey) || [];
          const existingSameSportWorkouts = calendarItems.filter(item =>
            item.date === scheduleDate &&
            item.itemType === "workout" &&
            item.workoutId &&
            item.title &&
            item.title.toLowerCase().startsWith("rooka") &&
            item.sportTypeKey === sportDef.sportTypeKey
          );

          for (const oldWorkout of existingSameSportWorkouts) {
            console.log(`DEBUG: Found prior Rooka ${oldWorkout.sportTypeKey} workout on ${scheduleDate}: "${oldWorkout.title}" (ID: ${oldWorkout.workoutId}). Deleting prior workout to avoid duplicates...`);
            try {
              await GCClient.deleteWorkout({ workoutId: oldWorkout.workoutId });
              console.log(`DEBUG: Successfully deleted prior workout ${oldWorkout.workoutId}`);
              const updatedCache = (monthCalendarCache.get(monthCacheKey) || []).filter(i => i.workoutId !== oldWorkout.workoutId);
              monthCalendarCache.set(monthCacheKey, updatedCache);
            } catch (delErr) {
              console.warn(`[Garmin Sync] Could not delete prior workout ${oldWorkout.workoutId}:`, delErr.message);
            }
          }
        }
      } catch (dedupErr) {
        console.warn("[Garmin Sync] Deduplication lookup failed (non-fatal):", dedupErr.message);
      }

      try {
        const response = await client.post(
          "https://connectapi.garmin.com/workout-service/workout",
          wkt,
        );
        const workoutId = response?.workoutId || response?.data?.workoutId;
        if (workoutId) {
          console.log(`DEBUG: Scheduling Garmin workout ${workoutId} for calendar date: ${scheduleDate}`);
          await client.post(
            `https://connectapi.garmin.com/workout-service/schedule/${workoutId}`,
            { date: scheduleDate },
          );
          syncedCount++;
        }
      } catch (err) {
        lastSyncError = err.message || "Failed to schedule workout";
        console.error(
          `❌ Sync Failed for ${workout.sport} on ${scheduleDate}:`,
          err.message,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 2500));
    }

    if (workoutsToSync.length > 0 && syncedCount === 0) {
      return res.status(500).json({
        error: "Failed to schedule workouts on Garmin calendar.",
        details: lastSyncError || "Garmin rejected the workout payload or calendar schedule date.",
      });
    }

    res.json({
      success: true,
      message: `Successfully pushed ${syncedCount} structured workout${syncedCount === 1 ? "" : "s"} to Garmin!`,
      syncedCount,
    });
  } catch (err) {
    console.error("CRITICAL ERROR in sync-garmin:", err);
    const isRateLimit =
      err.message?.includes("429") ||
      err.message?.includes("Rate limited") ||
      err.response?.status === 429;

    if (isRateLimit) {
      return res.status(429).json({
        error: "Garmin rate limit reached",
        details:
          "Garmin has temporarily throttled authentication attempts for this account/IP. Please wait 15–30 minutes before syncing again. Once connected, your OAuth session will be stored so future syncs do not re-authenticate.",
      });
    }

    return res
      .status(500)
      .json({ error: "Server sync failed", details: err.message });
  }
});

module.exports = router;
