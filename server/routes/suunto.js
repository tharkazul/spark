/**
 * Suunto Cloud API integration (OAuth2 + workout import).
 *
 * Docs: https://apizone.suunto.com/how-to-start
 *   - Authorization / token: https://cloudapi-oauth.suunto.com
 *   - Data API:              https://cloudapi.suunto.com (needs BOTH a Bearer
 *     JWT and the Ocp-Apim-Subscription-Key header)
 *
 * Required env (server/.env):
 *   SUUNTO_CLIENT_ID, SUUNTO_CLIENT_SECRET   - OAuth app from the API Zone profile
 *   SUUNTO_SUBSCRIPTION_KEY                  - primary/secondary key of the subscription
 *   SUUNTO_REDIRECT_URI (optional)           - must match the Redirect URI registered in
 *                                              the API Zone. Defaults to <host>/suuntoredirect.
 */
const express = require('express');
const router = express.Router();
const db = require('../services/db');
const { authenticateToken } = require('../services/auth');
const { encrypt, decrypt } = require('../services/crypto');
const {
  calculateRookaScoreZoned,
  evaluateQuestsAgainstActivity,
  updateUserRookaAndCheckLevel,
} = require('../services/utils');

// Overridable so the integration can be tested against server/scripts/mock-suunto.js
const SUUNTO_OAUTH_BASE = process.env.SUUNTO_OAUTH_BASE || 'https://cloudapi-oauth.suunto.com';
const SUUNTO_API_BASE = process.env.SUUNTO_API_BASE || 'https://cloudapi.suunto.com';
const FIRST_SYNC_DAYS = 90;
const PAGE_SIZE = 100;
const MAX_PAGES = 5;

const dbGet = (sql, params = []) =>
  new Promise((resolve, reject) => db.get(sql, params, (e, row) => (e ? reject(e) : resolve(row))));
const dbRun = (sql, params = []) =>
  new Promise((resolve, reject) =>
    db.run(sql, params, function (e) {
      return e ? reject(e) : resolve(this);
    }),
  );

function getRedirectUri(req) {
  if (process.env.SUUNTO_REDIRECT_URI) return process.env.SUUNTO_REDIRECT_URI;
  return `${req.protocol}://${req.get('host')}/suuntoredirect`;
}

function basicAuthHeader() {
  const raw = `${process.env.SUUNTO_CLIENT_ID}:${process.env.SUUNTO_CLIENT_SECRET}`;
  return `Basic ${Buffer.from(raw).toString('base64')}`;
}

function isConfigured() {
  return !!(
    process.env.SUUNTO_CLIENT_ID &&
    process.env.SUUNTO_CLIENT_SECRET &&
    process.env.SUUNTO_SUBSCRIPTION_KEY
  );
}

/** The access token is a JWT with a custom `user` claim = Suunto username. */
function usernameFromJwt(jwt) {
  try {
    const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64').toString('utf8'));
    return payload.user || null;
  } catch (_) {
    return null;
  }
}

