/**
 * Suunto Cloud API integration (OAuth2 + workout import + planned workout push
 * as SuuntoPlus Guides).
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
 *   SUUNTO_APP_NAME (optional)               - application name from the API Zone OAuth settings;
 *                                              used as the guide `owner`. Defaults to "Rooka".
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const db = require('../services/db');
const { authenticateToken } = require('../services/auth');
const { encrypt, decrypt } = require('../services/crypto');
const { createZip } = require('../services/zip');
const { resolveZonesForUser } = require('../services/athleteZones');
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

// ---------------------------------------------------------------------------
// Planned workout push (SuuntoPlus Guides)
// Docs: https://apizone.suunto.com/how-to-use-suuntoplus-guides-api
//   POST   /v2/guides/files        (zip: guide.json + icon.png) -> 201
//   PUT    /v2/guides/files/{id}   -> 200
//   GET    /v2/guides/items        -> list
//   409 Conflict when externalId already exists for that user.
// ---------------------------------------------------------------------------

// Must match the application name registered in the Suunto API Zone OAuth settings.
const SUUNTO_GUIDE_OWNER = process.env.SUUNTO_APP_NAME || 'Rooka';
const GUIDE_ICON_PATH = path.join(__dirname, '..', 'assets', 'suunto-guide-icon.png');
let guideIconCache = null;
function getGuideIcon() {
  if (!guideIconCache) guideIconCache = fs.readFileSync(GUIDE_ICON_PATH);
  return guideIconCache;
}

/** rooka sport -> [Suunto activity id, sport key used for dedupe]. Ids match SUUNTO_ACTIVITY_MAP. */
function suuntoActivityForSport(sport) {
  const s = String(sport || '').trim().toLowerCase();
  if (!s || s === 'rest') return null;
  if (['run', 'running', 'trail', 'treadmill'].includes(s)) return [1, 'run'];
  if (['bike', 'cycling', 'cycle', 'biking', 'ride'].includes(s)) return [2, 'bike'];
  if (['swim', 'swimming'].includes(s)) return [21, 'swim'];
  if (['strength', 'strength_training', 'gym'].includes(s)) return [23, 'strength'];
  if (['walk', 'walking', 'hike', 'hiking'].includes(s)) return [0, 'walk'];
  if (['mobility', 'yoga', 'stretching'].includes(s)) return [51, 'mobility'];
  return [1, s.replace(/[^a-z0-9]/g, '') || 'other'];
}

const DEFAULT_SPEED_MS = { run: 1000 / 360, walk: 1000 / 600, bike: 30 / 3.6, swim: 100 / 120 };

function parsePaceSecondsPerKm(v) {
  const m = String(v || '').match(/(\d+)[:.](\d+)/);
  return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null;
}

function fmtDistance(m) {
  return m >= 1000 ? `${Math.round(m / 100) / 10} km` : `${Math.round(m)} m`;
}
function fmtDuration(sec) {
  if (sec % 60 === 0) return `${sec / 60} min`;
  return sec >= 60 ? `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')} min` : `${sec} s`;
}

/**
 * Guides only document duration triggers, so non-time goals are converted to an
 * estimated duration and the real goal (e.g. "1 km") is kept in the step title.
 */
function stepDurationAndGoal(step, sportKey) {
  const v = Number(step.condition_value) || 0;
  switch (step.condition_type) {
    case 'time_sec':
      return { seconds: Math.round(v), goal: fmtDuration(Math.round(v)) };
    case 'distance':
    case 'distance_km': {
      const meters = step.condition_type === 'distance_km' ? v * 1000 : v;
      const pace = parsePaceSecondsPerKm(step.target_value);
      const speed = pace ? 1000 / pace : DEFAULT_SPEED_MS[sportKey] || DEFAULT_SPEED_MS.run;
      return { seconds: Math.max(30, Math.round(meters / speed)), goal: fmtDistance(meters) };
    }
    case 'reps':
      return { seconds: 60, goal: v ? `${v} reps` : '' };
    case 'lap.button':
      return { seconds: Math.round(v > 0 ? v * 60 : 300), goal: '' };
    case 'time':
    default: {
      const sec = Math.max(1, Math.round((v || 5) * 60));
      return { seconds: sec, goal: fmtDuration(sec) };
    }
  }
}

const STEP_LABEL = {
  warmup: 'Warm-up',
  cooldown: 'Cool-down',
  interval: 'Interval',
  recovery: 'Recovery',
  rest: 'Rest',
  drill: 'Drill',
};

