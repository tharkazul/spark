const express = require('express');
const router = express.Router();
const db = require('../services/db');
const activityMerge = require('../services/activityMerge');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { authenticateToken } = require('../services/auth');
const { sseClients, sendSSEEvent } = require('../services/sse');
const { generateWithFallback } = require('../services/ai');
const {
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
    // A Strava athlete may back more than one rooka account; give each of them
    // their own copy of the activity rather than only the first one mapped.
    getStravaUserIdsForAthlete(owner_id).then((userIds) => {
      if (!userIds.length) {
        getStravaActivity(owner_id, object_id);
        return;
      }
      userIds.forEach((userId) => getStravaActivity(owner_id, object_id, userId));
    });
  } else if (aspect_type === "update" && object_type === "activity" && updates && updates.title) {
    // Renamed on Strava (by the athlete, or by rooka's own write-back): rename rooka's copy too.
    const title = String(updates.title).slice(0, 200);
    getStravaUserIdsForAthlete(owner_id).then((userIds) => {
      userIds.forEach((userId) =>
        db.run(`UPDATE activities SET name = ? WHERE user_id = ? AND strava_activity_id = ?`, [title, userId, String(object_id)])
      );
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
          signal: AbortSignal.timeout(15000),
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
            signal: AbortSignal.timeout(15000),
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
          if (
            await activityMerge.absorbIfDuplicate(req.user.id, {
              source: "strava",
              sourceId: act.id,
              name: act.name,
              sport_type: act.sport_type,
              start_date: act.start_date,
              moving_time_min: act.moving_time / 60,
              distance_km: act.distance / 1000,
              elevation_m: act.total_elevation_gain,
              average_heartrate: act.average_heartrate || null,
              average_watts: act.weighted_average_watts || act.average_watts || null,
              max_heartrate: act.max_heartrate || null,
              polyline: extractStravaPolyline(act),
              rooka_score: rookaScore,
              tss,
            })
          ) {
            storedForUser++;
            continue;
          }

          const ok = await new Promise((resolve) =>
            db.run(
              `INSERT INTO activities (user_id, strava_activity_id, name, sport_type, distance_km, elevation_m, moving_time_min, average_heartrate, average_watts, max_heartrate, start_date, tss, rooka_score, polyline) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                     ON CONFLICT(user_id, strava_activity_id) DO UPDATE SET name=excluded.name, tss=excluded.tss, rooka_score=excluded.rooka_score, moving_time_min=excluded.moving_time_min, average_heartrate=excluded.average_heartrate, average_watts=excluded.average_watts, max_heartrate=excluded.max_heartrate, polyline=COALESCE(excluded.polyline, polyline)`,
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
        <title>Strava Connected - rooka</title>
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
          <p>Redirecting back to rooka...</p>
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
        signal: AbortSignal.timeout(15000),
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
          error: `This Strava account is already connected to another rooka account (${conflict.username}). Connect it here as well?`,
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
            signal: AbortSignal.timeout(15000),
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


router.post("/api/user/disconnect/garmin", authenticateToken, async (req, res) => {
  // Deregister at Garmin (best effort) and drop the tokens.
  try {
    await require("../services/garmin").disconnect(req.user.id);
  } catch (e) {
    console.error("Garmin disconnect error:", e.message);
    return res.status(500).json({ error: "Failed to disconnect Garmin." });
  }
  res.json({ message: "Garmin disconnected successfully!" });
});

/**
 * Workouts to the athlete's Garmin calendar through Garmin's Training API
 * (services/garminTraining.js). Shared by POST /api/sync-garmin and POST /api/devices/send-workouts.
 */
async function sendWorkoutsToGarmin(userId, selectedWorkouts) {
  return require("../services/garminTraining").pushWorkouts(userId, selectedWorkouts);
}

router.post("/api/sync-garmin", authenticateToken, async (req, res) => {
  const selectedWorkouts = Array.isArray(req.body.workouts) ? req.body.workouts : null;
  const result = await sendWorkoutsToGarmin(req.user.id, selectedWorkouts);
  res.status(result.status).json(result.body);
});

/**
 * Ingests biometrics and workouts collected directly from Apple HealthKit.
 */
router.post("/api/healthkit/sync", authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const { biometrics = [], workouts = [], appleWatchConnected } = req.body;

  try {
    let biometricsSynced = 0;
    let workoutsSynced = 0;

    const hasWatchData =
      appleWatchConnected === true ||
      (Array.isArray(workouts) &&
        workouts.some((w) => /apple\s*watch/i.test(`${w?.source || ""} ${w?.name || ""}`))) ||
      (Array.isArray(biometrics) &&
        biometrics.some(
          (b) =>
            (b?.hrv_sdnn || 0) > 0 ||
            (b?.sleep_deep_minutes || 0) > 0 ||
            (b?.sleep_rem_minutes || 0) > 0 ||
            (b?.sleep_core_minutes || 0) > 0,
        ));

    db.run(
      `UPDATE users SET apple_health_connected = 1, apple_watch_connected = CASE WHEN ? = 1 THEN 1 ELSE COALESCE(apple_watch_connected, 0) END WHERE id = ?`,
      [hasWatchData ? 1 : 0, userId],
      () => {},
    );

    // 1. Process Biometrics & Recovery Data
    if (Array.isArray(biometrics) && biometrics.length > 0) {
      const bioStmt = db.prepare(`
        INSERT INTO biometrics (
          user_id, date, weight_kg, body_fat_percent, resting_hr, avg_hr, hrv_sdnn,
          sleep_minutes, sleep_deep_minutes, sleep_rem_minutes, sleep_core_minutes, sleep_awake_minutes,
          steps, active_calories, vo2_max
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, date) DO UPDATE SET
          weight_kg = COALESCE(excluded.weight_kg, biometrics.weight_kg),
          body_fat_percent = COALESCE(excluded.body_fat_percent, biometrics.body_fat_percent),
          resting_hr = COALESCE(excluded.resting_hr, biometrics.resting_hr),
          avg_hr = COALESCE(excluded.avg_hr, biometrics.avg_hr),
          hrv_sdnn = COALESCE(excluded.hrv_sdnn, biometrics.hrv_sdnn),
          sleep_minutes = COALESCE(excluded.sleep_minutes, biometrics.sleep_minutes),
          sleep_deep_minutes = COALESCE(excluded.sleep_deep_minutes, biometrics.sleep_deep_minutes),
          sleep_rem_minutes = COALESCE(excluded.sleep_rem_minutes, biometrics.sleep_rem_minutes),
          sleep_core_minutes = COALESCE(excluded.sleep_core_minutes, biometrics.sleep_core_minutes),
          sleep_awake_minutes = COALESCE(excluded.sleep_awake_minutes, biometrics.sleep_awake_minutes),
          steps = COALESCE(excluded.steps, biometrics.steps),
          active_calories = COALESCE(excluded.active_calories, biometrics.active_calories),
          vo2_max = COALESCE(excluded.vo2_max, biometrics.vo2_max)
      `);

      for (const b of biometrics) {
        if (!b.date) continue;
        bioStmt.run(
          userId,
          b.date,
          b.weight_kg ?? null,
          b.body_fat_percent ?? null,
          b.resting_hr ?? null,
          b.avg_hr ?? null,
          b.hrv_sdnn ?? null,
          b.sleep_minutes ?? null,
          b.sleep_deep_minutes ?? null,
          b.sleep_rem_minutes ?? null,
          b.sleep_core_minutes ?? null,
          b.sleep_awake_minutes ?? null,
          b.steps ?? null,
          b.active_calories ?? null,
          b.vo2_max ?? null,
        );
        biometricsSynced++;
      }
      bioStmt.finalize();
      // Resting HR as a baseline metric: the 7-day average from Apple Health, so the
      // coach and the zones use the current value rather than one typed in once.
      db.get(
        `SELECT AVG(resting_hr) AS rhr, COUNT(resting_hr) AS n FROM biometrics WHERE user_id = ? AND resting_hr > 0 AND date >= date('now', '-7 days')`,
        [userId],
        (avgErr, avgRow) => {
          if (!avgErr && avgRow && avgRow.n >= 3) {
            require("../services/athleteFacts").setMetric(userId, "resting_hr", String(Math.round(avgRow.rhr)), "apple_health").catch(() => {});
          }
        }
      );
    }

    // 2. Process Workouts
    if (Array.isArray(workouts) && workouts.length > 0) {
      const athleteZoneRows = await new Promise((resolve) => {
        db.all(`SELECT * FROM athlete_zones WHERE user_id = ?`, [userId], (err, rows) => {
          resolve(rows || []);
        });
      });

      const hkUser = await new Promise((resolve) =>
        db.get(`SELECT rooka_start_date FROM users WHERE id = ?`, [userId], (err, row) => resolve(row))
      );
      const hkStartDay = hkUser && hkUser.rooka_start_date ? hkUser.rooka_start_date.substring(0, 10) : null;

      for (const w of workouts) {
        if (!w.external_id || !w.start_date) continue;

        // Already imported from Apple Health: nothing to do.
        const known = await new Promise((resolve) =>
          db.get(`SELECT id FROM activities WHERE user_id = ? AND healthkit_workout_id = ?`, [userId, w.external_id], (err, row) => resolve(row))
        );
        if (known) continue;

        const sport = mapStravaSportToRooka ? mapStravaSportToRooka(w.sport_type || 'Run') : (w.sport_type || 'Run');
        const movingTimeMin = Math.round(Number(w.duration_min) || 0);
        const distanceKm = Math.round((Number(w.distance_km) || 0) * 100) / 100;
        const avgHr = w.avg_heartrate ? Math.round(Number(w.avg_heartrate)) : null;

        // Scored like every other import: against the athlete's own zones, from their rooka start date.
        // (This used to call the async scorer without awaiting it, which stored "NaN" points.)
        let score = 0;
        const startDay = String(w.start_date).substring(0, 10);
        if (!hkStartDay || startDay >= hkStartDay) {
          score = await calculateRookaScoreZoned({ userId, movingTimeMin, avgHr, sport });
        }

        // The same workout often arrives from Strava as well (the watch uploads to both): merge, don't duplicate.
        const mergedId = await activityMerge.absorbIfDuplicate(userId, {
          source: 'healthkit',
          sourceId: w.external_id,
          name: w.name || `${sport} Workout`,
          sport_type: sport,
          start_date: w.start_date,
          moving_time_min: movingTimeMin,
          distance_km: distanceKm,
          elevation_m: w.elevation_m || null,
          average_heartrate: avgHr,
          rooka_score: score,
          tss: score,
        });
        if (mergedId) {
          workoutsSynced++;
          continue;
        }

        const actId = Date.now() + Math.floor(Math.random() * 1000);

        await new Promise((resolve) => {
          db.run(
            `INSERT INTO activities (
              id, user_id, name, sport_type, distance_km, elevation_m,
              moving_time_min, average_heartrate, start_date, tss, rooka_score, healthkit_workout_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              actId,
              userId,
              w.name || `${sport} Workout`,
              sport,
              distanceKm,
              w.elevation_m || 0,
              movingTimeMin,
              avgHr,
              w.start_date,
              score,
              score,
              w.external_id,
            ],
            () => resolve(),
          );
        });

        workoutsSynced++;
      }

      if (workoutsSynced > 0 && typeof updateUserRookaAndCheckLevel === 'function') {
        await updateUserRookaAndCheckLevel(userId);
      }
    }

    res.json({
      success: true,
      message: `Synced ${biometricsSynced} biometric record(s) and ${workoutsSynced} workout(s) from Apple Health!`,
      biometricsSynced,
      workoutsSynced,
    });
  } catch (err) {
    console.error("HealthKit sync error:", err);
    res.status(500).json({ error: "Failed to sync HealthKit data", details: err.message });
  }
});

/**
 * GET /api/healthkit/today
 * Returns today's biometric record for the logged-in athlete.
 */
router.get("/api/healthkit/today", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const todayStr = getAMSDateString ? getAMSDateString() : new Date().toISOString().split('T')[0];

    db.get(
      `SELECT * FROM biometrics WHERE user_id = ? AND date = ?`,
      [userId, todayStr],
      (err, row) => {
        if (err) {
          console.error("Error fetching today's biometrics:", err);
          return res.status(500).json({ error: "Database error" });
        }
        res.json({
          success: true,
          biometrics: row || null,
        });
      }
    );
  } catch (err) {
    console.error("Error in /api/healthkit/today:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * GET /api/healthkit/recent
 * Returns recent biometrics records (default last 7 days).
 */
router.get("/api/healthkit/recent", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = Math.min(30, Math.max(1, parseInt(req.query.limit, 10) || 7));

    db.all(
      `SELECT * FROM biometrics WHERE user_id = ? ORDER BY date DESC LIMIT ?`,
      [userId, limit],
      (err, rows) => {
        if (err) {
          console.error("Error fetching recent biometrics:", err);
          return res.status(500).json({ error: "Database error" });
        }
        res.json({
          success: true,
          biometrics: rows || [],
        });
      }
    );
  } catch (err) {
    console.error("Error in /api/healthkit/recent:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * POST /api/healthkit/status
 * Records on-device Apple Health (HealthKit) and Apple Watch (WorkoutKit) connection status.
 */
router.post("/api/healthkit/status", authenticateToken, (req, res) => {
  const userId = req.user.id;
  const { appleHealthConnected, appleWatchConnected } = req.body || {};

  const updates = [];
  const params = [];
  if (typeof appleHealthConnected === "boolean") {
    updates.push("apple_health_connected = ?");
    params.push(appleHealthConnected ? 1 : 0);
  }
  if (typeof appleWatchConnected === "boolean") {
    updates.push("apple_watch_connected = ?");
    params.push(appleWatchConnected ? 1 : 0);
  }

  if (updates.length === 0) {
    return res.json({ success: true });
  }

  params.push(userId);
  db.run(
    `UPDATE users SET ${updates.join(", ")} WHERE id = ?`,
    params,
    (err) => {
      if (err) {
        console.error("Error updating Apple device status:", err.message);
        return res.status(500).json({ error: "Database error" });
      }
      res.json({ success: true });
    },
  );
});

module.exports = router;
module.exports.sendWorkoutsToGarmin = sendWorkoutsToGarmin;