async function postToken(form) {
  const res = await fetch(`${SUUNTO_OAUTH_BASE}/oauth/token`, {
    method: 'POST',
    headers: {
      Authorization: basicAuthHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(form).toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    const msg = data.error_description || data.error || `HTTP ${res.status}`;
    throw new Error(`Suunto token request failed: ${msg}`);
  }
  return data;
}

async function saveTokens(userId, data) {
  const expiresAt = Math.floor(Date.now() / 1000) + (data.expires_in || 86400);
  await dbRun(
    `INSERT INTO suunto_tokens (user_id, suunto_username, access_token, refresh_token, expires_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       suunto_username = COALESCE(excluded.suunto_username, suunto_username),
       access_token = excluded.access_token,
       refresh_token = excluded.refresh_token,
       expires_at = excluded.expires_at`,
    [
      userId,
      usernameFromJwt(data.access_token),
      encrypt(data.access_token),
      encrypt(data.refresh_token),
      expiresAt,
    ],
  );
}

/** Returns a valid access token for the user, refreshing it when (nearly) expired. */
async function getValidAccessToken(userId) {
  const row = await dbGet(`SELECT * FROM suunto_tokens WHERE user_id = ?`, [userId]);
  if (!row) return null;
  const now = Math.floor(Date.now() / 1000);
  if (row.expires_at - 60 > now) return decrypt(row.access_token);

  const data = await postToken({
    grant_type: 'refresh_token',
    refresh_token: decrypt(row.refresh_token),
  });
  // Suunto may or may not rotate the refresh token; keep the old one if absent.
  if (!data.refresh_token) data.refresh_token = decrypt(row.refresh_token);
  await saveTokens(userId, data);
  return data.access_token;
}

/**
 * Suunto activity ids -> rooka sport buckets. Only well-known ids are mapped;
 * anything else lands in "Other" rather than being guessed.
 * Reference: "Suunto Watches - SuuntoApp - Movescount - FIT - Activities" PDF.
 */
const SUUNTO_ACTIVITY_MAP = {
  0: ['Walk', 'Walking'],
  1: ['Run', 'Running'],
  2: ['Bike', 'Cycling'],
  10: ['Bike', 'Mountain biking'],
  11: ['Walk', 'Hiking'],
  20: ['Strength', 'Outdoor gym'],
  21: ['Swim', 'Swimming'],
  22: ['Run', 'Trail running'],
  23: ['Strength', 'Gym'],
  24: ['Walk', 'Nordic walking'],
  32: ['Strength', 'Fitness class'],
  51: ['Mobility', 'Yoga'],
  52: ['Bike', 'Indoor cycling'],
  53: ['Run', 'Treadmill'],
  54: ['Strength', 'Crossfit'],
  58: ['Mobility', 'Stretching'],
  63: ['Strength', 'Kettlebell'],
  67: ['Bike', 'Fatbiking'],
  73: ['Walk', 'Trekking'],
  76: ['Strength', 'Circuit training'],
  88: ['Swim', 'Open water swimming'],
};

function mapSuuntoSport(activityId) {
  return SUUNTO_ACTIVITY_MAP[activityId] || ['Other', 'Workout'];
}

/** Suunto reports HR in Hz in some payloads and bpm in others; normalise to bpm. */
function toBpm(v) {
  if (v == null || isNaN(Number(v)) || Number(v) <= 0) return null;
  const n = Number(v);
  return Math.round(n < 5 ? n * 60 : n);
}

async function fetchWorkouts(accessToken, sinceMs) {
  const all = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = `${SUUNTO_API_BASE}/v2/workouts?since=${sinceMs}&limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Ocp-Apim-Subscription-Key': process.env.SUUNTO_SUBSCRIPTION_KEY,
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Suunto workouts request failed (HTTP ${res.status}) ${body.slice(0, 200)}`);
    }
    const json = await res.json();
    const batch = Array.isArray(json.payload) ? json.payload : [];
    all.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return all;
}

// ---------------------------------------------------------------------------
// OAuth
// ---------------------------------------------------------------------------

/** Returns the Suunto authorize URL (keeps the client id/redirect on the server). */
router.get('/api/user/settings/suunto-auth-url', authenticateToken, (req, res) => {
  if (!isConfigured()) {
    return res.status(503).json({ error: 'Suunto integration is not configured on the server.' });
  }
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.SUUNTO_CLIENT_ID,
    redirect_uri: getRedirectUri(req),
  });
  res.json({ url: `${SUUNTO_OAUTH_BASE}/oauth/authorize?${params.toString()}` });
});

/** Browser lands here after Suunto login; bounce back into the app via deep link. */
router.get('/suuntoredirect', (req, res) => {
  res.send(`<!DOCTYPE html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Suunto Connected - Rooka</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0d1117; color: #f0f6fc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; }
      .card { background: #161b22; border: 1px solid #30363d; border-radius: 16px; padding: 32px; max-width: 360px; }
      h2 { margin-top: 0; }
      p { color: #8b949e; font-size: 14px; }
    </style>
    <script>
      const search = window.location.search;
      window.location.href = "rookanative://suuntoredirect" + search;
      setTimeout(function() { window.location.href = "rooka://suuntoredirect" + search; }, 300);
    </script>
  </head>
  <body>
    <div class="card"><h2>Suunto Authorization</h2><p>Redirecting back to Rooka...</p></div>
  </body>
</html>`);
});

router.post('/api/user/settings/suunto-exchange', authenticateToken, async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'No authorization code provided.' });
  if (!isConfigured()) {
    return res.status(503).json({ error: 'Suunto integration is not configured on the server.' });
  }

  try {
    const data = await postToken({
      grant_type: 'authorization_code',
      code,
      redirect_uri: getRedirectUri(req),
    });
    await saveTokens(req.user.id, data);
    res.json({ message: 'Suunto connected successfully!' });
  } catch (err) {
    console.error('Suunto OAuth exchange error:', err.message);
    res.status(400).json({ error: 'Suunto rejected the authorization. Please try again.' });
  }
});

