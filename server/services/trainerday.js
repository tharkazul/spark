/**
 * TrainerDay integration: OAuth 2.0 tokens, rooka steps -> TrainerDay
 * workoutBlocks, and planned bike sessions mirrored onto the athlete's
 * TrainerDay calendar so they can ride them in ERG mode.
 *
 * Docs: https://api.trainerday.com/ (OAuth) and the OpenAPI spec at
 * https://api.trainerday.com/api/v1/spec (WorkoutBlock / BlockSegment /
 * SegmentTarget, /api/v2/calendar/events).
 *
 * Required env (server/.env):
 *   TRAINERDAY_CLIENT_ID, TRAINERDAY_CLIENT_SECRET
 *   TRAINERDAY_REDIRECT_URI  - exactly the URI registered with TrainerDay
 *                              (https://api.rooka.io/trainerdayredirect)
 *
 * Targets. TrainerDay ERG works in % of the FTP set in TrainerDay, and a
 * SegmentTarget with min != max is a ramp from min to max, so every steady
 * step sends one value (min only). Fields with no value are left out rather
 * than sent as null: TrainerDay's validator rejects null for enum fields such
 * as controlMode, although the spec marks them nullable.
 *   power.exact   -> watts / FTP. The FTP is TrainerDay's own (GET
 *                    /api/v1/athlete), because that is what ERG multiplies
 *                    the percentage by; rooka's FTP is the fallback.
 *   power.zone    -> a fixed point inside the Coggan zone (POWER_ZONE_PCT).
 *   heart.rate.zone -> the power that rides like that HR zone
 *                    (HR_ZONE_PCT), held in ERG, with the athlete's bpm band
 *                    as an on-screen note. Not percentOfHR: that flag switches
 *                    the whole event to TrainerDay's HR mode (no mixing with
 *                    power steps), works off TrainerDay's threshold HR rather
 *                    than rooka's zones, and the trainer chasing HR lags badly
 *                    on short intervals.
 *   pace / no.target -> free ride (no ERG), with any pace as a note.
 *
 * Paid accounts only: TrainerDay answers 403 "You do not have a paid
 * subscription" to calendar writes for free accounts. The athlete profile's
 * hasProFeatures is stored per user (has_pro); free accounts are left out of
 * sends and the background sync, and re-checked once a day in case they upgrade.
 */
const crypto = require("crypto");
const db = require("./db");
const { encrypt, decrypt } = require("./crypto");

// Overridable so the integration can be tested against a mock server.
const TD_BASE = process.env.TRAINERDAY_BASE || "https://api.trainerday.com";
const SCOPES = "athlete:read calendar:read calendar:write";
// Access tokens live 6 hours; refresh a little early.
const REFRESH_MARGIN_SEC = 5 * 60;
// How far ahead the calendar is kept in sync automatically.
const MIRROR_DAYS = 14;

const dbGet = (sql, params = []) =>
  new Promise((resolve, reject) => db.get(sql, params, (e, row) => (e ? reject(e) : resolve(row))));
const dbAll = (sql, params = []) =>
  new Promise((resolve, reject) => db.all(sql, params, (e, rows) => (e ? reject(e) : resolve(rows || []))));
const dbRun = (sql, params = []) =>
  new Promise((resolve, reject) =>
    db.run(sql, params, function (e) {
      return e ? reject(e) : resolve(this);
    }),
  );

function isConfigured() {
  return !!(
    process.env.TRAINERDAY_CLIENT_ID &&
    process.env.TRAINERDAY_CLIENT_SECRET &&
    process.env.TRAINERDAY_REDIRECT_URI
  );
}

// ---------------------------------------------------------------------------
// Converter: rooka steps_json -> TrainerDay workoutBlocks
// ---------------------------------------------------------------------------

/** Where each Coggan power zone is ridden in ERG, in % FTP (zone bands in services/zones.js). */
const POWER_ZONE_PCT = { 1: 50, 2: 65, 3: 83, 4: 98, 5: 113, 6: 135, 7: 160 };

/** The power that rides like each 5-zone (%max HR) heart-rate zone, in % FTP. */
const HR_ZONE_PCT = { 1: 50, 2: 65, 3: 80, 4: 95, 5: 110 };

const SEGMENT_TYPE = {
  warmup: "warm-up",
  cooldown: "cooldown",
  rest: "rest",
  recovery: "rest",
  interval: "interval",
  drill: "interval",
  active: "active",
};

