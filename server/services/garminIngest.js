/**
 * Garmin Connect Developer Program pushes (Activity API and Health API; Starter
 * access: push only, no backfill). Workouts land in activities and daily health in
 * biometrics, the same places Strava and Apple Health data go.
 *
 * Garmin POSTs each summary type to its own URL; routes/garmin.js answers 200 first,
 * as Garmin requires, and then hands the body to a handler here. Every summary names
 * the Garmin user, and garmin_tokens.garmin_user_id maps it to the rooka account.
 * Summaries for an unknown or deleted account, or for an athlete whose Garmin
 * permissions leave out that export, are dropped. One athlete's summaries are
 * processed one at a time, so the activity summary and its details can't both insert.
 *
 * Activities: an activity summary and its activity details (samples and laps) come as
 * two pushes, in either order. Both carry Garmin Connect's activity id, kept in
 * activities.garmin_activity_id. The first one creates the workout, or merges it into
 * the athlete's Strava / Apple Health copy (services/activityMerge.js); later ones
 * update it. Details add average power, laps and the route. A new workout gets the
 * same follow-up as a Strava upload: rooka total, app refresh, coach reaction (only
 * with AI consent).
 *
 * Health: dailies, sleeps, body composition and user metrics (VO2 max) fill the
 * biometrics columns Apple Health fills, per calendar day, so readiness and the
 * recovery views read them unchanged. HRV gets its own column (hrv_rmssd): Garmin's
 * overnight RMSSD and Apple's SDNN are different measures. Garmin resends a summary when it has newer
 * data for the same period; the newer values replace the older ones.
 *
 * Nothing here writes the coach's AI-written memory (athlete_facts,
 * users.long_term_memory): Garmin's license (§15.11) forbids building an AI-generated
 * knowledge base from Garmin data. The one metric written is resting HR, the same
 * code-computed 7-day average Apple Health's sync stores, so the zones use the current
 * value; no AI is involved in producing it.
 */
const db = require("./db");
const activityMerge = require("./activityMerge");
const athleteFacts = require("./athleteFacts");
const { hasAiConsent } = require("./aiConsent");

// The steps every import ends with, loaded when first needed (services/utils pulls in
// the AI and push modules) and replaceable in tests.
const deps = {
  utils: () => require("./utils"),
  sendSSEEvent: (...args) => require("./sse").sendSSEEvent(...args),
};

// A coach reaction says "you just did this": not for a workout from days ago that
// arrives when the watch finally syncs.
const ANALYSIS_WINDOW_MS = 48 * 3600 * 1000;
// Samples are valid until the next one; a longer gap is a pause, not more of the same.
const SAMPLE_GAP_CAP_SEC = 30;
const MAX_ROUTE_POINTS = 500;

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