function buildGuideStep(step, sportKey, hrZones) {
  if (step.type === 'repeat') {
    return {
      type: 'repeat',
      times: Math.max(1, parseInt(step.iterations || step.times || 1, 10)),
      steps: (step.steps || []).map((s) => buildGuideStep(s, sportKey, hrZones)),
    };
  }

  const { seconds, goal } = stepDurationAndGoal(step, sportKey);
  const fields = [];
  let targetLabel = '';

  const zone = parseInt(step.zone, 10);
  const hrZone = step.target_type === 'heart.rate.zone' && Array.isArray(hrZones)
    ? hrZones.find((z) => Number(z.zone) === zone)
    : null;
  if (hrZone && hrZone.min && hrZone.max) {
    fields.push({
      type: 'targetHeartRate',
      value: Math.round((hrZone.min + hrZone.max) / 2),
      min: hrZone.min,
      max: hrZone.max,
    });
    targetLabel = `Z${zone}`;
  } else if (step.target_type === 'heart.rate.zone' && zone) {
    targetLabel = `HR Z${zone}`;
  }

  if (step.target_value) targetLabel = String(step.target_value);

  fields.push({ type: 'heartRate' });
  if (sportKey === 'bike') fields.push({ type: 'power' });
  fields.push({ type: 'stepDurationCountdown', value: seconds });

  const label = step.exerciseName || STEP_LABEL[step.type] || 'Step';
  const title = [goal, label, targetLabel ? `@ ${targetLabel}` : '']
    .filter(Boolean)
    .join(' ')
    .slice(0, 60);

  return {
    type: 'fields',
    trigger: { type: 'stepDuration', value: seconds },
    title,
    fields,
  };
}

function guideExternalId(userId, date, sportKey) {
  return `rooka-${userId}-${date}-${sportKey}`;
}

function buildGuide(userId, workout, hrZones) {
  const activity = suuntoActivityForSport(workout.sport);
  if (!activity) return null;
  const [activityId, sportKey] = activity;

  let steps = Array.isArray(workout.steps) ? workout.steps : [];
  if (steps.length === 0 && workout.steps_json) {
    try {
      const parsed = typeof workout.steps_json === 'string' ? JSON.parse(workout.steps_json) : workout.steps_json;
      if (Array.isArray(parsed)) steps = parsed;
    } catch (_) {}
  }
  if (steps.length === 0) {
    const mins = Math.max(5, Math.round(((workout.target_rooka || workout.rookaPoints || 50) / 55) * 60));
    steps = [{ type: 'interval', condition_type: 'time', condition_value: mins, target_type: 'no.target' }];
  }

  const title = String(workout.title || workout.description || `${workout.sport} workout`).trim();
  const description = String(workout.description || title).trim();
  return {
    externalId: guideExternalId(userId, workout.date, sportKey),
    guide: {
      name: `rooka: ${title}`.slice(0, 60),
      description: description.slice(0, 500),
      shortDescription: title.slice(0, 40),
      localDate: workout.date,
      type: 'sequence',
      activities: [activityId],
      usage: 'workout',
      owner: SUUNTO_GUIDE_OWNER,
      externalId: guideExternalId(userId, workout.date, sportKey),
      steps: steps.map((s) => buildGuideStep(s, sportKey, hrZones)),
    },
  };
}

function guideIdFromResponse(json) {
  if (!json || typeof json !== 'object') return null;
  const p = json.payload && typeof json.payload === 'object' ? json.payload : json;
  const id = p.id ?? p.guideId ?? p.fileId ?? json.id;
  return id != null ? String(id) : null;
}

async function suuntoGuideRequest(accessToken, method, pathname, body) {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Ocp-Apim-Subscription-Key': process.env.SUUNTO_SUBSCRIPTION_KEY,
  };
  if (body) headers['Content-Type'] = 'application/zip';
  const res = await fetch(`${SUUNTO_API_BASE}${pathname}`, { method, headers, body });
  const text = await res.text().catch(() => '');
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (_) {}
  return { status: res.status, ok: res.ok, json, text };
}

/** Looks up an existing guide id by externalId via the list endpoint (used after a 409). */
async function findGuideIdByExternalId(accessToken, externalId) {
  const r = await suuntoGuideRequest(accessToken, 'GET', `/v2/guides/items?limit=100&offset=0`);
  if (!r.ok || !r.json) return null;
  const items = Array.isArray(r.json.payload) ? r.json.payload : Array.isArray(r.json) ? r.json : [];
  const hit = items.find((g) => g && (g.externalId === externalId || (g.guide && g.guide.externalId === externalId)));
  return hit ? guideIdFromResponse(hit) : null;
}

