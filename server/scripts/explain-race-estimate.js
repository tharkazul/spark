#!/usr/bin/env node
/**
 * Explain an athlete's race-time estimate (the "Schatting" on the goal card).
 * Read-only: prints every run in the 8-week window and what the estimate in
 * services/goalStatus.js did with it, so a surprising number can be traced.
 *
 * Also compares the old method (A: median of the 3 fastest) with the
 * live one (C v2: best hard effort + race-day bonus, else heart rate) and the
 * heart-rate estimate on its own (heart rate vs pace -> VO2max -> Daniels), so a
 * change can be judged per athlete before it goes live.
 *
 * Examples
 *   node scripts/explain-race-estimate.js --user Quinten
 *   node scripts/explain-race-estimate.js --user Quinten --km 5 --days 84
 *   node scripts/explain-race-estimate.js --all          (one row per athlete with a running goal)
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), quiet: true });

const db = require("../services/db");
const seasonPlan = require("../services/seasonPlan");
const athleteZones = require("../services/athleteZones");
const goalStatus = require("../services/goalStatus");

const argv = process.argv.slice(2);
const value = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? null : argv[i + 1];
};

const TARGET = value("user");
const ALL = argv.includes("--all");
const DAYS = parseInt(value("days") || "56", 10);
const KM_OVERRIDE = value("km") ? parseFloat(value("km")) : null;

const all = (sql, p = []) => new Promise((res, rej) => db.all(sql, p, (e, r) => (e ? rej(e) : res(r || []))));
const get = (sql, p = []) => new Promise((res, rej) => db.get(sql, p, (e, r) => (e ? rej(e) : res(r || null))));

const RUN_TYPES = new Set(["run", "virtualrun", "trailrun", "treadmill"]);
const sportKey = (t) => String(t || "").toLowerCase().replace(/\s+/g, "");
const mmss = (sec) => {
  if (!(sec > 0)) return "-";
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${r}` : `${m}:${r}`;
};


/**
 * What the laps say about a run: an interval session hides fast work behind
 * slow recoveries in the average, and a hockey game recorded as a run has
 * wildly uneven laps. "Work" laps are the ones at least 10% faster than the
 * run's median lap pace (exploratory; nothing in the live estimate uses this).
 */
function lapInfo(r) {
  let laps = [];
  try {
    laps = JSON.parse(r.laps_json || "[]").filter((l) => l.distance > 50 && l.moving_time > 0);
  } catch (_) {}
  if (laps.length < 2) return { laps: laps.length };
  const pace = (l) => l.moving_time / (l.distance / 1000);
  const paces = laps.map(pace).sort((a, b) => a - b);
  const median = paces[Math.floor(paces.length / 2)];
  const work = laps.filter((l) => pace(l) <= median * 0.9);
  const mean = paces.reduce((a, b) => a + b, 0) / paces.length;
  const cv = Math.sqrt(paces.reduce((a, p) => a + (p - mean) ** 2, 0) / paces.length) / mean;
  const workDist = work.reduce((a, l) => a + l.distance, 0);
  const workTime = work.reduce((a, l) => a + l.moving_time, 0);
  const workHr = work.filter((l) => l.average_heartrate > 0);
  return {
    laps: laps.length,
    fastestLap: paces[0],
    cv,
    workKm: workDist / 1000,
    workPace: workDist > 0 ? workTime / (workDist / 1000) : null,
    workHr: workHr.length ? workHr.reduce((a, l) => a + l.average_heartrate, 0) / workHr.length : null,
    workRiegel5k: workDist >= 1000 ? workTime * Math.pow(5000 / workDist, 1.06) : null,
  };
}


async function athleteHr(userId) {
  const hr = await goalStatus.getRaceHeartRate(userId);
  const vo2 = await get(
    `SELECT vo2_max, date FROM biometrics WHERE user_id = ? AND vo2_max > 0 AND date >= ? ORDER BY date DESC LIMIT 1`,
    [userId, seasonPlan.addDays(seasonPlan.todayStr(), -60)]
  );
  return { ...hr, observedMax: hr.observedMaxHr, vo2: vo2 || null };
}

async function findUser(target) {
  return get(
    `SELECT id, username FROM users
      WHERE deleted_at IS NULL AND (id = ? OR LOWER(username) = LOWER(?) OR LOWER(username) LIKE LOWER(?))
      ORDER BY (id = ?) DESC, (LOWER(username) = LOWER(?)) DESC, id LIMIT 1`,
    [Number(target) || -1, target, `%${target}%`, Number(target) || -1, target]
  );
}