const STEP_LABEL = {
  warmup: "Warm-up",
  cooldown: "Cool-down",
  rest: "Rest",
  recovery: "Recovery",
  interval: "Interval",
  drill: "Drill",
  active: "Active",
};

const BIKE_SPORTS = new Set([
  "bike", "cycling", "cycle", "biking", "ride", "virtualride", "virtual ride",
  "indoor cycling", "indoor_cycling", "indoorcycling", "spin", "spinning",
]);

function isBikeSport(sport) {
  return BIKE_SPORTS.has(String(sport || "").trim().toLowerCase());
}

/** Ride speed for distance steps when an estimate in time is needed (2 min/km, as in workoutPlanning). */
const BIKE_SEC_PER_KM = 120;

/** Duration of one step. `time` is minutes, unless it is clearly seconds (same rule as liveCoach/workoutPlanning). */
function stepDuration(step) {
  const v = Number(step.condition_value) || 0;
  switch (step.condition_type) {
    case "time_sec":
      return { durationType: "second", durationValue: Math.max(1, Math.round(v)) };
    case "distance":
      return { durationType: "meter", durationValue: Math.max(1, Math.round(v)) };
    case "distance_km":
      return { durationType: "meter", durationValue: Math.max(1, Math.round(v * 1000)) };
    case "time": {
      const sec = v > 180 && v % 30 === 0 ? v : v * 60;
      return { durationType: "second", durationValue: Math.max(1, Math.round(sec || 300)) };
    }
    default:
      // reps, lap button: ride until the athlete presses lap, with a sensible length for the graph.
      return { durationType: "second", durationValue: Math.round(v > 0 && step.condition_type === "lap.button" ? v * 60 : 300), openEnded: true };
  }
}

