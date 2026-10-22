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
 */
const db = require("./db");
const { sportFamily } = require("./activityMerge");

const all = (sql, params) => new Promise((resolve) => db.all(sql, params, (err, rows) => resolve(err ? [] : rows || [])));
const run = (sql, params) => new Promise((resolve) => db.run(sql, params, (err) => resolve(!err)));

const MIN_MINUTES = 12; // a warm-up jog or a commute is not a test

const dayOf = (date) => String(date || "").replace(" ", "T").split("T")[0];

function formatDuration(minutes) {
  const total = Math.round(minutes * 60);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/** The numbers shown on the benchmark card, in the keys the manual log uses. */
function metricsFromActivity(activity) {
  const family = sportFamily(activity.sport_type);
  const km = Number(activity.distance_km) || 0;
  const min = Number(activity.moving_time_min) || 0;
  const metrics = {};
  if (km > 0) metrics.distance = `${km.toFixed(2)} km`;
  if (min > 0) metrics.time = formatDuration(min);
  if (km > 0 && min > 0) {
    if (family === "run") metrics.pace = `${formatDuration(min / km)} /km`;
    if (family === "swim") metrics.pace = `${formatDuration(min / (km * 10))} /100m`;
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
  const pending = await all(`SELECT * FROM benchmark_tests WHERE user_id = ? AND completed_at IS NULL ORDER BY created_at`, [userId]);
  if (pending.length === 0) return 0;

  const since = pending.map((t) => dayOf(t.created_at)).sort()[0];
  const activities = await all(
    `SELECT id, name, sport_type, distance_km, moving_time_min, average_heartrate, max_heartrate, average_watts, start_date
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
    const metrics = { ...metricsFromActivity(activity), activity: activity.name };
    const ok = await run(
      `UPDATE benchmark_tests SET metrics_json = ?, completed_at = ? WHERE id = ? AND user_id = ? AND completed_at IS NULL`,
      [JSON.stringify(metrics), activity.start_date, test.id, userId],
    );
    if (ok) closed++;
  }
  return closed;
}

module.exports = { reconcilePendingBenchmarks, findCompletingActivity, metricsFromActivity };
