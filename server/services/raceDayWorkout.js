/**
 * The race-day workout follows the race plan.
 *
 * The weekly planner writes the race day from the goal (a 20:00 5K becomes "5K at 4:00/km"),
 * while the race plan the athlete asked for is realistic (about 22:00 at 4:20-4:25/km). The
 * watch got the goal pace (tester feedback, 25 Nov 2026). So once there is a race plan, the
 * race-day session gets its pacing as watch steps:
 *   warm-up until the athlete presses lap at the start, one step per pacing segment with
 *   that pace, then an easy cool-down. The details say the plan's time and average pace.
 *
 * Running races only (5K to marathon): a triathlon or Hyrox doesn't fit one watch workout.
 * Applied when the race plan is created and again after every weekly plan or replan that
 * writes the race day (workoutPlanning.js).
 */
const db = require("./db");
const i18n = require("./i18n");

const dbGet = (sql, params = []) => new Promise((resolve) => db.get(sql, params, (err, row) => resolve(err ? null : row || null)));
const dbRun = (sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, (err) => (err ? reject(err) : resolve())));

/** Race distance in km for the running events, by season event type. */
const RUN_DISTANCE_KM = { "5k": 5, "10k": 10, half: 21.0975, marathon: 42.195 };

const MIN_PACE_SEC = 150; // 2:30/km
const MAX_PACE_SEC = 720; // 12:00/km

/** "4:25" -> 265; null for anything that isn't a plausible pace per km. */
function paceSec(value) {
  const m = String(value == null ? "" : value).match(/(\d{1,2})[:.](\d{2})/);
  if (!m) return null;
  const sec = Number(m[1]) * 60 + Number(m[2]);
  return sec >= MIN_PACE_SEC && sec <= MAX_PACE_SEC ? sec : null;
}

const fmtPace = (sec) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;

function fmtTime(sec) {
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
}

/**
 * The race plan's structured steps ([{ distance_m, pace }]) as segments, or null when they
 * don't add up to the race (within 3%). The last segment absorbs the rounding.
 */
function segmentsFromRaceSteps(raceSteps, distanceKm) {
  if (!Array.isArray(raceSteps) || !raceSteps.length || !distanceKm) return null;
  const total = Math.round(distanceKm * 1000);
  const segs = [];
  for (const s of raceSteps) {
    const m = Math.round(Number(s && s.distance_m));
    const p = paceSec(s && s.pace);
    if (!(m > 0) || !p) return null;
    segs.push({ distance_m: m, paceSec: p });
  }
  const sum = segs.reduce((a, s) => a + s.distance_m, 0);
  if (Math.abs(sum - total) > total * 0.03) return null;
  segs[segs.length - 1].distance_m += total - sum;
  return segs.filter((s) => s.distance_m > 0);
}

/**
 * Plans written before raceSteps existed: read "km 0-1 / 4:25/km" style rows from the
 * pacing table. Every row needs a km range and a pace, and together they must cover the race
 * from start to finish; otherwise null (and the race day is left alone).
 */
function segmentsFromPacingText(pacing, distanceKm) {
  if (!Array.isArray(pacing) || !pacing.length || !distanceKm) return null;
  const num = (v) => Number(String(v).replace(",", "."));
  const rows = [];
  for (const p of pacing) {
    const text = `${p && p.segment ? p.segment : ""}`;
    const range = text.match(/(\d+(?:[.,]\d+)?)\s*(?:km)?\s*[-–—]\s*(\d+(?:[.,]\d+)?)/);
    if (!range) return null;
    const target = `${p && p.target ? p.target : ""}`;
    const paces = [...target.matchAll(/(\d{1,2})[:.](\d{2})/g)].map((m) => paceSec(m[0])).filter(Boolean);
    if (!paces.length) return null;
    rows.push({ from: num(range[1]), to: num(range[2]), paceSec: Math.round(paces.reduce((a, b) => a + b, 0) / paces.length) });
  }
  rows.sort((a, b) => a.from - b.from);
  const end = Math.round(distanceKm * 10) / 10;
  if (rows[0].from !== 0 || Math.abs(rows[rows.length - 1].to - end) > 0.15) return null;
  for (let i = 1; i < rows.length; i++) if (Math.abs(rows[i].from - rows[i - 1].to) > 0.01) return null;
  return segmentsFromRaceSteps(
    rows.map((r) => ({ distance_m: Math.round((r.to - r.from) * 1000), pace: fmtPace(r.paceSec) })),
    distanceKm,
  );
}

/** Segments for a stored race plan: its raceSteps, else its pacing table. */
function raceSegments(plan, distanceKm) {
  if (!plan) return null;
  return segmentsFromRaceSteps(plan.raceSteps, distanceKm) || segmentsFromPacingText(plan.pacing, distanceKm);
}

const kmLabel = (m) => String(Math.round(m / 100) / 10).replace(/\.0$/, "");

