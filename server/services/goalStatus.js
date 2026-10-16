/**
 * "Is my goal realistic?", answered the rooka way: training fits the athlete's
 * life, not the other way round. This never tells anyone to pick a smaller event
 * or find more hours. It says where they are, what their available time can
 * build, and what the coach focuses on to get the most out of it.
 *
 * Statuses:
 *   on_track      the estimate is at (or within 2% of) the target
 *   within_reach  2-8% away; the plan as it stands should close it
 *   ambitious     further away; the coach prioritises what moves the needle most
 *   building      no target time, or not enough data for an estimate yet
 *
 * Computed only here (the app displays it). The trends come from the activity
 * and weigh-in history, so they show from the first day.
 */
const db = require("./db");
const seasonPlan = require("./seasonPlan");
const athleteZones = require("./athleteZones");

const dbAll = (sql, params = []) => new Promise((resolve) => db.all(sql, params, (err, rows) => resolve(err || !rows ? [] : rows)));
const dbGet = (sql, params = []) => new Promise((resolve) => db.get(sql, params, (err, row) => resolve(err ? null : row || null)));

const RIEGEL_EXPONENT = 1.06;
const RUN_TYPES = new Set(["run", "virtualrun", "trailrun", "treadmill"]);
const RIDE_TYPES = new Set(["ride", "virtualride", "bike", "ebikeride", "gravelride", "mountainbikeride", "cycling"]);
const sportKey = (t) => String(t || "").toLowerCase().replace(/\s+/g, "");

/** "3:45:00", "3:45", "3h 45m", "45:30", "45 min" -> seconds. Short events read h:mm as mm:ss. */
function parseTargetSeconds(value, distanceKm = 0) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim().toLowerCase();
  if (!s) return null;
  let m = s.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
  if (m) return +m[1] * 3600 + +m[2] * 60 + +m[3];
  m = s.match(/^(\d{1,3}):(\d{2})$/);
  if (m) return distanceKm >= 21 ? +m[1] * 3600 + +m[2] * 60 : +m[1] * 60 + +m[2];
  const h = s.match(/(\d+(?:[.,]\d+)?)\s*(h|u|uur|hours?|std)/);
  const mi = s.match(/(\d+)\s*(m|min|minutes?)\b/);
  const sec = s.match(/(\d+)\s*(s|sec|seconds?)\b/);
  if (h || mi || sec) {
    return (h ? parseFloat(h[1].replace(",", ".")) * 3600 : 0) + (mi ? +mi[1] * 60 : 0) + (sec ? +sec[1] : 0);
  }
  return null;
}

// Race-time estimate (approved 2026-10-13, replacing "fastest single run"):
// - runs recorded by a watch or app (heart rate, or a Strava / Apple Health / Suunto id);
//   typed-in entries only when there is nothing else
// - plausible paces only (2:50-12:00 min/km), duplicates removed, last 8 weeks
// - runs of 0.5x-3x the race distance, so a half marathon doesn't predict a 5K
// - runs with an average heart rate in zone 3 or higher come first: those are
//   real efforts, so they predict a race best; easy runs only when there are none
// - the median of the 3 fastest Riegel predictions: a good normal day, not the best day
const ESTIMATE_WINDOW_DAYS = 56;
const MIN_PACE = 2.83;
const MAX_PACE = 12;

function zoneForHr(hr, hrZones) {
  if (!(hr > 0) || !Array.isArray(hrZones) || hrZones.length === 0) return null;
  const sorted = [...hrZones].sort((x, y) => Number(x.zone) - Number(y.zone));
  if (hr < sorted[0].min) return Number(sorted[0].zone);
  const hit = sorted.find((z) => hr >= z.min && hr <= z.max);
  if (hit) return Number(hit.zone);
  return Number(sorted[sorted.length - 1].zone);
}