const num = (v) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const pos = (v) => (num(v) > 0 ? num(v) : null);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The day on the athlete's watch at that moment: UTC seconds plus Garmin's display offset. */
function localDate(utcSec, offsetSec) {
  if (num(utcSec) === null) return null;
  return new Date((num(utcSec) + (num(offsetSec) || 0)) * 1000).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Who a push is for
// ---------------------------------------------------------------------------

function parsePermissions(json) {
  try {
    const list = JSON.parse(json || "null");
    return Array.isArray(list) ? list : null;
  } catch (_) {
    return null;
  }
}

// Unknown permissions (Garmin didn't answer at connect) count as granted: Garmin only
// pushes what the athlete shares.
function permitted(permissionsJson, permission) {
  const list = parsePermissions(permissionsJson);
  return !list || list.includes(permission);
}

function accountsFor(garminUserId) {
  return dbAll(
    `SELECT t.user_id, t.permissions FROM garmin_tokens t JOIN users u ON u.id = t.user_id
      WHERE t.garmin_user_id = ? AND u.deleted_at IS NULL`,
    [String(garminUserId)],
  );
}

const queues = new Map();

/** Runs `task` after this athlete's earlier Garmin work, so two pushes never interleave. */
function serialized(userId, task) {
  const next = (queues.get(userId) || Promise.resolve()).then(task);
  const tail = next.catch(() => {});
  queues.set(userId, tail);
  tail.then(() => {
    if (queues.get(userId) === tail) queues.delete(userId);
  });
  return next;
}

/**
 * A webhook handler for one summary type: { [listKey]: [{ userId, ... }] }. Returns how
 * many summaries were stored.
 */
function pushHandler(listKey, permission, handleOne) {
  return async (body) => {
    const list = Array.isArray(body && body[listKey]) ? body[listKey] : [];
    const lookups = new Map();
    let stored = 0;
    for (const item of list) {
      if (!item || !item.userId) continue;
      const garminUserId = String(item.userId);
      if (!lookups.has(garminUserId)) lookups.set(garminUserId, accountsFor(garminUserId));
      for (const account of await lookups.get(garminUserId)) {
        if (!permitted(account.permissions, permission)) continue;
        try {
          if (await serialized(account.user_id, () => handleOne(account.user_id, item))) stored++;
        } catch (e) {
          console.error(`[Garmin] ${listKey} ${item.summaryId || ""} for user ${account.user_id} failed:`, e.message);
        }
      }
    }
    return stored;
  };
}

// ---------------------------------------------------------------------------
// Activities
// ---------------------------------------------------------------------------

const MOBILITY = new Set(["YOGA", "PILATES", "MOBILITY", "BREATHWORK", "MEDITATION"]);
const STRENGTH = new Set(["STRENGTH_TRAINING", "BOULDERING", "INDOOR_CLIMBING", "ROCK_CLIMBING"]);
const WALK = new Set(["MOUNTAINEERING", "SNOW_SHOE_WS"]);

/** rooka's sport for a Garmin activity type (Activity API appendix A). */
function garminSport(type) {
  const t = String(type || "").toUpperCase();
  if (/SWIM/.test(t)) return "Swim";
  if (/RUN/.test(t) && !/WHEELCHAIR/.test(t)) return "Run";
  if (/CYCL|BIK|RIDE|MTB|BMX/.test(t)) return "Bike";
  if (/WALK|HIK|RUCK/.test(t) || WALK.has(t)) return "Walk";
  if (STRENGTH.has(t)) return "Strength";
  if (MOBILITY.has(t)) return "Mobility";
  return "Cardio";
}

/** "TRAIL_RUNNING" -> "Trail Running", for an activity without a name. */
function typeLabel(type) {
  return String(type || "Workout")
    .replace(/_(V2|WS)$/i, "")
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

function cleanDevice(name) {
  const s = String(name || "").trim();
  return s && s.toLowerCase() !== "unknown" ? s.slice(0, 80) : null;
}

/** Samples in time order, each with the seconds it stands for (until the next one, capped). */
function timedSamples(samples) {
  const list = (Array.isArray(samples) ? samples : [])
    .filter((s) => s && num(s.startTimeInSeconds) !== null)
    .sort((a, b) => a.startTimeInSeconds - b.startTimeInSeconds);
  return list.map((s, i) => ({
    ...s,
    t: num(s.startTimeInSeconds),
    w: i + 1 < list.length ? Math.min(list[i + 1].startTimeInSeconds - s.startTimeInSeconds, SAMPLE_GAP_CAP_SEC) : 1,
  }));
}

function weightedMean(samples, field) {
  let sum = 0;
  let weight = 0;
  for (const s of samples) {
    const v = num(s[field]);
    if (v === null || s.w <= 0) continue;
    sum += v * s.w;
    weight += s.w;
  }
  return weight > 0 ? sum / weight : null;
}

function maxOf(samples, field) {
  return samples.reduce((max, s) => (pos(s[field]) !== null && (max === null || pos(s[field]) > max) ? pos(s[field]) : max), null);
}

/** The last value of a running total at or before time t (0 before the first sample). */
function runningAt(samples, field, t) {
  let value = null;
  for (const s of samples) {
    if (s.t > t) break;
    if (num(s[field]) !== null) value = num(s[field]);
  }
  return value === null ? 0 : value;
}

/**
 * Laps in the shape Strava laps are stored in (laps_json), from the lap start times and
 * samples of the activity details; "[]" when there aren't two laps (stored all the same,
 * like Strava's, so the row counts as having its details).
 */
function lapsJson(samples, laps, endSec) {
  const starts = (Array.isArray(laps) ? laps : [])
    .map((l) => num(l && l.startTimeInSeconds))
    .filter((v) => v !== null)
    .sort((a, b) => a - b);
  if (starts.length < 2 || !samples.length) return "[]";
  const hasMoving = samples.some((s) => num(s.movingDurationInSeconds) !== null);
  return JSON.stringify(
    starts.map((start, i) => {
      const end = i + 1 < starts.length ? starts[i + 1] : Math.max(endSec || 0, start);
      const inLap = samples.filter((s) => s.t >= start && s.t < end);
      const distance = Math.max(0, runningAt(samples, "totalDistanceInMeters", end) - runningAt(samples, "totalDistanceInMeters", start));
      const elapsed = end - start;
      const moving = hasMoving
        ? Math.max(0, runningAt(samples, "movingDurationInSeconds", end) - runningAt(samples, "movingDurationInSeconds", start))
        : elapsed;
      const hr = weightedMean(inLap, "heartRate");
      return {
        lap_index: i + 1,
        distance: Math.round(distance * 10) / 10,
        elapsed_time: elapsed,
        moving_time: moving,
        average_speed: moving > 0 ? Math.round((distance / moving) * 1000) / 1000 : null,
        average_heartrate: hr === null ? null : Math.round(hr),
        max_heartrate: maxOf(inLap, "heartRate"),
      };
    }),
  );
}

/** Google's encoded polyline (precision 5), the format the app decodes for the map. */
function encodePolyline(points) {
  const enc = (value) => {
    let v = value < 0 ? ~(value << 1) : value << 1;
    let out = "";
    while (v >= 0x20) {
      out += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
      v >>= 5;
    }
    return out + String.fromCharCode(v + 63);
  };
  let prevLat = 0;
  let prevLng = 0;
  let out = "";
  for (const [lat, lng] of points) {
    const la = Math.round(lat * 1e5);
    const ln = Math.round(lng * 1e5);
    out += enc(la - prevLat) + enc(ln - prevLng);
    prevLat = la;
    prevLng = ln;
  }
  return out;
}

function routePolyline(samples) {
  const points = samples
    .filter((s) => num(s.latitudeInDegree) !== null && num(s.longitudeInDegree) !== null)
    .map((s) => [num(s.latitudeInDegree), num(s.longitudeInDegree)]);
  if (points.length < 2) return null;
  const step = Math.ceil(points.length / MAX_ROUTE_POINTS);
  const kept = points.filter((_, i) => i % step === 0);
  if (kept[kept.length - 1] !== points[points.length - 1]) kept.push(points[points.length - 1]);
  return encodePolyline(kept);
}

/**
 * The workout in one push: an activity summary, or an activity details record (its
 * summary plus samples and laps). Fields the push doesn't carry stay undefined, so an
 * update only touches what it knows. Null when it isn't a workout to keep.
 */
function parseActivity(item, { details }) {
  const s = details ? item.summary || {} : item;
  const activityId = item.activityId ?? s.activityId ?? (item.summaryId ? String(item.summaryId).replace(/-detail$/, "") : null);
  const start = num(s.startTimeInSeconds ?? item.startTimeInSeconds);
  if (activityId === null || activityId === undefined || start === null) return null;
  const type = String(s.activityType || item.activityType || "").toUpperCase();
  // A multisport parent repeats its legs, which come as their own activities; the
  // transitions between legs are not workouts.
  if (s.isParent === true || item.isParent === true || /TRANSITION/.test(type)) return null;

  const offset = num(s.startTimeOffsetInSeconds ?? item.startTimeOffsetInSeconds) || 0;
  const durationSec = num(s.durationInSeconds);
  const distanceM = num(s.distanceInMeters);
  const a = {
    activityId: String(activityId),
    startSec: start,
    startIso: new Date(start * 1000).toISOString(),
    localStart: new Date((start + offset) * 1000).toISOString().slice(0, 19),
    // Left out when the push doesn't say, so an update never swaps a title for a generated one.
    name: s.activityName || item.activityName ? String(s.activityName || item.activityName).slice(0, 200) : undefined,
    sport_type: type ? garminSport(type) : undefined,
    fallbackName: typeLabel(type),
    moving_time_min: durationSec === null ? undefined : durationSec / 60,
    distance_km: distanceM === null ? undefined : distanceM / 1000,
    elevation_m: num(s.totalElevationGainInMeters) === null ? null : Math.round(num(s.totalElevationGainInMeters)),
    average_heartrate: pos(s.averageHeartRateInBeatsPerMinute),
    max_heartrate: pos(s.maxHeartRateInBeatsPerMinute),
    garmin_device: cleanDevice(s.deviceName || item.deviceName),
  };
  if (details) {
    const samples = timedSamples(item.samples);
    const watts = weightedMean(samples, "powerInWatts");
    a.average_watts = watts === null ? null : Math.round(watts);
    if (a.average_heartrate === null) {
      const hr = weightedMean(samples, "heartRate");
      a.average_heartrate = hr === null ? null : Math.round(hr);
    }
    if (a.max_heartrate === null) a.max_heartrate = maxOf(samples, "heartRate");
    const last = samples.length ? samples[samples.length - 1].t + 1 : 0;
    a.laps_json = lapsJson(samples, item.laps, Math.max(start + (durationSec || 0), last));
    a.polyline = routePolyline(samples);
  }
  return a;
}

/** rooka points like every other import: the athlete's own zones, from their rooka start date. */
async function scoreFor(userId, { startIso, moving_time_min, average_heartrate, average_watts, sport_type }) {
  const user = await dbGet(`SELECT rooka_start_date FROM users WHERE id = ?`, [userId]);
  const startDay = user && user.rooka_start_date ? user.rooka_start_date.substring(0, 10) : null;
  if (startDay && String(startIso).substring(0, 10) < startDay) return 0;
  return deps.utils().calculateRookaScoreZoned({
    userId,
    movingTimeMin: moving_time_min,
    avgHr: average_heartrate || undefined,
    avgWatts: average_watts || undefined,
    sport: sport_type,
  });
}

const tssFor = (movingMin) => Math.round(((movingMin || 0) / 60) * 50);

// Columns a Garmin push can fill on its own workout.
const ACTIVITY_FIELDS = [
  "name",
  "sport_type",
  "distance_km",
  "elevation_m",
  "moving_time_min",
  "average_heartrate",
  "max_heartrate",
  "average_watts",
  "laps_json",
  "polyline",
  "garmin_device",
];

async function updateActivity(id, fields) {
  const cols = Object.keys(fields);
  if (!cols.length) return;
  await dbRun(`UPDATE activities SET ${cols.map((c) => `${c} = ?`).join(", ")} WHERE id = ?`, [...cols.map((c) => fields[c]), id]);
}

/** A newer push for a workout already stored from Garmin. */
async function updateOwnActivity(userId, row, a) {
  // Strava or Suunto brought the title and times: Garmin only fills what they lack.
  if (row.strava_activity_id || row.suunto_workout_id) {
    const incoming = { source: "garmin", sourceId: a.activityId, start_date: a.startIso };
    for (const c of ACTIVITY_FIELDS) if (a[c] !== undefined) incoming[c] = a[c];
    const fields = activityMerge.mergedFields(row, incoming);
    delete fields.rooka_score; // keeps the leading source's score
    delete fields.tss;
    await updateActivity(row.id, fields);
    return;
  }
  // Garmin leads this workout: its newer data replaces its older data.
  const fields = {};
  for (const c of ACTIVITY_FIELDS) if (a[c] !== undefined && a[c] !== null) fields[c] = a[c];
  const merged = { ...row, ...fields };
  fields.rooka_score = await scoreFor(userId, { ...merged, startIso: row.start_date });
  fields.tss = tssFor(merged.moving_time_min);
  await updateActivity(row.id, fields);
}

async function insertActivity(userId, a) {
  const row = {
    user_id: userId,
    garmin_activity_id: a.activityId,
    start_date: a.startIso,
    name: a.fallbackName,
    sport_type: "Cardio",
    distance_km: 0,
    moving_time_min: 0,
  };
  for (const c of ACTIVITY_FIELDS) if (a[c] !== undefined) row[c] = a[c];
  row.rooka_score = a.rooka_score;
  row.tss = a.tss;
  const cols = Object.keys(row);
  const res = await dbRun(
    `INSERT INTO activities (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`,
    cols.map((c) => row[c]),
  );
  return res.lastID;
}

/** What Strava's webhook does after storing a workout: rooka total, app refresh, coach reaction. */
async function afterImport(userId, id, { created, localStart }) {
  const utils = deps.utils();
  utils.updateUserRookaAndCheckLevel(userId, { isRealtime: true });
  deps.sendSSEEvent(userId, "sync_complete", { provider: "garmin", activityId: id });
  if (!created) return;
  const row = await dbGet(`SELECT * FROM activities WHERE id = ?`, [id]);
  if (!row || row.coach_analyzed === 1) return;
  if (Date.now() - Date.parse(row.start_date) > ANALYSIS_WINDOW_MS) return;
  if (!(await hasAiConsent(userId))) return;
  // Not awaited: the AI call takes a while and the athlete's next push shouldn't wait for it.
  Promise.resolve(utils.processActivityCoachAnalysis(userId, { ...row, start_date_local: localStart }, { isRealtime: true })).catch((e) =>
    console.error(`[Garmin] coach analysis for activity ${id} failed:`, e.message),
  );
}

async function importActivity(userId, item, opts) {
  const a = parseActivity(item, opts);
  if (!a) return false;
  const own = await dbGet(`SELECT * FROM activities WHERE user_id = ? AND garmin_activity_id = ?`, [userId, a.activityId]);
  // An edit made on the Connect website: it updates a workout we have, never adds one
  // (its id may not be the activity's, and a new manual activity comes as an activity).
  if (!own && opts.editOnly) return false;
  if (own) {
    // Linked into another workout by the athlete: that one carries it now.
    if (own.is_hidden) return false;
    await updateOwnActivity(userId, own, a);
    await afterImport(userId, own.id, { created: false });
    return true;
  }

  a.rooka_score = await scoreFor(userId, { ...a, sport_type: a.sport_type || "Cardio" });
  a.tss = tssFor(a.moving_time_min);
  const incoming = { source: "garmin", sourceId: a.activityId, start_date: a.startIso, rooka_score: a.rooka_score, tss: a.tss };
  for (const c of ACTIVITY_FIELDS) if (a[c] !== undefined) incoming[c] = a[c];
  incoming.name = incoming.name || a.fallbackName;
  incoming.sport_type = incoming.sport_type || "Cardio";
  // Already here from Strava or Apple Health (Garmin Connect uploads to both): merge, don't duplicate.
  const id = (await activityMerge.absorbIfDuplicate(userId, incoming)) || (await insertActivity(userId, a));
  await afterImport(userId, id, { created: true, localStart: a.localStart });
  return true;
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

const BIOMETRIC_COLUMNS = new Set([
  "resting_hr",
  "avg_hr",
  "hrv_sdnn",
  "hrv_rmssd",
  "sleep_minutes",
  "sleep_deep_minutes",
  "sleep_rem_minutes",
  "sleep_core_minutes",
  "sleep_awake_minutes",
  "steps",
  "active_calories",
  "vo2_max",
  "weight_kg",
  "body_fat_percent",
  "bmi",
]);

/** Writes the given values into the athlete's biometrics row for that day; newer values replace older ones. */
async function saveBiometrics(userId, date, values) {
  if (!date || !DATE_RE.test(date)) return false;
  const cols = Object.keys(values).filter((c) => BIOMETRIC_COLUMNS.has(c) && num(values[c]) !== null);
  if (!cols.length) return false;
  await dbRun(
    `INSERT INTO biometrics (user_id, date, ${cols.join(", ")}, from_garmin) VALUES (?, ?, ${cols.map(() => "?").join(", ")}, 1)
     ON CONFLICT(user_id, date) DO UPDATE SET ${cols.map((c) => `${c} = excluded.${c}`).join(", ")}, from_garmin = 1`,
    [userId, date, ...cols.map((c) => num(values[c]))],
  );
  return true;
}

const minutes = (sec) => (pos(sec) === null ? null : Math.round(pos(sec) / 60));

async function importDaily(userId, d) {
  // averageHeartRateInBeatsPerMinute is a 7-day average; the day's own comes from its samples.
  const samples = Object.values(d.timeOffsetHeartRateSamples || {}).map(pos).filter((v) => v !== null);
  const restingHr = pos(d.restingHeartRateInBeatsPerMinute);
  const saved = await saveBiometrics(userId, d.calendarDate || localDate(d.startTimeInSeconds, d.startTimeOffsetInSeconds), {
    steps: num(d.steps),
    active_calories: num(d.activeKilocalories),
    resting_hr: restingHr,
    avg_hr: samples.length ? Math.round(samples.reduce((x, y) => x + y, 0) / samples.length) : null,
  });
  if (saved && restingHr !== null) await updateRestingHrBaseline(userId);
  return saved;
}

/** The rule Apple Health's sync uses: once 3 of the last 7 days have a resting HR, their average is the baseline. */
async function updateRestingHrBaseline(userId) {
  const row = await dbGet(
    `SELECT AVG(resting_hr) AS rhr, COUNT(resting_hr) AS n FROM biometrics WHERE user_id = ? AND resting_hr > 0 AND date >= date('now', '-7 days')`,
    [userId],
  );
  if (row && row.n >= 3) await athleteFacts.setMetric(userId, "resting_hr", String(Math.round(row.rhr)), "garmin").catch(() => {});
}

function importSleep(userId, s) {
  const end = num(s.startTimeInSeconds) === null ? null : num(s.startTimeInSeconds) + (num(s.durationInSeconds) || 0);
  return saveBiometrics(userId, s.calendarDate || localDate(end, s.startTimeOffsetInSeconds), {
    // Garmin's sleep duration leaves out the time awake, like Apple Health's asleep time.
    sleep_minutes: minutes(s.durationInSeconds),
    sleep_deep_minutes: minutes(s.deepSleepDurationInSeconds),
    sleep_rem_minutes: minutes(s.remSleepInSeconds),
    sleep_core_minutes: minutes(s.lightSleepDurationInSeconds),
    sleep_awake_minutes: minutes(s.awakeDurationInSeconds),
  });
}

function importHrv(userId, h) {
  // Garmin's overnight HRV is RMSSD, not Apple's SDNN: its own column, judged against the
  // athlete's own Garmin nights (assessHrv in the app).
  return saveBiometrics(userId, h.calendarDate || localDate(h.startTimeInSeconds, h.startTimeOffsetInSeconds), {
    hrv_rmssd: pos(h.lastNightAvg),
  });
}

function importBodyComp(userId, b) {
  const kg = pos(b.weightInGrams);
  return saveBiometrics(userId, localDate(b.measurementTimeInSeconds, b.measurementTimeOffsetInSeconds), {
    weight_kg: kg === null ? null : Math.round(kg / 100) / 10,
    body_fat_percent: pos(b.bodyFatInPercent),
    bmi: pos(b.bodyMassIndex),
  });
}

function importUserMetrics(userId, m) {
  return saveBiometrics(userId, m.calendarDate, { vo2_max: pos(m.vo2Max) ?? pos(m.vo2MaxCycling) });
}

// ---------------------------------------------------------------------------
// Handlers, by webhook kind (routes/garmin.js)
// ---------------------------------------------------------------------------

const handlers = {
  activities: pushHandler("activities", "ACTIVITY_EXPORT", (u, item) => importActivity(u, item, { details: false })),
  "manually-updated-activities": pushHandler("manuallyUpdatedActivities", "ACTIVITY_EXPORT", (u, item) =>
    importActivity(u, item, { details: false, editOnly: true }),
  ),
  "activity-details": pushHandler("activityDetails", "ACTIVITY_EXPORT", (u, item) => importActivity(u, item, { details: true })),
  dailies: pushHandler("dailies", "HEALTH_EXPORT", importDaily),
  sleeps: pushHandler("sleeps", "HEALTH_EXPORT", importSleep),
  hrv: pushHandler("hrv", "HEALTH_EXPORT", importHrv),
  "body-comps": pushHandler("bodyComps", "HEALTH_EXPORT", importBodyComp),
  "user-metrics": pushHandler("userMetrics", "HEALTH_EXPORT", importUserMetrics),
};

/**
 * "Garmin <device model>" for a workout with Garmin data in it, "Garmin" when the
 * model is unknown, null otherwise. Garmin's brand rules want it next to the title of
 * every view of Garmin data (list, detail, feed), also when another source merged in.
 */
function garminAttribution(row) {
  if (!row || !row.garmin_activity_id) return null;
  const device = cleanDevice(row.garmin_device);
  if (!device) return "Garmin";
  return /^garmin\b/i.test(device) ? device : `Garmin ${device}`;
}

/** Settled once every queued push has been processed (for tests). */
async function idle() {
  while (queues.size) await Promise.all([...queues.values()]);
}

module.exports = {
  handlers,
  garminAttribution,
  // exported for tests
  deps,
  idle,
  garminSport,
  parseActivity,
  encodePolyline,
};