function wattsOf(step) {
  const m = String(step.target_value == null ? "" : step.target_value).match(/\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

function hrBand(hrZones, zone) {
  if (!Array.isArray(hrZones)) return null;
  const z = hrZones.find((b) => Number(b.zone) === Number(zone));
  if (!z || !(Number(z.min) > 0)) return null;
  return { min: Math.round(Number(z.min)), max: z.max == null ? null : Math.round(Number(z.max)) };
}

/** "High Cadence Spin-Up (110-120 rpm)" -> { min: 110, max: 120 }. */
function cadenceOf(step) {
  const text = `${step.exerciseName || ""} ${step.cadence || ""}`;
  const range = text.match(/(\d{2,3})\s*[-–]\s*(\d{2,3})\s*rpm/i);
  if (range) return { min: Number(range[1]), max: Number(range[2]) };
  const single = text.match(/(\d{2,3})\s*rpm/i);
  return single ? { min: Number(single[1]), max: null } : null;
}

/**
 * The ERG target of one step, in % FTP, or null for a free-ride step.
 * Returns { pct, note } — note is shown on screen during the segment.
 */
function primaryTarget(step, ctx) {
  const tt = step.target_type;
  const zone = parseInt(step.zone, 10);
  const watts = wattsOf(step);

  // power.zone with a wattage in target_value is treated as watts, like liveCoach does.
  if (tt === "power.exact" || (tt === "power.zone" && watts)) {
    if (!watts) return null;
    if (ctx.ftp > 0) return { pct: Math.round((watts / ctx.ftp) * 100), note: null };
    return { pct: null, note: `${Math.round(watts)} W` };
  }
  if (tt === "power.zone" && POWER_ZONE_PCT[zone]) {
    return { pct: POWER_ZONE_PCT[zone], note: null };
  }
  if (tt === "heart.rate.zone" && HR_ZONE_PCT[zone]) {
    const band = hrBand(ctx.hrZones, zone);
    const note = band
      ? `HR Z${zone} ${band.min}${band.max ? `-${band.max}` : "+"} bpm`
      : `HR Z${zone}`;
    return { pct: HR_ZONE_PCT[zone], note };
  }
  if ((tt === "pace.exact" || tt === "pace.zone") && step.target_value) {
    return { pct: null, note: `${String(step.target_value).trim()} /km` };
  }
  return null;
}

function buildSegment(step, ctx) {
  const { durationType, durationValue, openEnded } = stepDuration(step);
  const target = primaryTarget(step, ctx);
  const hasErg = !!(target && target.pct > 0);
  const name = String(step.exerciseName || STEP_LABEL[step.type] || "Step").trim().slice(0, 80);

  const segment = {
    name,
    segmentType: openEnded ? "open-ended" : hasErg ? SEGMENT_TYPE[step.type] || "interval" : "free-ride",
    durationType,
    durationValue,
    pressLapButton: !!openEnded,
    targets: [],
  };
  // No controlMode on a free ride: the trainer is not held at a power.
  if (hasErg) {
    segment.controlMode = "erg";
    segment.targets.push({ type: "primary", min: target.pct });
  }
  const cadence = cadenceOf(step);
  if (cadence) segment.targets.push(cadence.max ? { type: "cadence", min: cadence.min, max: cadence.max } : { type: "cadence", min: cadence.min });
  if (target && target.note) segment.notes = [{ timeOffset: 0, text: target.note }];
  return segment;
}

/** Segments for a step; a repeat nested inside a repeat is unrolled (blocks hold flat segments). */
function segmentsOf(step, ctx) {
  if (step && step.type === "repeat") {
    const times = Math.max(1, parseInt(step.iterations || step.times || 1, 10));
    const inner = (Array.isArray(step.steps) ? step.steps : []).flatMap((s) => segmentsOf(s, ctx));
    return Array.from({ length: times }, () => inner.map((s) => ({ ...s }))).flat();
  }
  return step ? [buildSegment(step, ctx)] : [];
}

/**
 * rooka steps -> TrainerDay workoutBlocks.
 * @param {Array} steps rooka steps (steps_json)
 * @param {{ ftp?: number, hrZones?: Array }} ctx
 */
function toWorkoutBlocks(steps, ctx = {}) {
  const blocks = [];
  for (const step of Array.isArray(steps) ? steps : []) {
    if (!step) continue;
    if (step.type === "repeat") {
      const segments = (Array.isArray(step.steps) ? step.steps : []).flatMap((s) => segmentsOf(s, ctx));
      if (segments.length === 0) continue;
      const reps = Math.max(1, parseInt(step.iterations || step.times || 1, 10));
      blocks.push({ type: "repetition", reps, segments });
    } else {
      blocks.push({ type: "segment", segments: [buildSegment(step, ctx)] });
    }
  }
  return blocks;
}

function blocksDurationMinutes(blocks) {
  let sec = 0;
  for (const b of blocks) {
    const once = b.segments.reduce(
      (sum, s) => sum + (s.durationType === "meter" ? (s.durationValue / 1000) * BIKE_SEC_PER_KM : s.durationValue),
      0,
    );
    sec += once * (b.reps || 1);
  }
  return Math.round(sec / 60);
}

function parseSteps(workout) {
  if (Array.isArray(workout.steps) && workout.steps.length > 0) return workout.steps;
  if (workout.steps_json) {
    try {
      const parsed = typeof workout.steps_json === "string" ? JSON.parse(workout.steps_json) : workout.steps_json;
      if (Array.isArray(parsed)) return parsed;
    } catch (_) {}
  }
  return [];
}

/** The calendar event body for one rooka bike workout. */
function buildCalendarEvent(workout, ctx = {}) {
  let steps = parseSteps(workout);
  if (steps.length === 0) {
    const mins = Math.max(5, Math.round(((workout.target_rooka || workout.rookaPoints || 50) / 55) * 60));
    steps = [{ type: "interval", condition_type: "time", condition_value: mins, target_type: "no.target" }];
  }
  const workoutBlocks = toWorkoutBlocks(steps, ctx);
  const title = String(workout.title || workout.description || "Bike workout").trim();
  const description = String(workout.details || workout.description || title).trim();
  return {
    calendarDate: workout.date,
    percentOfHR: false,
    isOutdoorWorkout: false,
    embedWorkout: {
      title: `rooka: ${title}`.slice(0, 120),
      description: description.slice(0, 5000),
      author: "rooka",
      workoutType: "bike",
      durationMinutes: blocksDurationMinutes(workoutBlocks),
      tags: ["rooka"],
      workoutBlocks,
    },
  };
}

// ---------------------------------------------------------------------------
// OAuth
// ---------------------------------------------------------------------------

/** OAuth `state`: the rooka user id, signed, so the callback knows whom the code belongs to. */
function stateSecret() {
  return crypto.createHash("sha256").update(`trainerday-state:${process.env.JWT_SECRET || process.env.ENCRYPTION_KEY || ""}`).digest();
}

function signState(userId, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ u: userId, n: crypto.randomBytes(8).toString("hex"), e: now + 15 * 60 * 1000 })).toString("base64url");
  const sig = crypto.createHmac("sha256", stateSecret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

/** Returns the user id from a valid, unexpired state, else null. */
function verifyState(state, now = Date.now()) {
  const [payload, sig] = String(state || "").split(".");
  if (!payload || !sig) return null;
  const expected = crypto.createHmac("sha256", stateSecret()).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!data.u || !(data.e > now)) return null;
    return data.u;
  } catch (_) {
    return null;
  }
}