/** Pure part of the estimate, so it can be tested without a database. */
function pickRaceEstimate(runs, distanceKm, hrZones) {
  const valid = runs.filter((r) => {
    if (!(r.distance_km > 0) || !(r.moving_time_min > 0)) return false;
    const pace = r.moving_time_min / r.distance_km;
    return pace >= MIN_PACE && pace <= MAX_PACE;
  });
  const recorded = valid.filter(
    (r) => (r.average_heartrate || 0) > 0 || r.strava_activity_id || r.healthkit_workout_id || r.suunto_workout_id
  );
  const pool = recorded.length ? recorded : valid;
  const lo = Math.max(3, 0.5 * distanceKm);
  const hi = 3 * distanceKm;
  let band = pool.filter((r) => r.distance_km >= lo && r.distance_km <= hi);
  if (!band.length) band = pool.filter((r) => r.distance_km >= 3);
  if (!band.length) return null;

  const hard = band.filter((r) => (zoneForHr(r.average_heartrate, hrZones) || 0) >= 3);
  const used = hard.length ? hard : band;
  const preds = used
    .map((r) => ({ r, sec: r.moving_time_min * 60 * Math.pow(distanceKm / r.distance_km, RIEGEL_EXPONENT) }))
    .sort((x, y) => x.sec - y.sec);
  const top = preds.slice(0, 3);
  const mid = top[Math.floor((top.length - 1) / 2)];
  const median = top.length % 2 === 1 ? mid.sec : (top[top.length / 2 - 1].sec + top[top.length / 2].sec) / 2;
  return {
    seconds: Math.round(median),
    basis: {
      runs: used.length,
      hardRuns: hard.length,
      fromHardRuns: hard.length > 0,
      typedIn: recorded.length === 0,
      fastest: { date: String(top[0].r.start_date || "").slice(0, 10), distanceKm: Math.round(top[0].r.distance_km * 10) / 10, minutes: Math.round(top[0].r.moving_time_min) },
    },
  };
}

// --- Proposed: best hard effort + race-day bonus (option C, not live yet) ---
// The median of the 3 fastest predictions ignored a runner's real best: an
// athlete with a 23:05 5K at Z4 was estimated at 24:26 because two slower runs
// sat in his top 3. Instead, the fastest recent run counts, when heart rate
// shows it was a genuine effort, made 2% faster for race day (rested, tapered,
// racing for a PB). A real race gets no bonus; it already was race day.
// Each week of age costs 0.5%, so a best from 5 weeks ago weighs less than
// this week's. Without a qualifying effort, the median estimate stays.
const BEST_EFFORT_WINDOW_DAYS = 42;
const BEST_EFFORT_MIN_HR_FRACTION = 0.88;
const RACE_DAY_FACTOR = 0.98;
const AGE_PENALTY_PER_WEEK = 0.005;
const RACE_NAME = /\b(race|wedstrijd|parkrun|wettkampf|carrera|competition)\b/i;

function isHardEffort(r, hrZones, maxHr) {
  const hr = r.average_heartrate || 0;
  if (!(hr > 0)) return false;
  if ((zoneForHr(hr, hrZones) || 0) >= 4) return true;
  return maxHr > 0 && hr >= BEST_EFFORT_MIN_HR_FRACTION * maxHr;
}

function pickRaceEstimateBestEffort(runs, distanceKm, hrZones, { maxHr = null, asOf } = {}) {
  const fallback = pickRaceEstimate(runs, distanceKm, hrZones);
  const lo = Math.max(3, 0.5 * distanceKm);
  const hi = 3 * distanceKm;
  const day = asOf || seasonPlan.todayStr();
  const from = seasonPlan.addDays(day, -BEST_EFFORT_WINDOW_DAYS);
  const dayMs = new Date(day + "T12:00:00Z").getTime();

  const candidates = runs
    .filter((r) => {
      if (!(r.distance_km >= lo && r.distance_km <= hi) || !(r.moving_time_min > 0)) return false;
      const pace = r.moving_time_min / r.distance_km;
      const d = String(r.start_date || "").slice(0, 10);
      return pace >= MIN_PACE && pace <= MAX_PACE && d >= from && d <= day && isHardEffort(r, hrZones, maxHr);
    })
    .map((r) => {
      const weeksAgo = Math.max(0, (dayMs - new Date(String(r.start_date).slice(0, 10) + "T12:00:00Z").getTime()) / (7 * 86400000));
      const isRace = RACE_NAME.test(String(r.name || ""));
      const riegel = r.moving_time_min * 60 * Math.pow(distanceKm / r.distance_km, RIEGEL_EXPONENT);
      return { r, isRace, weeksAgo, sec: riegel * (isRace ? 1 : RACE_DAY_FACTOR) * (1 + AGE_PENALTY_PER_WEEK * weeksAgo) };
    })
    .sort((x, y) => x.sec - y.sec);

  const best = candidates[0];
  // A best effort that comes out slower than the median of faster (Z3) runs
  // would make the estimate worse for running hard; the median stands then.
  if (!best || (fallback && fallback.seconds <= best.sec)) {
    return fallback && { ...fallback, basis: { ...fallback.basis, method: "median" } };
  }
  return {
    seconds: Math.round(best.sec),
    basis: {
      method: "best_effort",
      hardEfforts: candidates.length,
      raceDayBonus: !best.isRace,
      weeksAgo: Math.round(best.weeksAgo * 10) / 10,
      fastest: { date: String(best.r.start_date || "").slice(0, 10), distanceKm: Math.round(best.r.distance_km * 10) / 10, minutes: Math.round(best.r.moving_time_min), avgHr: Math.round(best.r.average_heartrate) },
    },
  };
}