router.post('/api/user/disconnect/suunto', authenticateToken, async (req, res) => {
  try {
    await dbRun(`DELETE FROM suunto_tokens WHERE user_id = ?`, [req.user.id]);
    res.json({ message: 'Suunto disconnected successfully!' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to disconnect Suunto from database.' });
  }
});

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

router.post('/api/sync-suunto', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  try {
    if (!isConfigured()) {
      return res.status(503).json({ error: 'Suunto integration is not configured on the server.' });
    }
    const accessToken = await getValidAccessToken(userId);
    if (!accessToken) return res.status(400).json({ error: 'Suunto is not connected.' });

    // Incremental: resume from the newest stored Suunto workout (minus a day of
    // overlap for late-syncing watches); first sync looks back FIRST_SYNC_DAYS.
    const last = await dbGet(
      `SELECT MAX(start_date) AS d FROM activities WHERE user_id = ? AND suunto_workout_id IS NOT NULL`,
      [userId],
    );
    const sinceMs = last && last.d
      ? new Date(last.d).getTime() - 24 * 3600 * 1000
      : Date.now() - FIRST_SYNC_DAYS * 24 * 3600 * 1000;

    const workouts = await fetchWorkouts(accessToken, Math.max(0, sinceMs));

    const userRow = await dbGet(`SELECT rooka_start_date FROM users WHERE id = ?`, [userId]);
    const userStartDay = userRow && userRow.rooka_start_date ? userRow.rooka_start_date.substring(0, 10) : null;

    let stored = 0;
    let failed = 0;

    for (const w of workouts) {
      try {
        if (w.workoutId == null || !w.startTime) continue;
        const startIso = new Date(w.startTime).toISOString();
        const movingMin = (w.totalTime || 0) / 60;
        const [rookaSport, defaultName] = mapSuuntoSport(w.activityId);
        const avgHr = toBpm(w.hrdata && w.hrdata.workoutAvgHR);
        const maxHr = toBpm(w.hrdata && w.hrdata.workoutMaxHR);
        const tss = Math.round((movingMin / 60) * 50);

        let rookaScore = 0;
        if (!userStartDay || startIso.substring(0, 10) >= userStartDay) {
          rookaScore = await calculateRookaScoreZoned({
            userId,
            movingTimeMin: movingMin,
            avgHr: avgHr || undefined,
            avgWatts: undefined,
            sport: rookaSport,
          });
        }

        await dbRun(
          `INSERT INTO activities (user_id, suunto_workout_id, name, sport_type, distance_km, elevation_m, moving_time_min, average_heartrate, max_heartrate, start_date, tss, rooka_score)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(user_id, suunto_workout_id) DO UPDATE SET
             tss = excluded.tss, rooka_score = excluded.rooka_score, moving_time_min = excluded.moving_time_min,
             average_heartrate = excluded.average_heartrate, max_heartrate = excluded.max_heartrate`,
          [
            userId,
            String(w.workoutId),
            w.workoutName || defaultName,
            rookaSport,
            (w.totalDistance || 0) / 1000,
            Math.round(w.totalAscent || 0),
            movingMin,
            avgHr || 0,
            maxHr,
            startIso,
            tss,
            rookaScore,
          ],
        );
        stored++;
      } catch (e) {
        failed++;
        console.error('Suunto activity upsert failed:', e.message);
      }
    }

    let completedQuests = [];
    try {
      completedQuests = (await evaluateQuestsAgainstActivity(userId, null)) || [];
    } catch (e) {
      console.error('Quest evaluation failed after Suunto sync:', e.message);
    }
    // After quest evaluation so quest rewards are part of the recomputed total.
    updateUserRookaAndCheckLevel(userId);

    res.json({
      success: true,
      message: `Successfully synced ${stored} activities!`,
      synced: stored,
      failed,
      completedQuests: completedQuests.map((q) => ({
        id: q.id,
        description: q.description,
        reward_points: q.reward_points,
      })),
    });
  } catch (err) {
    console.error('Suunto Sync Error:', err.message);
    res.status(500).json({ error: 'Suunto sync failed. Check server logs.' });
  }
});

module.exports = router;
