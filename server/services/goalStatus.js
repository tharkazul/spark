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
 * Computed only here (the app displays it), with one snapshot a day so the Goal
 * page can draw the estimate over time against the target.
 */
const db = require("./db");
const seasonPlan = require("./seasonPlan");

const dbAll = (sql, params = []) => new Promise((resolve) => db.all(sql, params, (err, rows) => resolve(err || !rows ? [] : rows)));
const dbGet = (sql, params = []) => new Promise((resolve) => db.get(sql, params, (err, row) => resolve(err ? null : row || null)));
const dbRun = (sql, params = []) => new Promise((resolve) => db.run(sql, params, () => resolve()));

db.run(`CREATE TABLE IF NOT EXISTS goal_snapshots (
  user_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  kind TEXT NOT NULL,
  value REAL,
  target REAL,
  PRIMARY KEY (user_id, date, kind)
)`);

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

/** Riegel race-time estimate from the athlete's best recent runs (last 6 weeks). */
async function estimateRaceSeconds(userId, distanceKm) {
  const since = seasonPlan.addDays(seasonPlan.todayStr(), -42);
  const runs = (await dbAll(
    `SELECT sport_type, distance_km, moving_time_min FROM activities
     WHERE user_id = ? AND substr(start_date, 1, 10) >= ? AND (is_hidden IS NULL OR is_hidden = 0)`,
    [userId, since]
  )).filter((a) => RUN_TYPES.has(sportKey(a.sport_type)));
  // Very short runs extrapolate badly to long races.
  const minKm = Math.max(3, distanceKm * 0.15);
  let best = null;
  let basis = null;
  for (const r of runs) {
    if (!(r.distance_km >= minKm) || !(r.moving_time_min > 0)) continue;
    const pred = r.moving_time_min * 60 * Math.pow(distanceKm / r.distance_km, RIEGEL_EXPONENT);
    if (best === null || pred < best) {
      best = pred;
      basis = { distanceKm: Math.round(r.distance_km * 10) / 10, minutes: Math.round(r.moving_time_min) };
    }
  }
  return best === null ? null : { seconds: Math.round(best), basis };
}

async function longestRecent(userId, types, field, days = 28) {
  const since = seasonPlan.addDays(seasonPlan.todayStr(), -days);
  const rows = await dbAll(
    `SELECT sport_type, ${field} AS v FROM activities WHERE user_id = ? AND substr(start_date, 1, 10) >= ? AND (is_hidden IS NULL OR is_hidden = 0)`,
    [userId, since]
  );
  return rows.filter((r) => types.has(sportKey(r.sport_type))).reduce((m, r) => Math.max(m, r.v || 0), 0);
}

async function snapshot(userId, kind, value, target) {
  if (value === null || value === undefined) return;
  await dbRun(
    `INSERT OR REPLACE INTO goal_snapshots (user_id, date, kind, value, target) VALUES (?, ?, ?, ?, ?)`,
    [userId, seasonPlan.todayStr(), kind, value, target ?? null]
  );
}

async function history(userId, kind) {
  return dbAll(
    `SELECT date, value, target FROM goal_snapshots WHERE user_id = ? AND kind = ? AND date >= ? ORDER BY date ASC`,
    [userId, kind, seasonPlan.addDays(seasonPlan.todayStr(), -180)]
  );
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
    if (est) await snapshot(userId, "race_estimate_sec", est.seconds, targetSec);
    const trend = await history(userId, "race_estimate_sec");
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
  await snapshot(userId, "weight_kg", current, goal.target_weight);
  const trend = await history(userId, "weight_kg");

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

module.exports = { getRaceStatus, getBodyStatus, parseTargetSeconds, estimateRaceSeconds, statusFromGap };