// --- Exploratory: race time from easy (Z2) running, for athletes with no hard efforts ---
// Heart-rate reserve tracks the fraction of VO2max in use (Swain), so a steady
// easy run says how much of the engine that pace needs:
//   VO2max = 3.5 + (VO2(pace) - 3.5) / %HRR
// Daniels' VO2-at-velocity and sustainable-fraction curves then turn that VO2max
// into a race time. Very sensitive to max and resting HR, and blind to the
// speed endurance an athlete who never runs hard has not built: a ceiling, not a forecast.
function danielsVo2(vMetresPerMin) {
  return -4.6 + 0.182258 * vMetresPerMin + 0.000104 * vMetresPerMin * vMetresPerMin;
}
function danielsFraction(minutes) {
  return 0.8 + 0.1894393 * Math.exp(-0.012778 * minutes) + 0.2989558 * Math.exp(-0.1932605 * minutes);
}
/** Race time (seconds) a VO2max/VDOT predicts over distanceKm, by bisection. */
function raceSecondsFromVdot(vdot, distanceKm) {
  if (!(vdot > 0)) return null;
  const metres = distanceKm * 1000;
  let lo = 1;
  let hi = 600;
  for (let i = 0; i < 60; i++) {
    const t = (lo + hi) / 2;
    if (danielsVo2(metres / t) / danielsFraction(t) > vdot) lo = t;
    else hi = t;
  }
  return Math.round(((lo + hi) / 2) * 60);
}

function aerobicRaceEstimate(runs, distanceKm, { maxHr, restingHr } = {}) {
  if (!(maxHr > 0) || !(restingHr > 0) || maxHr <= restingHr) return null;
  const vdots = runs
    .filter((r) => r.distance_km >= 3 && r.moving_time_min >= 20 && (r.average_heartrate || 0) > 0)
    .map((r) => {
      const hrr = (r.average_heartrate - restingHr) / (maxHr - restingHr);
      if (hrr < 0.5 || hrr > 0.85) return null; // steady aerobic only; the relation breaks near max
      const v = (r.distance_km * 1000) / r.moving_time_min;
      return { r, hrr, vdot: 3.5 + (danielsVo2(v) - 3.5) / hrr };
    })
    .filter(Boolean)
    .sort((a, b) => a.vdot - b.vdot);
  if (vdots.length < 3) return null;
  // Median: hills, heat and cardiac drift scatter single runs a lot.
  const vdot = vdots[Math.floor(vdots.length / 2)].vdot;
  return { seconds: raceSecondsFromVdot(vdot, distanceKm), vdot: Math.round(vdot * 10) / 10, runs: vdots.length };
}

const TREND_WEEKS = 12;

/**
 * Today's estimate plus one per week for the last TREND_WEEKS weeks, each from
 * the runs in the 8 weeks before that day. Worked out from the activity history,
 * so the trend line is there from day one instead of building up from snapshots.
 */