function authorizeUrl(userId) {
  const params = new URLSearchParams({
    client_id: process.env.TRAINERDAY_CLIENT_ID,
    response_type: "code",
    redirect_uri: process.env.TRAINERDAY_REDIRECT_URI,
    scope: SCOPES,
    state: signState(userId),
  });
  return `${TD_BASE}/oauth/authorize?${params.toString()}`;
}

class TrainerDayAuthError extends Error {}

async function postForm(pathname, form) {
  const res = await fetch(`${TD_BASE}${pathname}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      ...form,
      client_id: process.env.TRAINERDAY_CLIENT_ID,
      client_secret: process.env.TRAINERDAY_CLIENT_SECRET,
    }).toString(),
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

async function postToken(form) {
  const { res, data } = await postForm("/oauth/token", form);
  if (!res.ok || !data.access_token) {
    const msg = data.error_description || data.error || `HTTP ${res.status}`;
    // invalid_grant: the refresh token is dead (revoked in TrainerDay, or rotated away).
    const Err = data.error === "invalid_grant" ? TrainerDayAuthError : Error;
    throw new Err(`TrainerDay token request failed: ${msg}`);
  }
  return data;
}

async function saveTokens(userId, data, now = Date.now()) {
  const expiresAt = Math.floor(now / 1000) + (Number(data.expires_in) || 6 * 3600);
  await dbRun(
    `INSERT INTO trainerday_tokens (user_id, access_token, refresh_token, expires_at, scope)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       access_token = excluded.access_token,
       refresh_token = excluded.refresh_token,
       expires_at = excluded.expires_at,
       scope = COALESCE(excluded.scope, scope)`,
    [userId, encrypt(data.access_token), encrypt(data.refresh_token), expiresAt, data.scope || null],
  );
}

/** Stores the tokens; returns whether the account is paid (null when TrainerDay doesn't say). */
async function exchangeCode(userId, code) {
  const data = await postToken({
    grant_type: "authorization_code",
    code,
    redirect_uri: process.env.TRAINERDAY_REDIRECT_URI,
  });
  await saveTokens(userId, data);
  const athlete = await fetchAthlete(userId, data.access_token).catch(() => null);
  return { isPro: athlete ? athlete.isPro : null };
}

// One refresh at a time per user: a rotated refresh token would make the second
// of two parallel refreshes fail with invalid_grant and look like a disconnect.
const refreshing = new Map();

/** A valid access token for the user (refreshed when it expires within 5 minutes), or null when not connected. */
async function getValidAccessToken(userId, now = Date.now()) {
  const row = await dbGet(`SELECT * FROM trainerday_tokens WHERE user_id = ?`, [userId]);
  if (!row) return null;
  if (row.expires_at - REFRESH_MARGIN_SEC > Math.floor(now / 1000)) return decrypt(row.access_token);

  if (!refreshing.has(userId)) {
    const p = (async () => {
      try {
        const oldRefresh = decrypt(row.refresh_token);
        const data = await postToken({ grant_type: "refresh_token", refresh_token: oldRefresh });
        if (!data.refresh_token) data.refresh_token = oldRefresh;
        await saveTokens(userId, data, now);
        return data.access_token;
      } catch (e) {
        if (e instanceof TrainerDayAuthError) {
          // Access was revoked on TrainerDay's side: show the athlete as disconnected.
          await forgetUser(userId);
          return null;
        }
        throw e;
      }
    })().finally(() => refreshing.delete(userId));
    refreshing.set(userId, p);
  }
  return refreshing.get(userId);
}

async function forgetUser(userId) {
  await dbRun(`DELETE FROM trainerday_tokens WHERE user_id = ?`, [userId]);
  await dbRun(`DELETE FROM trainerday_events WHERE user_id = ?`, [userId]);
  athleteCache.delete(userId);
}

/** Revokes both tokens at TrainerDay (best effort) and forgets them here. */
async function disconnect(userId) {
  const row = await dbGet(`SELECT * FROM trainerday_tokens WHERE user_id = ?`, [userId]);
  if (row) {
    for (const [token, hint] of [[decrypt(row.refresh_token), "refresh_token"], [decrypt(row.access_token), "access_token"]]) {
      if (!token) continue;
      try {
        await postForm("/oauth/token/revoke", { token, token_type_hint: hint });
      } catch (e) {
        console.error("TrainerDay token revoke failed:", e.message);
      }
    }
  }
  await forgetUser(userId);
}

async function isConnected(userId) {
  return !!(await dbGet(`SELECT 1 AS ok FROM trainerday_tokens WHERE user_id = ?`, [userId]).catch(() => null));
}

/** Connected with an account that may receive workouts (not known to be free). */
async function canReceiveWorkouts(userId) {
  const row = await dbGet(`SELECT has_pro FROM trainerday_tokens WHERE user_id = ?`, [userId]).catch(() => null);
  return !!row && row.has_pro !== 0;
}

/** For the app: { connected, pro }. pro is false only when TrainerDay said the account is free. */
async function connectionStatus(userId) {
  const row = await dbGet(`SELECT has_pro FROM trainerday_tokens WHERE user_id = ?`, [userId]).catch(() => null);
  return { connected: !!row, pro: !!row && row.has_pro !== 0 };
}

// ---------------------------------------------------------------------------
// API client with TrainerDay's rate limit (100 requests / 15 minutes)
// ---------------------------------------------------------------------------

const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT = 95; // a little headroom under TrainerDay's 100
const requestLog = new Map(); // userId -> timestamps of recent requests
const pausedUntil = new Map(); // userId -> ms, after a 429

class TrainerDayRateLimitError extends Error {
  constructor(retryAfterMs) {
    super("TrainerDay rate limit reached");
    this.retryAfterMs = retryAfterMs;
  }
}

/** Takes one request slot for the user, or throws TrainerDayRateLimitError. */
function takeSlot(userId, now = Date.now()) {
  const pause = pausedUntil.get(userId) || 0;
  if (pause > now) throw new TrainerDayRateLimitError(pause - now);
  const recent = (requestLog.get(userId) || []).filter((t) => t > now - RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) {
    requestLog.set(userId, recent);
    throw new TrainerDayRateLimitError(recent[0] + RATE_WINDOW_MS - now);
  }
  recent.push(now);
  requestLog.set(userId, recent);
}

async function apiRequest(userId, accessToken, method, pathname, body) {
  takeSlot(userId);
  const headers = { Authorization: `Bearer ${accessToken}`, Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${TD_BASE}${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 429) {
    const retry = Number(res.headers.get("retry-after"));
    const ms = retry > 0 ? retry * 1000 : RATE_WINDOW_MS;
    pausedUntil.set(userId, Date.now() + ms);
    throw new TrainerDayRateLimitError(ms);
  }
  const text = await res.text().catch(() => "");
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (_) {}
  return { status: res.status, ok: res.ok, json, text };
}

// TrainerDay's athlete FTP, cached so a sync doesn't spend a request on it every time.
const athleteCache = new Map(); // userId -> { ftp, at }
const ATHLETE_TTL_MS = 6 * 3600 * 1000;
const PRO_RECHECK_MS = 24 * 3600 * 1000;
const NOT_PRO_MESSAGE = "TrainerDay only adds workouts to your calendar with a paid TrainerDay subscription.";

class TrainerDayNotProError extends Error {
  constructor() {
    super(NOT_PRO_MESSAGE);
  }
}

function isNotProResponse(r) {
  return r.status === 403 && /paid subscription/i.test(r.text || "");
}

async function setPro(userId, isPro) {
  await dbRun(`UPDATE trainerday_tokens SET has_pro = COALESCE(?, has_pro), pro_checked_at = ? WHERE user_id = ?`, [
    isPro === null ? null : isPro ? 1 : 0,
    Date.now(),
    userId,
  ]);
}

/** GET /api/v1/athlete: caches the FTP and stores whether the account is paid. */
async function fetchAthlete(userId, accessToken) {
  const r = await apiRequest(userId, accessToken, "GET", "/api/v1/athlete");
  if (!r.ok || !r.json) return null;
  const ftp = Number(r.json.ftp) > 0 ? Number(r.json.ftp) : null;
  athleteCache.set(userId, { ftp, at: Date.now() });
  const flag = r.json.hasProFeatures;
  const isPro = flag === undefined || flag === null ? null : !!Number(flag) || flag === true;
  await setPro(userId, isPro);
  return { ftp, isPro };
}

async function getTrainerDayFtp(userId, accessToken) {
  const hit = athleteCache.get(userId);
  if (hit && Date.now() - hit.at < ATHLETE_TTL_MS) return hit.ftp;
  const athlete = await fetchAthlete(userId, accessToken);
  return athlete ? athlete.ftp : null;
}

/**
 * Whether the account may receive workouts. False only when TrainerDay said it
 * is free; a free account is asked again after a day, or at once with `fresh`
 * (an explicit send, so an upgrade takes effect straight away).
 */
async function hasPro(userId, accessToken, { fresh = false } = {}) {
  const row = await dbGet(`SELECT has_pro, pro_checked_at FROM trainerday_tokens WHERE user_id = ?`, [userId]);
  if (!row) return false;
  const stale = !row.pro_checked_at || Date.now() - row.pro_checked_at > PRO_RECHECK_MS;
  if (!row.pro_checked_at || (row.has_pro === 0 && (fresh || stale))) {
    const athlete = await fetchAthlete(userId, accessToken).catch(() => null);
    if (athlete && athlete.isPro !== null) return athlete.isPro;
  }
  return row.has_pro !== 0;
}

/** The FTP that turns watts into ERG percentages: TrainerDay's own, else rooka's. */
async function resolveFtp(userId, accessToken) {
  const tdFtp = await getTrainerDayFtp(userId, accessToken).catch(() => null);
  if (tdFtp) return tdFtp;
  const { resolveZonesForUser } = require("./athleteZones");
  const z = await resolveZonesForUser(userId, "Bike").catch(() => null);
  return z && z.ftp ? z.ftp : null;
}

function eventIdFromResponse(json) {
  if (!json || typeof json !== "object") return null;
  const e = json.event && typeof json.event === "object" ? json.event : json;
  const id = e.eventId ?? e._id ?? e.id;
  return id != null ? String(id) : null;
}

// ---------------------------------------------------------------------------
// Calendar push / mirror
// ---------------------------------------------------------------------------

function amsToday() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Amsterdam" });
}

function addDays(ymd, days) {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function toYYYYMMDD(d) {
  const s = String(d || "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const parsed = new Date(s);
  return isNaN(parsed.getTime()) ? amsToday() : parsed.toLocaleDateString("en-CA", { timeZone: "Europe/Amsterdam" });
}

/** One TrainerDay event per rooka bike session per day (like the Suunto/Garmin dedupe on date + sport). */
function workoutKey(date) {
  return `${date}:bike`;
}

/** rooka workout in the shape the pusher uses, from a client payload or a micro_plan row. */
function normalizeWorkout(w) {
  return {
    date: toYYYYMMDD(w.date),
    sport: w.sport,
    title: String(w.title || w.description || "").trim(),
    details: String(w.details || (w.title && w.description !== w.title ? w.description : "") || "").trim(),
    target_rooka: w.rookaPoints || w.target_rooka,
    steps: parseSteps(w),
  };
}

function sourceHash(w) {
  return crypto
    .createHash("sha1")
    .update(JSON.stringify([w.date, w.title, w.details, w.target_rooka || null, w.steps]))
    .digest("hex");
}

async function upsertEvent(userId, accessToken, workout, ctx, { force = false } = {}) {
  const key = workoutKey(workout.date);
  const hash = sourceHash(workout);
  const known = await dbGet(`SELECT * FROM trainerday_events WHERE user_id = ? AND workout_key = ?`, [userId, key]);
  if (known && known.event_id && known.source_hash === hash && !force) return { eventId: known.event_id, changed: false };

  if (ctx.ftp === undefined) ctx.ftp = await resolveFtp(userId, accessToken);
  const body = buildCalendarEvent(workout, ctx);

  let eventId = known && known.event_id;
  if (eventId) {
    const put = await apiRequest(userId, accessToken, "PUT", `/api/v2/calendar/events/${encodeURIComponent(eventId)}`, body);
    if (isNotProResponse(put)) {
      await setPro(userId, false);
      throw new TrainerDayNotProError();
    }
    if (!put.ok && put.status !== 404) {
      throw new Error(`TrainerDay rejected the event update (HTTP ${put.status}) ${put.text.slice(0, 1000)}`);
    }
    if (!put.ok) eventId = null; // deleted in TrainerDay -> create it again
  }
  if (!eventId) {
    const post = await apiRequest(userId, accessToken, "POST", "/api/v2/calendar/events", body);
    if (isNotProResponse(post)) {
      await setPro(userId, false);
      throw new TrainerDayNotProError();
    }
    if (!post.ok) throw new Error(`TrainerDay rejected the event (HTTP ${post.status}) ${post.text.slice(0, 1000)}`);
    eventId = eventIdFromResponse(post.json);
    if (!eventId) throw new Error("TrainerDay created the event but returned no id");
  }

  await dbRun(
    `INSERT INTO trainerday_events (user_id, workout_key, event_id, calendar_date, source_hash, updated_at)
     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(user_id, workout_key) DO UPDATE SET
       event_id = excluded.event_id, calendar_date = excluded.calendar_date,
       source_hash = excluded.source_hash, updated_at = CURRENT_TIMESTAMP`,
    [userId, key, eventId, workout.date, hash],
  );
  return { eventId, changed: true };
}

async function deleteEvent(userId, accessToken, row) {
  const r = await apiRequest(userId, accessToken, "DELETE", `/api/v2/calendar/events/${encodeURIComponent(row.event_id)}`);
  if (!r.ok && r.status !== 404) throw new Error(`TrainerDay rejected the delete (HTTP ${r.status}) ${r.text.slice(0, 1000)}`);
  await dbRun(`DELETE FROM trainerday_events WHERE user_id = ? AND workout_key = ?`, [userId, row.workout_key]);
}

async function zoneContext(userId) {
  const { resolveWatchHrZones } = require("./athleteZones");
  const hrZones = await resolveWatchHrZones(userId, "Bike").catch(() => null);
  return { hrZones }; // ftp is resolved lazily, only when something is pushed
}

// 403 with a code the app recognises, so it can say why instead of "try again later".
const notProResult = () => ({ status: 403, body: { error: NOT_PRO_MESSAGE, code: "TRAINERDAY_NOT_PRO" } });

function rateLimitResult(e, syncedCount) {
  const minutes = Math.max(1, Math.ceil(e.retryAfterMs / 60000));
  // 503, not 429: the app treats a 429 as rooka's own rate limit.
  return {
    status: syncedCount > 0 ? 200 : 503,
    body: {
      success: syncedCount > 0,
      syncedCount,
      error: syncedCount > 0 ? undefined : `TrainerDay is busy. Please try again in ${minutes} minutes.`,
      message: syncedCount > 0 ? `Sent ${syncedCount}; the rest follows automatically in ${minutes} minutes.` : undefined,
    },
  };
}

/**
 * Pushes bike workouts to the user's TrainerDay calendar. Non-bike workouts are
 * ignored; a payload without any bike workout returns `skipped: true` so the
 * multi-device fan-out leaves TrainerDay out of its result.
 * Shared by POST /api/trainerday/send-workouts and POST /api/devices/send-workouts.
 *
 * @param {number} userId
 * @param {Array|null} selectedWorkouts explicit workouts from the client, or null
 *   to mirror every upcoming planned bike session.
 * @returns {Promise<{ status: number, body: object }>}
 */
async function pushWorkoutsToTrainerDay(userId, selectedWorkouts) {
  try {
    if (!isConfigured()) {
      return { status: 503, body: { error: "TrainerDay integration is not configured on the server." } };
    }
    if (!Array.isArray(selectedWorkouts) || selectedWorkouts.length === 0) {
      return await syncTrainerDayCalendar(userId);
    }
    const workouts = selectedWorkouts.filter((w) => isBikeSport(w.sport)).map(normalizeWorkout);
    if (workouts.length === 0) return { status: 200, body: { success: true, skipped: true, syncedCount: 0 } };

    const accessToken = await getValidAccessToken(userId);
    if (!accessToken) return { status: 400, body: { error: "TrainerDay is not connected." } };
    if (!(await hasPro(userId, accessToken, { fresh: true }))) return notProResult();

    const ctx = await zoneContext(userId);
    let syncedCount = 0;
    let lastError = null;
    for (const w of workouts) {
      try {
        await upsertEvent(userId, accessToken, w, ctx, { force: true });
        syncedCount++;
      } catch (e) {
        if (e instanceof TrainerDayRateLimitError) return rateLimitResult(e, syncedCount);
        if (e instanceof TrainerDayNotProError) return notProResult();
        lastError = e.message;
        console.error(`TrainerDay push failed for ${w.date}:`, e.message);
      }
    }
    if (syncedCount === 0) {
      return { status: 502, body: { error: "Failed to send workouts to TrainerDay.", details: lastError } };
    }
    return {
      status: 200,
      body: {
        success: true,
        message: `Successfully sent ${syncedCount} workout${syncedCount === 1 ? "" : "s"} to TrainerDay!`,
        syncedCount,
      },
    };
  } catch (err) {
    console.error("TrainerDay push error:", err.message);
    return { status: 500, body: { error: "TrainerDay workout push failed.", details: err.message } };
  }
}

/**
 * Mirrors the plan onto the TrainerDay calendar: every planned bike session in
 * the next MIRROR_DAYS is created or updated (only when it changed), and events
 * rooka made for upcoming sessions that are no longer planned are deleted.
 * Past events are left alone. Costs no requests when nothing changed.
 */
async function syncTrainerDayCalendar(userId) {
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) return { status: 400, body: { error: "TrainerDay is not connected." } };
  // A free account can't receive workouts: no requests, no log noise.
  const skippedFree = { status: 200, body: { success: true, skipped: true, notPro: true, syncedCount: 0 } };
  if (!(await hasPro(userId, accessToken))) return skippedFree;

  const today = amsToday();
  const horizon = addDays(today, MIRROR_DAYS - 1);
  const rows = await dbAll(
    `SELECT id, date, sport, description, details, target_rooka, steps_json FROM micro_plan
     WHERE user_id = ? AND date >= ? ORDER BY date, id`,
    [userId, today],
  );
  const planned = new Map();
  for (const r of rows) {
    if (!isBikeSport(r.sport)) continue;
    const w = normalizeWorkout({ ...r, title: r.description });
    if (!planned.has(workoutKey(w.date))) planned.set(workoutKey(w.date), w);
  }

  const tracked = await dbAll(`SELECT * FROM trainerday_events WHERE user_id = ?`, [userId]);
  const ctx = await zoneContext(userId);
  let syncedCount = 0;
  let deletedCount = 0;
  let lastError = null;

  try {
    for (const row of tracked) {
      if (row.calendar_date < today) {
        // Ridden or skipped: keep it in TrainerDay, stop tracking it.
        await dbRun(`DELETE FROM trainerday_events WHERE user_id = ? AND workout_key = ?`, [userId, row.workout_key]);
      } else if (!planned.has(row.workout_key)) {
        try {
          await deleteEvent(userId, accessToken, row);
          deletedCount++;
        } catch (e) {
          if (e instanceof TrainerDayRateLimitError || e instanceof TrainerDayNotProError) throw e;
          lastError = e.message;
        }
      }
    }
    const trackedKeys = new Set(tracked.map((r) => r.workout_key));
    for (const [key, w] of planned) {
      // Beyond the window only sessions the athlete already sent are kept up to date.
      if (w.date > horizon && !trackedKeys.has(key)) continue;
      try {
        const r = await upsertEvent(userId, accessToken, w, ctx);
        if (r.changed) syncedCount++;
      } catch (e) {
        if (e instanceof TrainerDayRateLimitError || e instanceof TrainerDayNotProError) throw e;
        lastError = e.message;
        console.error(`TrainerDay sync failed for ${w.date}:`, e.message);
      }
    }
  } catch (e) {
    if (e instanceof TrainerDayRateLimitError) return rateLimitResult(e, syncedCount);
    if (e instanceof TrainerDayNotProError) return skippedFree;
    throw e;
  }

  if (lastError && syncedCount === 0 && deletedCount === 0) {
    return { status: 502, body: { error: "Failed to send workouts to TrainerDay.", details: lastError } };
  }
  return {
    status: 200,
    body: {
      success: true,
      message: `Successfully sent ${syncedCount} workout${syncedCount === 1 ? "" : "s"} to TrainerDay!`,
      syncedCount,
      deletedCount,
    },
  };
}

let mirrorRunning = false;
/** Cron: keep every connected athlete's TrainerDay calendar in step with their plan. */
async function syncAllTrainerDayUsers() {
  if (!isConfigured() || mirrorRunning) return;
  mirrorRunning = true;
  try {
    const users = await dbAll(`SELECT user_id FROM trainerday_tokens`);
    for (const { user_id: userId } of users) {
      try {
        const r = await syncTrainerDayCalendar(userId);
        if (r.status >= 400) console.warn(`[TrainerDay] sync for user ${userId}: ${r.body.error}${r.body.details ? ` (${r.body.details})` : ""}`);
      } catch (e) {
        console.error(`[TrainerDay] sync for user ${userId} failed:`, e.message);
      }
    }
  } finally {
    mirrorRunning = false;
  }
}

module.exports = {
  SCOPES,
  POWER_ZONE_PCT,
  HR_ZONE_PCT,
  isConfigured,
  isConnected,
  canReceiveWorkouts,
  connectionStatus,
  isBikeSport,
  authorizeUrl,
  signState,
  verifyState,
  exchangeCode,
  getValidAccessToken,
  disconnect,
  toWorkoutBlocks,
  buildCalendarEvent,
  pushWorkoutsToTrainerDay,
  syncTrainerDayCalendar,
  syncAllTrainerDayUsers,
  // for tests
  _takeSlot: takeSlot,
  _requestLog: requestLog,
  TrainerDayRateLimitError,
};