/** The watch steps: open warm-up (lap at the start), the pacing segments, an easy cool-down. */
function buildRaceDaySteps(segments, lang) {
  let at = 0;
  const race = segments.map((s) => {
    const from = at;
    at += s.distance_m;
    return {
      type: "interval",
      exerciseName: i18n.t(lang, "raceDay.segment", { from: kmLabel(from), to: kmLabel(at) }),
      condition_type: "distance",
      condition_value: s.distance_m,
      target_type: "pace.exact",
      target_value: fmtPace(s.paceSec),
    };
  });
  return [
    { type: "warmup", exerciseName: i18n.t(lang, "raceDay.warmup"), condition_type: "lap.button", condition_value: null, target_type: "no.target" },
    ...race,
    { type: "cooldown", exerciseName: i18n.t(lang, "raceDay.cooldown"), condition_type: "time", condition_value: 10, target_type: "no.target" },
  ];
}

/** Planned finish time and average pace of the segments. */
function raceTiming(segments) {
  const sec = segments.reduce((a, s) => a + (s.distance_m / 1000) * s.paceSec, 0);
  const km = segments.reduce((a, s) => a + s.distance_m, 0) / 1000;
  return { timeSec: sec, avgPaceSec: sec / km };
}

/**
 * Puts the race plan's pacing on the race-day session. Returns { applied, ... } or
 * { skipped, reason }. Never throws for a missing plan, event or session.
 */
async function applyRacePlanToRaceDay(userId, raceDate) {
  const meta = await dbGet(`SELECT event_type FROM season_meta WHERE user_id = ? AND race_date = ?`, [userId, raceDate]);
  const distanceKm = meta && RUN_DISTANCE_KM[meta.event_type];
  if (!distanceKm) return { skipped: true, reason: "not a running race with a known distance" };
  const row = await dbGet(`SELECT plan_json FROM race_plans WHERE user_id = ? AND race_date = ?`, [userId, raceDate]);
  let plan = null;
  try {
    plan = row ? JSON.parse(row.plan_json) : null;
  } catch (_) {}
  const segments = raceSegments(plan, distanceKm);
  if (!segments) return { skipped: true, reason: plan ? "race plan has no usable pacing" : "no race plan" };

  const session = await dbGet(
    `SELECT id FROM micro_plan WHERE user_id = ? AND date = ? AND LOWER(sport) = 'run' AND COALESCE(source, '') != 'recurring'
      ORDER BY target_rooka DESC LIMIT 1`,
    [userId, raceDate],
  );
  if (!session) return { skipped: true, reason: "no race-day run planned yet" };

  const user = await dbGet(`SELECT language FROM users WHERE id = ?`, [userId]);
  const lang = i18n.normalizeLang(user && user.language);
  const { timeSec, avgPaceSec } = raceTiming(segments);
  const details = [plan.summary, i18n.t(lang, "raceDay.planLine", { time: fmtTime(timeSec), pace: fmtPace(avgPaceSec) })]
    .filter(Boolean)
    .join("\n\n");
  await dbRun(`UPDATE micro_plan SET steps_json = ?, details = ? WHERE id = ?`, [
    JSON.stringify(buildRaceDaySteps(segments, lang)),
    details,
    session.id,
  ]);
  return { applied: true, sessionId: session.id, time: fmtTime(timeSec), avgPace: fmtPace(avgPaceSec), segments: segments.length };
}

/**
 * The race plan for a race in these dates, as a line for the weekly planner's prompt, so the
 * rest of the week (race-pace work, openers) uses the same paces. Null when there's none.
 */
async function racePlanPromptLine(userId, dates) {
  if (!dates || !dates.length) return null;
  const row = await dbGet(
    `SELECT p.race_date, p.race_name, p.plan_json, m.event_type FROM race_plans p
       LEFT JOIN season_meta m ON m.user_id = p.user_id AND m.race_date = p.race_date
      WHERE p.user_id = ? AND p.race_date >= ? AND p.race_date <= ?`,
    [userId, dates[0], dates[dates.length - 1]],
  );
  if (!row) return null;
  let plan;
  try {
    plan = JSON.parse(row.plan_json);
  } catch (_) {
    return null;
  }
  const segments = raceSegments(plan, RUN_DISTANCE_KM[row.event_type]);
  const pacing = segments
    ? (() => {
        const { timeSec, avgPaceSec } = raceTiming(segments);
        return `planned finish about ${fmtTime(timeSec)} at ${fmtPace(avgPaceSec)}/km on average`;
      })()
    : (plan.pacing || []).map((p) => `${p.segment}: ${p.target}`).join("; ");
  return (
    `AGREED RACE PLAN for "${row.race_name}" on ${row.race_date} (the athlete has it on their Goal page): ${plan.summary || ""} Pacing: ${pacing}. ` +
    `Make the race day the race itself with exactly this pacing, and use these paces (not the goal-time pace) for any race-pace work this week.`
  );
}

module.exports = {
  applyRacePlanToRaceDay,
  racePlanPromptLine,
  // exported for tests
  RUN_DISTANCE_KM,
  paceSec,
  segmentsFromRaceSteps,
  segmentsFromPacingText,
  raceSegments,
  buildRaceDaySteps,
  raceTiming,
};