async function estimateRaceSeconds(userId, distanceKm) {
  const today = seasonPlan.todayStr();
  const since = seasonPlan.addDays(today, -(ESTIMATE_WINDOW_DAYS + TREND_WEEKS * 7));
  const runs = seasonPlan.dedupeActivities(
    (await dbAll(
      `SELECT sport_type, distance_km, moving_time_min, start_date, average_heartrate, strava_activity_id, healthkit_workout_id, suunto_workout_id
       FROM activities WHERE user_id = ? AND substr(start_date, 1, 10) >= ? AND (is_hidden IS NULL OR is_hidden = 0)`,
      [userId, since]
    )).filter((a) => RUN_TYPES.has(sportKey(a.sport_type)))
  );
  const { hrZones } = await athleteZones.resolveZonesForUser(userId, "Run").catch(() => ({ hrZones: null }));
  const asOf = (day) => {
    const from = seasonPlan.addDays(day, -ESTIMATE_WINDOW_DAYS);
    return pickRaceEstimate(
      runs.filter((r) => {
        const d = String(r.start_date || "").slice(0, 10);
        return d >= from && d <= day;
      }),
      distanceKm,
      hrZones
    );
  };
  const current = asOf(today);
  if (!current) return null;
  const trend = [];
  for (let w = TREND_WEEKS; w >= 1; w--) {
    const day = seasonPlan.addDays(today, -7 * w);
    const e = asOf(day);
    if (e) trend.push({ date: day, value: e.seconds });
  }
  trend.push({ date: today, value: current.seconds });
  return { ...current, trend };
}

async function longestRecent(userId, types, field, days = 28) {
  const since = seasonPlan.addDays(seasonPlan.todayStr(), -days);
  const rows = await dbAll(
    `SELECT sport_type, ${field} AS v FROM activities WHERE user_id = ? AND substr(start_date, 1, 10) >= ? AND (is_hidden IS NULL OR is_hidden = 0)`,
    [userId, since]
  );
  return rows.filter((r) => types.has(sportKey(r.sport_type))).reduce((m, r) => Math.max(m, r.v || 0), 0);
}


function statusFromGap(gapPct) {
  if (gapPct <= 0.02) return "on_track";
  if (gapPct <= 0.08) return "within_reach";
  return "ambitious";
}

/** Status for the main race goal, using the season plan's event type and flags. */
async function getRaceStatus(userId, season) {
  if (!season) return null;
  const goal = await seasonPlan.getMainRaceGoal(userId);
  if (!goal) return null;
  const cfg = seasonPlan.EVENT_TYPES[season.eventType] || seasonPlan.EVENT_TYPES.other;
  // Compare against what the race usually builds to (or the athlete's availability cap if
  // lower), not the plan's own peak: a low-volume plan can peak below what they've already done.
  const limits = season.flags?.longLimitedBy || [];
  const peakLongs = cfg.long.map((l) => {
    const lim = limits.find((x) => x.sport === l.sport);
    return { sport: l.sport, unit: l.unit, value: lim ? Math.min(l.peak, lim.cap) : l.peak };
  });

  // Long-session readiness: what was done in the last 4 weeks vs the plan's peak.
  const readiness = [];
  for (const l of peakLongs) {
    if (!l.value) continue;
    let done = 0;
    if (l.sport === "Run") done = await longestRecent(userId, RUN_TYPES, "distance_km");
    else if (l.sport === "Bike") done = await longestRecent(userId, RIDE_TYPES, "moving_time_min");
    else done = await longestRecent(userId, new Set([...RUN_TYPES, ...RIDE_TYPES, "swim", "weighttraining", "workout"]), "moving_time_min");
    readiness.push({ sport: l.sport, unit: l.unit, done: Math.round(done * (l.unit === "km" ? 10 : 1)) / (l.unit === "km" ? 10 : 1), peak: l.value });
  }

  // Consistency: past plan weeks that reached at least 80% of their target.
  const past = season.weeks.filter((w) => w.isPast && w.volume > 0);
  const consistency = past.length
    ? { weeksOnTarget: past.filter((w) => (w.actualVolume || 0) >= w.volume * 0.8).length, weeks: past.length }
    : null;

  const base = {
    kind: "race",
    eventType: season.eventType,
    raceName: season.raceName,
    raceDate: season.raceDate,
    daysToRace: season.daysToRace,
    timeLimited: Boolean(season.flags?.timeLimited),
    longLimitedBy: season.flags?.longLimitedBy || [],
    shortBuild: Boolean(season.flags?.shortBuild),
    readiness,
    consistency,
  };

  const targetSec = goal.target_mode === "time" ? parseTargetSeconds(goal.target_value, cfg.distanceKm || 0) : null;
  if (cfg.distanceKm) {
    const est = await estimateRaceSeconds(userId, cfg.distanceKm);
    const trend = est ? est.trend.map((p) => ({ ...p, target: targetSec })) : [];
    if (est && targetSec) {
      const gapPct = (est.seconds - targetSec) / targetSec;
      return { ...base, status: statusFromGap(gapPct), estimateSec: est.seconds, targetSec, gapSec: est.seconds - targetSec, basis: est.basis, trend };
    }
    return { ...base, status: "building", estimateSec: est ? est.seconds : null, targetSec, basis: est ? est.basis : null, trend };
  }
  return { ...base, status: "building", estimateSec: null, targetSec, trend: [] };
}