async function upsertGuide(accessToken, userId, externalId, zipBuf) {
  const known = await dbGet(`SELECT guide_id FROM suunto_guides WHERE user_id = ? AND external_id = ?`, [userId, externalId]);
  let guideId = known && known.guide_id;

  if (guideId) {
    const put = await suuntoGuideRequest(accessToken, 'PUT', `/v2/guides/files/${encodeURIComponent(guideId)}`, zipBuf);
    if (put.ok) return guideId;
    if (put.status !== 404) throw new Error(`Suunto rejected guide update (HTTP ${put.status}) ${put.text.slice(0, 200)}`);
    guideId = null; // deleted on Suunto's side -> create again
  }

  const post = await suuntoGuideRequest(accessToken, 'POST', '/v2/guides/files', zipBuf);
  if (post.ok) {
    guideId = guideIdFromResponse(post.json);
  } else if (post.status === 409) {
    guideId = await findGuideIdByExternalId(accessToken, externalId);
    if (guideId) {
      const put = await suuntoGuideRequest(accessToken, 'PUT', `/v2/guides/files/${encodeURIComponent(guideId)}`, zipBuf);
      if (!put.ok) throw new Error(`Suunto rejected guide update (HTTP ${put.status}) ${put.text.slice(0, 200)}`);
    }
    // No id found: the guide already exists on Suunto; treat as delivered.
  } else {
    throw new Error(`Suunto rejected guide (HTTP ${post.status}) ${post.text.slice(0, 200)}`);
  }

  await dbRun(
    `INSERT INTO suunto_guides (user_id, external_id, guide_id, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(user_id, external_id) DO UPDATE SET guide_id = COALESCE(excluded.guide_id, guide_id), updated_at = CURRENT_TIMESTAMP`,
    [userId, externalId, guideId],
  );
  return guideId;
}

function toYYYYMMDD(d) {
  const s = String(d || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) return parsed.toLocaleDateString('en-CA', { timeZone: 'Europe/Amsterdam' });
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Amsterdam' });
}

/**
 * Pushes planned workouts to the user's Suunto account as SuuntoPlus Guides.
 * Shared by POST /api/sync-suunto-workouts and POST /api/devices/send-workouts.
 *
 * @param {number} userId
 * @param {Array|null} selectedWorkouts explicit workouts from the client, or null for
 *   all upcoming micro_plan workouts.
 * @returns {Promise<{ status: number, body: object }>}
 */
async function pushWorkoutsToSuunto(userId, selectedWorkouts) {
  try {
    if (!isConfigured()) {
      return { status: 503, body: { error: 'Suunto integration is not configured on the server.' } };
    }
    const accessToken = await getValidAccessToken(userId);
    if (!accessToken) return { status: 400, body: { error: 'Suunto is not connected.' } };

    let workouts;
    if (Array.isArray(selectedWorkouts) && selectedWorkouts.length > 0) {
      workouts = selectedWorkouts.map((w) => ({
        date: toYYYYMMDD(w.date),
        sport: w.sport,
        title: w.title,
        description: w.description || w.title,
        rookaPoints: w.rookaPoints || w.target_rooka,
        steps: Array.isArray(w.steps) ? w.steps : [],
        steps_json: w.steps_json,
      }));
    } else {
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Amsterdam' });
      workouts = await new Promise((resolve, reject) =>
        db.all(
          `SELECT date, sport, description, target_rooka, steps_json FROM micro_plan WHERE user_id = ? AND date >= ?`,
          [userId, today],
          (e, rows) => (e ? reject(e) : resolve((rows || []).map((r) => ({ ...r, date: toYYYYMMDD(r.date) })))),
        ),
      );
    }

    const zoneCache = new Map();
    const icon = getGuideIcon();
    let syncedCount = 0;
    let lastError = null;

    for (const w of workouts) {
      const sportKey = (suuntoActivityForSport(w.sport) || [])[1];
      if (!sportKey) continue;
      try {
        if (!zoneCache.has(sportKey)) {
          const z = await resolveZonesForUser(userId, w.sport).catch(() => null);
          zoneCache.set(sportKey, z && z.hrZones);
        }
        const built = buildGuide(userId, w, zoneCache.get(sportKey));
        if (!built) continue;
        const zip = createZip([
          { name: 'guide.json', data: JSON.stringify(built.guide) },
          { name: 'icon.png', data: icon },
        ]);
        await upsertGuide(accessToken, userId, built.externalId, zip);
        syncedCount++;
      } catch (e) {
        lastError = e.message;
        console.error(`Suunto guide push failed for ${w.sport} on ${w.date}:`, e.message);
      }
    }

    if (syncedCount === 0) {
      return {
        status: lastError ? 502 : 400,
        body: { error: lastError ? 'Failed to send workouts to Suunto.' : 'No valid workouts found to send.', details: lastError },
      };
    }
    return {
      status: 200,
      body: {
        success: true,
        message: `Successfully sent ${syncedCount} workout${syncedCount === 1 ? '' : 's'} to Suunto!`,
        syncedCount,
      },
    };
  } catch (err) {
    console.error('Suunto guide push error:', err.message);
    return { status: 500, body: { error: 'Suunto workout push failed.', details: err.message } };
  }
}

router.post('/api/sync-suunto-workouts', authenticateToken, async (req, res) => {
  const selected = Array.isArray(req.body && req.body.workouts) ? req.body.workouts : null;
  const result = await pushWorkoutsToSuunto(req.user.id, selected);
  res.status(result.status).json(result.body);
});

module.exports = router;
module.exports.pushWorkoutsToSuunto = pushWorkoutsToSuunto;
