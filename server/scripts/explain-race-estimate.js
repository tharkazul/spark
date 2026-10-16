#!/usr/bin/env node
/**
 * Explain an athlete's race-time estimate (the "Schatting" on the goal card).
 * Read-only: prints every run in the 8-week window and what the estimate in
 * services/goalStatus.js did with it, so a surprising number can be traced.
 *
 * Examples
 *   node scripts/explain-race-estimate.js --user Quinten
 *   node scripts/explain-race-estimate.js --user Quinten --km 5 --days 84
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

async function main() {
  if (!TARGET) {
    console.error("Usage: node scripts/explain-race-estimate.js --user <username or id> [--km 5] [--days 56]");
    process.exit(1);
  }
  const user = await get(
    `SELECT id, username FROM users
      WHERE deleted_at IS NULL AND (id = ? OR LOWER(username) = LOWER(?) OR LOWER(username) LIKE LOWER(?))
      ORDER BY (id = ?) DESC, (LOWER(username) = LOWER(?)) DESC, id LIMIT 1`,
    [Number(TARGET) || -1, TARGET, `%${TARGET}%`, Number(TARGET) || -1, TARGET]
  );
  if (!user) throw new Error(`No user matching "${TARGET}"`);

  const goal = await seasonPlan.getMainRaceGoal(user.id);
  const season = await seasonPlan.getSeason?.(user.id).catch(() => null);
  const eventType = season?.eventType;
  const cfg = seasonPlan.EVENT_TYPES[eventType] || {};
  const distanceKm = KM_OVERRIDE || cfg.distanceKm || 5;
  const targetSec = goal && goal.target_mode === "time" ? goalStatus.parseTargetSeconds(goal.target_value, distanceKm) : null;

  console.log(`\n== ${user.username} (id ${user.id}) ==`);
  console.log(`Goal: ${goal ? `${goal.name} on ${goal.date}, target ${goal.target_value || "-"} (${mmss(targetSec)})` : "none"}`);
  console.log(`Distance used: ${distanceKm} km${eventType ? ` (event type ${eventType})` : ""}`);

  // Zones: which table decides "zone 3 or higher", and whether it is the athlete's own.
  const zoneRows = await all(`SELECT sport, source, zones_json, updated_at FROM athlete_zones WHERE user_id = ? AND kind = 'hr'`, [user.id]);
  const { hrZones, maxHr } = await athleteZones.resolveZonesForUser(user.id, "Run");
  console.log(`\nHR tables saved: ${zoneRows.length ? zoneRows.map((r) => `${r.sport}/${r.source} (${String(r.updated_at).slice(0, 10)})`).join(", ") : "none (derived on the fly)"}`);
  console.log(`Max HR known: ${maxHr || "-"}`);
  console.log(`Zones used for Run: ${(hrZones || []).map((z) => `Z${z.zone} ${z.min}-${z.max ?? "max"}`).join(" | ") || "none"}`);
  const observed = await get(`SELECT MAX(max_heartrate) AS max_hr, MAX(average_heartrate) AS max_avg FROM activities WHERE user_id = ?`, [user.id]);
  console.log(`Observed in activities: highest max HR ${observed?.max_hr || "-"}, highest avg HR ${observed?.max_avg || "-"}`);

  // Same selection as goalStatus.pickRaceEstimate, but annotated per run.
  const since = seasonPlan.addDays(seasonPlan.todayStr(), -DAYS);
  const rawRuns = (await all(
    `SELECT id, name, sport_type, distance_km, moving_time_min, start_date, average_heartrate, max_heartrate,
            strava_activity_id, healthkit_workout_id, suunto_workout_id, is_hidden
       FROM activities WHERE user_id = ? AND substr(start_date, 1, 10) >= ?
      ORDER BY start_date`,
    [user.id, since]
  )).filter((a) => RUN_TYPES.has(sportKey(a.sport_type)));
  const hidden = rawRuns.filter((r) => r.is_hidden);
  const runs = seasonPlan.dedupeActivities(rawRuns.filter((r) => !r.is_hidden));

  const isValid = (r) => {
    if (!(r.distance_km > 0) || !(r.moving_time_min > 0)) return false;
    const pace = r.moving_time_min / r.distance_km;
    return pace >= 2.83 && pace <= 12;
  };
  const isRecorded = (r) => (r.average_heartrate || 0) > 0 || r.strava_activity_id || r.healthkit_workout_id || r.suunto_workout_id;
  const valid = runs.filter(isValid);
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
  const top3 = new Set([...used].map((id) => runs.find((r) => r.id === id)).sort((a, b) => pred(a) - pred(b)).slice(0, 3).map((r) => r.id));

  console.log(`\nRuns in the last ${DAYS} days: ${rawRuns.length} (${hidden.length} hidden, ${rawRuns.length - hidden.length - runs.length} duplicates merged)`);
  console.log(`Distance band: ${lo}-${hi} km${bandFallback ? " -> EMPTY, fell back to every run of 3 km+" : ""}`);
  console.log(`Hard runs (avg HR zone 3+): ${hard.length} -> ${hard.length ? "only these count" : "none, so easy runs count too"}\n`);

  const rows = runs.map((r) => {
    let verdict;
    if (!isValid(r)) verdict = "dropped: pace outside 2:50-12:00/km";
    else if (anyRecorded && !isRecorded(r)) verdict = "dropped: typed in, not recorded";
    else if (!band.includes(r)) verdict = `dropped: ${r.distance_km < lo ? "too short" : "too long"} for ${distanceKm} km`;
    else if (!used.has(r.id)) verdict = "dropped: easy (avg HR below Z3) while hard runs exist";
    else verdict = top3.has(r.id) ? "TOP 3" : "counted";
    return {
      date: String(r.start_date).slice(0, 10),
      name: String(r.name || "").slice(0, 28),
      km: Math.round(r.distance_km * 100) / 100,
      time: mmss(r.moving_time_min * 60),
      "pace/km": mmss((r.moving_time_min * 60) / r.distance_km),
      avgHR: r.average_heartrate ? Math.round(r.average_heartrate) : "-",
      maxHR: r.max_heartrate || "-",
      zone: zoneOf(r) ?? "-",
      [`riegel ${distanceKm}k`]: isValid(r) ? mmss(pred(r)) : "-",
      verdict,
    };
  });
  console.table(rows);

  const est = await goalStatus.estimateRaceSeconds(user.id, distanceKm);
  console.log(`\nEstimate shown in the app: ${est ? mmss(est.seconds) : "none"} (median of the 3 fastest Riegel predictions)`);
  if (est) {
    console.log(`Basis: ${JSON.stringify(est.basis)}`);
    console.log(`Weekly trend: ${est.trend.map((p) => `${p.date.slice(5)} ${mmss(p.value)}`).join("  ")}`);
  }
  if (targetSec && est) console.log(`Gap to target: ${mmss(est.seconds - targetSec)} (${(((est.seconds - targetSec) / targetSec) * 100).toFixed(1)}%)`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
