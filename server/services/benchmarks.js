/**
 * Closes pending benchmark tests once the athlete has done them.
 *
 * Onboarding registers a benchmark (e.g. "5k Pace & HR Baseline Test") with
 * completed_at NULL and status "Pending Completion". Activities arrive from
 * Strava, Garmin, Suunto, Apple Health and manual logs, so instead of hooking
 * every import, reconcilePendingBenchmarks() looks for the activity that did
 * the test and records its numbers.
 *
 * A pending test is done by the earliest visible activity of the same sport
 * family, on or after the day the test was registered, that is either
 *   1. named after the test (a workout pushed to the watch keeps its title), or
 *   2. on a day whose plan held the benchmark session ("Benchmark Assessment: …").
 * Name matches win over plan-day matches, so an easy run on the planned day
 * does not steal a test done later.
 *
 * The numbers are the test's own, not the whole activity's: a "5k" test is
 * measured over the laps that make up those 5 km, so a warm-up, strides or an
 * hour of walking beforehand don't water down its pace and heart rate. Without
 * such laps, Strava's best effort for the distance gives the time (it carries no
 * heart rate), and only then does the whole activity stand in. Completed tests
 * are measured again when the activity's laps arrive later.
 */
const db = require("./db");
const { sportFamily } = require("./activityMerge");

const all = (sql, params) => new Promise((resolve) => db.all(sql, params, (err, rows) => resolve(err ? [] : rows || [])));
const run = (sql, params) => new Promise((resolve) => db.run(sql, params, (err) => resolve(!err)));

const ACTIVITY_COLUMNS =
  "id, name, sport_type, distance_km, moving_time_min, average_heartrate, max_heartrate, average_watts, start_date, laps_json, sets_json";

const MIN_MINUTES = 12; // a warm-up jog or a commute is not a test

const dayOf = (date) => String(date || "").replace(" ", "T").split("T")[0];