async function loadRuns(userId, days) {
  const since = seasonPlan.addDays(seasonPlan.todayStr(), -days);
  return (await all(
    `SELECT id, name, sport_type, distance_km, moving_time_min, start_date, average_heartrate, max_heartrate,
            strava_activity_id, healthkit_workout_id, suunto_workout_id, is_hidden, laps_json, linked_activity_name
       FROM activities WHERE user_id = ? AND substr(start_date, 1, 10) >= ?
      ORDER BY start_date`,
    [userId, since]
  )).filter((a) => RUN_TYPES.has(sportKey(a.sport_type)));
}

/** A, C and the aerobic estimate, as of `day`, from the runs in the 8 weeks before it. */
function compareAsOf(runs, day, distanceKm, hrZones, hr) {
  const from = seasonPlan.addDays(day, -56);
  const window = runs.filter((r) => {
    const d = String(r.start_date || "").slice(0, 10);
    return d >= from && d <= day;
  });
  return {
    A: goalStatus.pickRaceEstimate(window, distanceKm, hrZones),
    C: goalStatus.pickRaceEstimateBestEffort(window, distanceKm, hrZones, { maxHr: hr.maxHr, restingHr: hr.restingHr, asOf: day }),
    E: goalStatus.heartRateRaceEstimate(window, distanceKm, { maxHr: hr.maxHr, restingHr: hr.restingHr }),
  };
}

