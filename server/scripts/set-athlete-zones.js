#!/usr/bin/env node
/**
 * Give an existing athlete their training zones.
 *
 * Accounts created before zones existed have none, and scoring is zone-weighted,
 * so they need a max HR from somewhere. Three routes, in order of preference:
 *
 *   --from-history   derive max HR from the highest heart rate actually recorded
 *                    across their activities. Better than 220 - age, because it
 *                    is measured rather than assumed.
 *   --age N          the 220 - age estimate.
 *   --dob YYYY-MM-DD same, but stored so it never goes stale.
 *
 * Examples
 *   node scripts/set-athlete-zones.js --list
 *   node scripts/set-athlete-zones.js --user Rutger --from-history --dry-run
 *   node scripts/set-athlete-zones.js --user Rutger --age 38 --ftp 300
 *   node scripts/set-athlete-zones.js --all --from-history
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), quiet: true });

const db = require("../services/db");
const zoneModel = require("../services/zones");
const athleteZones = require("../services/athleteZones");

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const value = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? null : argv[i + 1];
};

const DRY_RUN = flag("dry-run");
const FROM_HISTORY = flag("from-history");
const ALL = flag("all");
const LIST = flag("list");
const TARGET = value("user");
const AGE = value("age");
const DOB = value("dob");
const FTP = value("ftp");

const all = (sql, p = []) =>
  new Promise((res, rej) => db.all(sql, p, (e, r) => (e ? rej(e) : res(r || []))));
const run = (sql, p = []) =>
  new Promise((res, rej) => db.run(sql, p, (e) => (e ? rej(e) : res())));

async function loadAthletes() {
  return all(`
    SELECT u.id, u.username, u.date_of_birth,
           (SELECT COUNT(*) FROM athlete_zones z WHERE z.user_id = u.id) AS zone_tables,
           (SELECT value FROM athlete_metrics m WHERE m.user_id = u.id AND m.metric = 'max_hr') AS max_hr,
           (SELECT MAX(COALESCE(a.max_heartrate, 0)) FROM activities a WHERE a.user_id = u.id) AS observed_max_hr,
           (SELECT MAX(COALESCE(a.average_heartrate, 0)) FROM activities a WHERE a.user_id = u.id) AS highest_avg_hr,
           (SELECT COUNT(*) FROM activities a WHERE a.user_id = u.id) AS activities
      FROM users u
     WHERE u.deleted_at IS NULL
     ORDER BY u.id`);
}

function describe(a) {
  const zones = a.zone_tables > 0 ? `${a.zone_tables} table(s)` : "none";
  return (
    `  ${String(a.id).padStart(3)}  ${String(a.username).padEnd(34).slice(0, 34)}` +
    `  zones: ${zones.padEnd(11)}` +
    `  max_hr: ${(a.max_hr || "-").toString().padEnd(5)}` +
    `  observed peak: ${(a.observed_max_hr || 0) || "-"}`.padEnd(22) +
    `  activities: ${a.activities}`
  );
}

async function applyTo(athlete) {
  let maxHr = null;
  let source = null;

  if (FROM_HISTORY) {
    if (athlete.observed_max_hr && athlete.observed_max_hr > 0) {
      maxHr = Math.round(athlete.observed_max_hr);
      source = "measured peak";
    } else {
      // Deliberately refuse to guess. Deriving a max from average HR would be
      // exactly the kind of invented precision this rewrite removed — the
      // averages are a floor, not a maximum.
      console.log(
        `  ${athlete.username}: SKIPPED — no recorded peak HR yet.` +
          (athlete.highest_avg_hr > 0
            ? ` Highest average is ${Math.round(athlete.highest_avg_hr)} bpm, which is a floor, not a max.`
            : "") +
          ` Re-sync Strava so max_heartrate is captured, or pass --age.`
      );
      return false;
    }
  } else if (AGE) {
    maxHr = zoneModel.maxHrFromAge(Number(AGE));
    source = `220 - ${AGE}`;
  } else if (DOB) {
    const age = zoneModel.ageFromDateOfBirth(DOB);
    maxHr = zoneModel.maxHrFromAge(age);
    source = `220 - ${age} (from ${DOB})`;
  }

  if (!maxHr) {
    console.log(`  ${athlete.username}: SKIPPED — could not determine a max HR.`);
    return false;
  }

  console.log(`  ${athlete.username}: max HR ${maxHr} bpm  (${source})`);
  const hr = zoneModel.buildHrZones(maxHr);
  console.log(`     HR  ${hr.map((z) => `Z${z.zone} ${z.min}-${z.max}`).join("  ")}`);

  const ftp = FTP ? Number(FTP) : null;
  const power = ftp ? zoneModel.buildPowerZones(ftp) : null;
  if (power) {
    console.log(
      `     PWR ${power.map((z) => `Z${z.zone} ${z.min}-${z.max ?? "∞"}`).join("  ")}`
    );
  } else {
    console.log(`     PWR none — no FTP supplied, rides will score on heart rate alone.`);
  }

  if (DRY_RUN) return true;

  if (DOB) await run(`UPDATE users SET date_of_birth = ? WHERE id = ?`, [DOB, athlete.id]);
  await run(
    `INSERT INTO athlete_metrics (user_id, metric, value) VALUES (?, 'max_hr', ?)
     ON CONFLICT(user_id, metric) DO UPDATE SET value = excluded.value`,
    [athlete.id, String(maxHr)]
  );
  if (ftp) {
    await run(
      `INSERT INTO athlete_metrics (user_id, metric, value) VALUES (?, 'ftp', ?)
       ON CONFLICT(user_id, metric) DO UPDATE SET value = excluded.value`,
      [athlete.id, String(ftp)]
    );
  }
  await athleteZones.seedDefaultZones(athlete.id);
  return true;
}

(async () => {
  const athletes = await loadAthletes();

  if (LIST || (!TARGET && !ALL)) {
    console.log("\nAthletes:\n");
    athletes.forEach((a) => console.log(describe(a)));
    const missing = athletes.filter((a) => a.zone_tables === 0);
    console.log(`\n  ${missing.length} of ${athletes.length} have no zone table.\n`);
    if (!LIST) {
      console.log("Pass --user <name|id> or --all, plus one of --from-history / --age N / --dob YYYY-MM-DD.\n");
    }
    process.exit(0);
  }

  const targets = ALL
    ? athletes.filter((a) => a.zone_tables === 0)
    : athletes.filter(
        (a) => String(a.id) === String(TARGET) || a.username === TARGET
      );

  if (targets.length === 0) {
    console.log(`No athlete matched "${TARGET}".`);
    process.exit(1);
  }

  console.log(`\n${DRY_RUN ? "[DRY RUN] " : ""}Setting zones for ${targets.length} athlete(s):\n`);
  let done = 0;
  for (const a of targets) if (await applyTo(a)) done++;

  console.log(
    `\n${DRY_RUN ? "Nothing written. " : `Updated ${done} athlete(s). `}` +
      (DRY_RUN ? "Re-run without --dry-run to apply.\n" : "Re-run the rescore to apply the new zones to past activities.\n")
  );
  process.exit(0);
})().catch((e) => {
  console.error("Failed:", e);
  process.exit(1);
});