function formatDuration(minutes) {
  const total = Math.round(minutes * 60);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

const parseArray = (json) => {
  try {
    const v = JSON.parse(json || "[]");
    return Array.isArray(v) ? v : [];
  } catch (_) {
    return [];
  }
};

/** The distance a test is over, in km, read from its name ("5k Pace & HR Baseline Test" -> 5), or null. */
function testDistanceKm(testName) {
  const n = String(testName || "").toLowerCase();
  if (/half[\s-]?marathon/.test(n)) return 21.0975;
  if (/marathon/.test(n)) return 42.195;
  let m = n.match(/(\d+(?:[.,]\d+)?)\s*(?:k|km)\b/);
  if (m) return parseFloat(m[1].replace(",", "."));
  m = n.match(/(\d+(?:[.,]\d+)?)\s*(?:mi|mile|miles)\b/);
  if (m) return parseFloat(m[1].replace(",", ".")) * 1.609344;
  m = n.match(/(\d{2,5})\s*m\b/);
  if (m) return parseInt(m[1], 10) / 1000;
  return null;
}

// How far a run of laps may be off the test distance and still be the test
// (GPS laps: an auto-lapped 5 km reads 4.98 to 5.02).
const DISTANCE_TOLERANCE = 0.02;

/**
 * The fastest run of consecutive laps that covers the test distance, or null.
 * Lap time is elapsed time, as the watch shows it. Heart rate is averaged over
 * time; max heart rate is the highest lap maximum.
 */
function testSegment(lapsJson, km) {
  const laps = parseArray(lapsJson).map((l) => ({
    metres: Number(l && l.distance) || 0,
    seconds: Number(l && (l.elapsed_time ?? l.moving_time)) || 0,
    hr: Number(l && l.average_heartrate) || 0,
    maxHr: Number(l && l.max_heartrate) || 0,
  }));
  if (laps.length < 2) return null;
  const lo = km * 1000 * (1 - DISTANCE_TOLERANCE);
  const hi = km * 1000 * (1 + DISTANCE_TOLERANCE);
  let best = null;
  for (let i = 0; i < laps.length; i++) {
    let metres = 0, seconds = 0, hrSeconds = 0, hrSum = 0, maxHr = 0;
    for (let j = i; j < laps.length; j++) {
      const l = laps[j];
      metres += l.metres;
      seconds += l.seconds;
      if (l.hr > 0) {
        hrSum += l.hr * l.seconds;
        hrSeconds += l.seconds;
      }
      maxHr = Math.max(maxHr, l.maxHr);
      if (metres > hi) break;
      if (metres < lo || seconds <= 0) continue;
      if (!best || seconds / metres < best.seconds / best.metres) {
        best = {
          first: i + 1,
          last: j + 1,
          of: laps.length,
          metres,
          seconds,
          avgHr: hrSeconds > 0 ? hrSum / hrSeconds : null,
          maxHr: maxHr || null,
        };
      }
    }
  }
  return best;
}

/** Strava's best effort over the test distance (time only), or null. */
function testBestEffort(setsJson, km) {
  const effort = parseArray(setsJson).find(
    (e) => e && Number(e.distance) > 0 && Math.abs(Number(e.distance) - km * 1000) <= km * 1000 * DISTANCE_TOLERANCE,
  );
  const seconds = effort && Number(effort.elapsed_time ?? effort.time);
  return seconds > 0 ? { metres: Number(effort.distance), seconds } : null;
}

function paceOf(family, minutes, km) {
  if (family === "run") return `${formatDuration(minutes / km)} /km`;
  if (family === "swim") return `${formatDuration(minutes / (km * 10))} /100m`;
  return undefined;
}

/**
 * The numbers shown on the benchmark card, in the keys the manual log uses.
 * With the test given, a distance test is measured over the test itself (see
 * the top of this file); "measured" on the card says what the numbers cover.
 */
function metricsFromActivity(activity, test) {
  const family = sportFamily(activity.sport_type);
  const km = test ? testDistanceKm(test.test_name) : null;
  if (km) {
    const seg = testSegment(activity.laps_json, km);
    if (seg) {
      const segKm = seg.metres / 1000;
      const min = seg.seconds / 60;
      const metrics = { distance: `${segKm.toFixed(2)} km`, time: formatDuration(min) };
      const pace = paceOf(family, min, segKm);
      if (pace) metrics.pace = pace;
      if (seg.avgHr) metrics.avg_hr = Math.round(seg.avgHr);
      if (seg.maxHr) metrics.max_hr = Math.round(seg.maxHr);
      metrics.measured = seg.first === seg.last ? `lap ${seg.first} of ${seg.of}` : `laps ${seg.first}-${seg.last} of ${seg.of}`;
      return metrics;
    }
    const effort = testBestEffort(activity.sets_json, km);
    if (effort) {
      const effKm = effort.metres / 1000;
      const min = effort.seconds / 60;
      const metrics = { distance: `${effKm.toFixed(2)} km`, time: formatDuration(min) };
      const pace = paceOf(family, min, effKm);
      if (pace) metrics.pace = pace;
      metrics.measured = "Strava best effort";
      return metrics;
    }
  }
  const metrics = wholeActivityMetrics(activity, family);
  if (km) metrics.measured = "whole activity";
  return metrics;
}

function wholeActivityMetrics(activity, family) {
  const km = Number(activity.distance_km) || 0;
  const min = Number(activity.moving_time_min) || 0;
  const metrics = {};
  if (km > 0) metrics.distance = `${km.toFixed(2)} km`;
  if (min > 0) metrics.time = formatDuration(min);
  if (km > 0 && min > 0) {
    const pace = paceOf(family, min, km);
    if (pace) metrics.pace = pace;
  }
  if (family === "ride" && activity.average_watts) metrics.avg_watts = Math.round(activity.average_watts);
  if (activity.average_heartrate) metrics.avg_hr = Math.round(activity.average_heartrate);
  if (activity.max_heartrate) metrics.max_hr = Math.round(activity.max_heartrate);
  return metrics;
}

function findCompletingActivity(test, activities, benchmarkPlanDays) {
  const family = sportFamily(test.sport_type);
  const from = dayOf(test.created_at);
  const testName = String(test.test_name || "").toLowerCase().trim();
  const candidates = activities.filter(
    (a) => sportFamily(a.sport_type) === family && dayOf(a.start_date) >= from && (Number(a.moving_time_min) || 0) >= MIN_MINUTES,
  );
  const byName = candidates.find((a) => testName && String(a.name || "").toLowerCase().includes(testName));
  if (byName) return byName;
  return candidates.find((a) => benchmarkPlanDays.some((p) => p.date === dayOf(a.start_date) && sportFamily(p.sport) === family)) || null;
}

/** Marks every pending benchmark of this athlete that an activity completed. Returns how many it closed. */
async function reconcilePendingBenchmarks(userId) {
  await remeasureCompletedBenchmarks(userId);
  const pending = await all(`SELECT * FROM benchmark_tests WHERE user_id = ? AND completed_at IS NULL ORDER BY created_at`, [userId]);
  if (pending.length === 0) return 0;

  const since = pending.map((t) => dayOf(t.created_at)).sort()[0];
  const activities = await all(
    `SELECT ${ACTIVITY_COLUMNS}
       FROM activities
      WHERE user_id = ? AND (is_hidden IS NULL OR is_hidden = 0) AND start_date >= ?
      ORDER BY start_date`,
    [userId, since],
  );
  if (activities.length === 0) return 0;
  const benchmarkPlanDays = await all(
    `SELECT date, sport FROM micro_plan WHERE user_id = ? AND date >= ? AND description LIKE '%Benchmark%'`,
    [userId, since],
  );

  const used = new Set();
  let closed = 0;
  for (const test of pending) {
    const activity = findCompletingActivity(test, activities.filter((a) => !used.has(a.id)), benchmarkPlanDays);
    if (!activity) continue;
    used.add(activity.id);
    const metrics = { ...metricsFromActivity(activity, test), activity: activity.name };
    const ok = await run(
      `UPDATE benchmark_tests SET metrics_json = ?, completed_at = ?, activity_id = ? WHERE id = ? AND user_id = ? AND completed_at IS NULL`,
      [JSON.stringify(metrics), activity.start_date, activity.id, test.id, userId],
    );
    if (ok) closed++;
  }
  return closed;
}

/**
 * Measures tests completed from an activity again, so they pick up laps that
 * arrived after the test was closed (and tests closed before they were
 * measured over the test itself). Manually logged results are the athlete's
 * own and stay as they are. Writes only what changed.
 */
async function remeasureCompletedBenchmarks(userId) {
  const done = await all(
    `SELECT * FROM benchmark_tests
      WHERE user_id = ? AND completed_at IS NOT NULL
        AND (coach_notes IS NULL OR coach_notes != 'Manually logged benchmark baseline')`,
    [userId],
  );
  for (const test of done) {
    let stored = {};
    try {
      stored = JSON.parse(test.metrics_json || "{}") || {};
    } catch (_) {}
    let activity = null;
    if (test.activity_id) {
      activity = (await all(`SELECT ${ACTIVITY_COLUMNS} FROM activities WHERE id = ? AND user_id = ?`, [test.activity_id, userId]))[0];
    } else if (stored.activity) {
      // Closed before the activity was linked: the reconciler wrote its name and start.
      activity = (
        await all(`SELECT ${ACTIVITY_COLUMNS} FROM activities WHERE user_id = ? AND name = ? AND start_date = ?`, [
          userId,
          stored.activity,
          test.completed_at,
        ])
      )[0];
    }
    if (!activity) continue;
    const metrics = { ...metricsFromActivity(activity, test), activity: activity.name };
    if (JSON.stringify(metrics) === test.metrics_json && test.activity_id === activity.id) continue;
    await run(`UPDATE benchmark_tests SET metrics_json = ?, activity_id = ? WHERE id = ? AND user_id = ?`, [
      JSON.stringify(metrics),
      activity.id,
      test.id,
      userId,
    ]);
  }
}

module.exports = { reconcilePendingBenchmarks, remeasureCompletedBenchmarks, findCompletingActivity, metricsFromActivity, testDistanceKm, testSegment };