async function explainUser(user, verbose) {
  const goal = await seasonPlan.getMainRaceGoal(user.id);
  const season = await seasonPlan.getSeason(user.id).catch(() => null);
  const eventType = season?.eventType;
  const cfg = seasonPlan.EVENT_TYPES[eventType] || {};
  const distanceKm = KM_OVERRIDE || cfg.distanceKm || 5;
  const targetSec = goal && goal.target_mode === "time" ? goalStatus.parseTargetSeconds(goal.target_value, distanceKm) : null;
  const { hrZones } = await athleteZones.resolveZonesForUser(user.id, "Run");
  const hr = await athleteHr(user.id);
  const allRuns = await loadRuns(user.id, Math.max(DAYS, 56 + 84));
  const runs = seasonPlan.dedupeActivities(allRuns.filter((r) => !r.is_hidden));
  const today = seasonPlan.todayStr();
  const now = compareAsOf(runs, today, distanceKm, hrZones, hr);
  const watchVo2Sec = hr.vo2 ? goalStatus.raceSecondsFromVdot(hr.vo2.vo2_max, distanceKm) : null;
  const gap = (sec) => (targetSec && sec ? `${(((sec - targetSec) / targetSec) * 100).toFixed(1)}% (${goalStatus.statusFromGap((sec - targetSec) / targetSec)})` : "-");

  if (!verbose) {
    return {
      athlete: user.username,
      event: eventType || "-",
      target: mmss(targetSec),
      "A old": mmss(now.A?.seconds),
      "C v2": mmss(now.C?.seconds),
      "C method": now.C?.basis?.method || "-",
      "C gap": gap(now.C?.seconds),
      "heart-rate est.": mmss(now.E?.seconds),
      "watch VO2max": watchVo2Sec ? `${mmss(watchVo2Sec)} (${hr.vo2.vo2_max})` : "-",
      maxHR: hr.maxHr || "-",
    };
  }
  console.log(`\n== ${user.username} (id ${user.id}) ==`);
  console.log(`Goal: ${goal ? `${goal.name} on ${goal.date}, target ${goal.target_value || "-"} (${mmss(targetSec)})` : "none"}`);
  console.log(`Distance used: ${distanceKm} km${eventType ? ` (event type ${eventType})` : ""}`);

  // Zones: which table decides "zone 3 or higher", and whether it is the athlete's own.
  const zoneRows = await all(`SELECT sport, source, zones_json, updated_at FROM athlete_zones WHERE user_id = ? AND kind = 'hr'`, [user.id]);
  console.log(`\nHR tables saved: ${zoneRows.length ? zoneRows.map((r) => `${r.sport}/${r.source} (${String(r.updated_at).slice(0, 10)})`).join(", ") : "none (derived on the fly)"}`);
  console.log(`Max HR: saved ${hr.savedMaxHr || "-"}, highest recorded (1y) ${hr.observedMax || "-"} -> using ${hr.maxHr || "-"}`);
  console.log(`Resting HR: ${hr.restingHr ? `${hr.restingHr} (${hr.restingFrom})` : "unknown -> no heart-rate estimate"}`);
  console.log(`Watch VO2max: ${hr.vo2 ? `${hr.vo2.vo2_max} (${hr.vo2.date})` : "none in the last 60 days"}`);
  console.log(`Zones used for Run: ${(hrZones || []).map((z) => `Z${z.zone} ${z.min}-${z.max ?? "max"}`).join(" | ") || "none"}`);
  const observed = await get(`SELECT MAX(max_heartrate) AS max_hr, MAX(average_heartrate) AS max_avg FROM activities WHERE user_id = ?`, [user.id]);
  console.log(`Observed in activities: highest max HR ${observed?.max_hr || "-"}, highest avg HR ${observed?.max_avg || "-"}`);

  // Same selection as goalStatus.pickRaceEstimate, but annotated per run.
  const since = seasonPlan.addDays(today, -DAYS);
  const rawRuns = allRuns.filter((r) => String(r.start_date).slice(0, 10) >= since);
  const hidden = rawRuns.filter((r) => r.is_hidden);
  const windowRuns = runs.filter((r) => String(r.start_date).slice(0, 10) >= since);

  const isValid = (r) => {
    if (!(r.distance_km > 0) || !(r.moving_time_min > 0)) return false;
    const pace = r.moving_time_min / r.distance_km;
    return pace >= 2.83 && pace <= 12;
  };
  const isRecorded = (r) => (r.average_heartrate || 0) > 0 || r.strava_activity_id || r.healthkit_workout_id || r.suunto_workout_id;
  const valid = windowRuns.filter(isValid);
  const anyRecorded = valid.some(isRecorded);
  const lo = Math.max(3, 0.5 * distanceKm);
  const hi = 3 * distanceKm;
  let band = valid.filter((r) => (!anyRecorded || isRecorded(r)) && r.distance_km >= lo && r.distance_km <= hi);
  const bandFallback = band.length === 0;
  if (bandFallback) band = valid.filter((r) => (!anyRecorded || isRecorded(r)) && r.distance_km >= 3);
  const zoneOf = (r) => goalStatus.zoneForHr(r.average_heartrate, hrZones);
  const hard = band.filter((r) => (zoneOf(r) || 0) >= 3);
  const used = new Set((hard.length ? hard : band).map((r) => r.id));
  const pred = (r) => r.moving_time_min * 60 * Math.pow(distanceKm / r.distance_km, 1.06);
  const top3 = new Set([...used].map((id) => windowRuns.find((r) => r.id === id)).sort((a, b) => pred(a) - pred(b)).slice(0, 3).map((r) => r.id));

  console.log(`\nRuns in the last ${DAYS} days: ${rawRuns.length} (${hidden.length} hidden, ${rawRuns.length - hidden.length - windowRuns.length} duplicates merged)`);
  for (const h of hidden) console.log(`  hidden: ${String(h.start_date).slice(0, 10)} "${h.name}" ${h.distance_km} km${h.linked_activity_name ? ` (linked to ${h.linked_activity_name})` : ""}`);
  console.log(`Distance band: ${lo}-${hi} km${bandFallback ? " -> EMPTY, fell back to every run of 3 km+" : ""}`);
  console.log(`Hard runs (avg HR zone 3+): ${hard.length} -> ${hard.length ? "only these count" : "none, so easy runs count too"}\n`);

  const bestId = now.C?.basis?.method === "best_effort" ? now.C.basis.fastest.date : null;
  const hrr = (r) =>
    hr.maxHr && hr.restingHr && r.average_heartrate ? Math.round(((r.average_heartrate - hr.restingHr) / (hr.maxHr - hr.restingHr)) * 100) : null;
  const rows = windowRuns.map((r) => {
    const li = lapInfo(r);
    let verdict;
    if (!isValid(r)) verdict = "dropped: pace outside 2:50-12:00/km";
    else if (anyRecorded && !isRecorded(r)) verdict = "dropped: typed in, not recorded";
    else if (!band.includes(r)) verdict = `dropped: ${r.distance_km < lo ? "too short" : "too long"} for ${distanceKm} km`;
    else if (!used.has(r.id)) verdict = "dropped: easy (avg HR below Z3) while hard runs exist";
    else verdict = top3.has(r.id) ? "TOP 3" : "counted";
    return {
      date: String(r.start_date).slice(0, 10),
      name: String(r.name || "").slice(0, 22),
      km: Math.round(r.distance_km * 100) / 100,
      time: mmss(r.moving_time_min * 60),
      "pace/km": mmss((r.moving_time_min * 60) / r.distance_km),
      avgHR: r.average_heartrate ? Math.round(r.average_heartrate) : "-",
      maxHR: r.max_heartrate || "-",
      zone: zoneOf(r) ?? "-",
      "%HRmax": hr.maxHr && r.average_heartrate ? Math.round((r.average_heartrate / hr.maxHr) * 100) : "-",
      "%HRR": hrr(r) ?? "-",
      laps: li.laps || "-",
      "pace spread": li.cv != null ? `${Math.round(li.cv * 100)}%` : "-",
      "fastest lap": li.fastestLap ? mmss(li.fastestLap) : "-",
      "work laps": li.workKm ? `${li.workKm.toFixed(1)}km @ ${mmss(li.workPace)}${li.workHr ? ` ${Math.round(li.workHr)}bpm` : ""}` : "-",
      "5k from work": li.workRiegel5k ? mmss(li.workRiegel5k) : "-",
      steady: goalStatus.isSteadyRun(r) ? "yes" : "no",
      "%HRmax>=88": hr.maxHr && r.average_heartrate >= 0.88 * hr.maxHr ? "HARD" : "",
      [`riegel ${distanceKm}k`]: isValid(r) ? mmss(pred(r)) : "-",
      "A verdict": verdict,
      C: bestId && String(r.start_date).slice(0, 10) === bestId ? "BEST EFFORT" : "",
    };
  });
  console.table(rows);

  console.log(`\n--- Comparison (target ${mmss(targetSec)}) ---`);
  console.log(`A old       ${mmss(now.A?.seconds).padEnd(8)} gap ${gap(now.A?.seconds)}   median of the 3 fastest`);
  console.log(`C v2 (live) ${mmss(now.C?.seconds).padEnd(8)} gap ${gap(now.C?.seconds)}   ${JSON.stringify(now.C?.basis || null)}`);
  console.log(`Heart rate  ${mmss(now.E?.seconds).padEnd(8)} gap ${gap(now.E?.seconds)}   ${now.E ? `VDOT ${now.E.vdot} from ${now.E.runs} steady runs (50-85% HRR, 75th percentile)` : "needs measured max + resting HR and 3 steady runs"}`);
  console.log(`Watch VO2   ${mmss(watchVo2Sec).padEnd(8)} gap ${gap(watchVo2Sec)}   ${hr.vo2 ? `VO2max ${hr.vo2.vo2_max} read as VDOT` : "no recent watch VO2max"}`);

  const trend = [];
  for (let w = 12; w >= 0; w--) {
    const day = seasonPlan.addDays(today, -7 * w);
    const c = compareAsOf(runs, day, distanceKm, hrZones, hr);
    trend.push({ week: day, "A old": mmss(c.A?.seconds), "C v2": mmss(c.C?.seconds), "C method": c.C?.basis?.method || "-", "heart-rate est.": mmss(c.E?.seconds) });
  }
  console.log("\nWeekly trend, as the goal card would draw it:");
  console.table(trend);
  return null;
}

async function main() {
  if (ALL) {
    const users = await all(`SELECT id, username FROM users WHERE deleted_at IS NULL ORDER BY id`);
    const rows = [];
    for (const u of users) {
      const goal = await seasonPlan.getMainRaceGoal(u.id).catch(() => null);
      const season = goal ? await seasonPlan.getSeason(u.id).catch(() => null) : null;
      if (!season || !(seasonPlan.EVENT_TYPES[season.eventType] || {}).distanceKm) continue;
      rows.push(await explainUser(u, false));
    }
    console.table(rows);
    process.exit(0);
  }
  if (!TARGET) {
    console.error("Usage: node scripts/explain-race-estimate.js --user <username or id> [--km 5] [--days 56] | --all");
    process.exit(1);
  }
  const user = await findUser(TARGET);
  if (!user) throw new Error(`No user matching "${TARGET}"`);
  await explainUser(user, true);
  process.exit(0);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