/** Status for a body-weight goal: the trend needed against the trend so far. */
async function getBodyStatus(userId) {
  const goal = await dbGet(
    `SELECT name, date, target_weight FROM milestones WHERE user_id = ? AND goal_type = 'physiological' AND target_weight IS NOT NULL ORDER BY is_main DESC, date ASC LIMIT 1`,
    [userId]
  );
  if (!goal || !goal.target_weight) return null;
  const rows = await dbAll(
    `SELECT date, weight_kg FROM biometrics WHERE user_id = ? AND weight_kg IS NOT NULL AND date >= ? ORDER BY date ASC`,
    [userId, seasonPlan.addDays(seasonPlan.todayStr(), -35)]
  );
  const base = { kind: "body", goalName: goal.name, goalDate: goal.date, targetKg: goal.target_weight };
  if (rows.length === 0) return { ...base, status: "building", currentKg: null, trend: [] };

  const current = rows[rows.length - 1].weight_kg;
  // The athlete's own weigh-ins over the last 12 weeks (one per day), not page-view snapshots.
  const trend = (await dbAll(
    `SELECT date, weight_kg AS value FROM biometrics WHERE user_id = ? AND weight_kg IS NOT NULL AND date >= ? ORDER BY date ASC`,
    [userId, seasonPlan.addDays(seasonPlan.todayStr(), -84)]
  )).map((r) => ({ date: String(r.date).slice(0, 10), value: r.value, target: goal.target_weight }));

  // Least-squares slope in kg/week over the last 5 weeks.
  let ratePerWeek = null;
  if (rows.length >= 3) {
    const t0 = new Date(rows[0].date + "T12:00:00Z").getTime();
    const xs = rows.map((r) => (new Date(r.date + "T12:00:00Z").getTime() - t0) / (7 * 86400000));
    const ys = rows.map((r) => r.weight_kg);
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
    const my = ys.reduce((a, b) => a + b, 0) / ys.length;
    const den = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
    if (den > 0) ratePerWeek = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / den;
  }

  const weeksLeft = goal.date
    ? Math.max(0.5, (new Date(String(goal.date).slice(0, 10) + "T12:00:00Z") - new Date(seasonPlan.todayStr() + "T12:00:00Z")) / (7 * 86400000))
    : null;
  const toGo = goal.target_weight - current; // negative = lose weight
  const neededPerWeek = weeksLeft ? toGo / weeksLeft : null;

  let status = "building";
  if (Math.abs(toGo) < 0.3) status = "on_track";
  else if (neededPerWeek !== null && ratePerWeek !== null) {
    const sameDirection = Math.sign(ratePerWeek) === Math.sign(neededPerWeek);
    const achieved = sameDirection ? Math.abs(ratePerWeek) / Math.abs(neededPerWeek) : 0;
    // More than ~1% of body weight a week isn't healthy; call that ambitious whatever the trend.
    const tooFast = Math.abs(neededPerWeek) > current * 0.01;
    status = tooFast ? "ambitious" : achieved >= 0.9 ? "on_track" : achieved >= 0.5 ? "within_reach" : "ambitious";
  }
  return {
    ...base,
    status,
    currentKg: Math.round(current * 10) / 10,
    ratePerWeek: ratePerWeek === null ? null : Math.round(ratePerWeek * 100) / 100,
    neededPerWeek: neededPerWeek === null ? null : Math.round(neededPerWeek * 100) / 100,
    trend,
  };
}

module.exports = {
  getRaceStatus,
  getBodyStatus,
  parseTargetSeconds,
  estimateRaceSeconds,
  pickRaceEstimate,
  pickRaceEstimateBestEffort,
  aerobicRaceEstimate,
  raceSecondsFromVdot,
  zoneForHr,
  statusFromGap,
};
