#!/usr/bin/env node
/**
 * Fills an account's calendar with two weeks of realistic coach workouts, for App Store
 * screenshots: structured runs, a ride, a swim, strength sessions with exercises, rest days.
 *
 *   node scripts/seed-screenshot-plan.js --user 21 --dry-run    (show what it would write)
 *   node scripts/seed-screenshot-plan.js --user 21              (write it, starting today)
 *   node scripts/seed-screenshot-plan.js --user 21 --from 2026-11-09
 *
 * Everything already planned in those 14 days is replaced. The old rows are copied to
 * deleted_micro_plan first, like the weekly planner does, so nothing is lost.
 * Run it again to reset the account; the texts are in English.
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), quiet: true });

// Opened directly on purpose: requiring services/db would run its start-up migrations.
const sqlite3 = require("sqlite3");
const { planDayTargetRooka } = require("../services/zones");

const dbPath = process.env.DB_PATH
  ? path.resolve(__dirname, "..", process.env.DB_PATH)
  : path.join(__dirname, "..", "rooka_native.db");

const argv = process.argv.slice(2);
const arg = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? null : argv[i + 1];
};
const userArg = arg("user");
const dryRun = argv.includes("--dry-run");
if (!userArg) {
  console.error("Usage: node scripts/seed-screenshot-plan.js --user <id or username> [--from YYYY-MM-DD] [--dry-run]");
  process.exit(1);
}

// Today in Amsterdam, which is the day the app shows as today.
const todayAms = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(new Date());
const from = arg("from") || todayAms;
if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) {
  console.error(`--from must be YYYY-MM-DD, got "${from}"`);
  process.exit(1);
}
const addDays = (date, n) => new Date(Date.parse(date + "T12:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const dates = Array.from({ length: 14 }, (_, i) => addDays(from, i));

// --- Step builders -------------------------------------------------------------------------
const hr = (zone) => ({ target_type: "heart.rate.zone", zone });
const open = { target_type: "no.target" };
const mins = (type, value, target) => ({ type, condition_type: "time", condition_value: value, ...target });
const secs = (type, value, target) => ({ type, condition_type: "time_sec", condition_value: value, ...target });
const metres = (type, value, target) => ({ type, condition_type: "distance", condition_value: value, ...target });
const repeat = (iterations, steps) => ({ type: "repeat", iterations, steps });
const rest = (s) => ({ type: "rest", condition_type: "time_sec", condition_value: s, target_type: "no.target" });
// One strength exercise: N sets of reps (or seconds) with a rest between.
const lift = (exerciseName, sets, reps, { kg, seconds, restSec = 60 } = {}) =>
  repeat(sets, [
    {
      type: "interval",
      exerciseName,
      condition_type: seconds ? "time_sec" : "reps",
      condition_value: seconds || reps,
      ...(kg ? { target_type: "weight", weight: kg } : open),
    },
    rest(restSec),
  ]);

// --- The two weeks, by weekday (0 = Sunday) and week (0 or 1) -------------------------------
const SESSIONS = {
  1: [
    {
      sport: "Strength",
      description: "Full-body strength",
      details: "Your foundation session. Controlled tempo, two reps in reserve on every set. Strong hips and core keep your running form together late in a long run.",
      steps: [
        lift("Goblet Squat", 3, 10, { kg: 16, restSec: 90 }),
        lift("Romanian Deadlift", 3, 10, { kg: 20, restSec: 90 }),
        lift("Push-ups", 3, 12),
        lift("Dead Bugs", 3, 20, { restSec: 45 }),
        lift("Plank", 3, 0, { seconds: 45, restSec: 45 }),
      ],
    },
    {
      sport: "Strength",
      description: "Single-leg strength & core",
      details: "Running is a one-leg sport, so this week we train it that way. Keep the knee tracking over your toes on the split squats.",
      steps: [
        lift("Bulgarian Split Squat", 3, 8, { kg: 10, restSec: 90 }),
        lift("Hip Thrust", 3, 12, { kg: 30, restSec: 90 }),
        lift("Single-arm Dumbbell Row", 3, 10, { kg: 14 }),
        lift("Pallof Press", 3, 12, { restSec: 45 }),
        lift("Side Plank", 3, 0, { seconds: 30, restSec: 30 }),
      ],
    },
  ],
  2: [
    {
      sport: "Run",
      description: "6 × 800 m threshold intervals",
      details: "The key session of the week. Run the 800s at a strong, even effort you could hold for about an hour, and jog the recoveries truly easy.",
      steps: [
        mins("warmup", 15, hr(2)),
        repeat(6, [metres("interval", 800, hr(4)), mins("recovery", 2, hr(1))]),
        mins("cooldown", 10, hr(1)),
      ],
    },
    {
      sport: "Run",
      description: "3 × 10 min tempo",
      details: "Longer reps than last week at a slightly lower intensity. Settle into a rhythm in the first two minutes and hold it.",
      steps: [
        mins("warmup", 15, hr(2)),
        repeat(3, [mins("interval", 10, hr(3)), mins("recovery", 3, hr(1))]),
        mins("cooldown", 10, hr(1)),
      ],
    },
  ],
  3: [
    {
      sport: "Bike",
      description: "Endurance ride",
      details: "An easy aerobic ride to add volume without the impact of running. Conversational effort the whole way.",
      steps: [mins("warmup", 10, hr(1)), mins("interval", 45, hr(2)), mins("cooldown", 5, hr(1))],
    },
    {
      sport: "Bike",
      description: "Sweet-spot ride: 3 × 8 min",
      details: "Mostly easy riding with three steady blocks. Keep your cadence high and the effort controlled, not a race.",
      steps: [
        mins("warmup", 15, hr(2)),
        repeat(3, [mins("interval", 8, hr(3)), mins("recovery", 4, hr(1))]),
        mins("cooldown", 14, hr(1)),
      ],
    },
  ],
  4: [
    {
      sport: "Run",
      description: "Easy run with strides",
      details: "Easy miles after yesterday's ride. The strides at the end are short and relaxed, quick feet rather than hard effort.",
      steps: [mins("interval", 35, hr(2)), repeat(4, [secs("interval", 20, hr(5)), secs("recovery", 60, hr(1))])],
    },
    {
      sport: "Run",
      description: "Easy run with strides",
      details: "Same as last week: keep it easy so you arrive fresh for Saturday's long run.",
      steps: [mins("interval", 40, hr(2)), repeat(5, [secs("interval", 20, hr(5)), secs("recovery", 60, hr(1))])],
    },
  ],
  5: [
    {
      sport: "Rest",
      description: "Rest day",
      details: "A full rest day. Sleep, eat well and let this week's training sink in.",
      steps: [],
    },
    {
      sport: "Rest",
      description: "Rest day",
      details: "Rest before the longest run of the block. A short walk is fine, nothing more.",
      steps: [],
    },
  ],
  6: [
    {
      sport: "Run",
      description: "Long run with a steady finish",
      details: "Mostly easy, with the last 15 minutes at a steady effort. Practise your fuelling: something to eat around the 45-minute mark.",
      steps: [mins("warmup", 10, hr(1)), mins("interval", 55, hr(2)), mins("interval", 15, hr(3)), mins("cooldown", 5, hr(1))],
    },
    {
      sport: "Run",
      description: "Long aerobic run",
      details: "The longest run of the block. Keep it truly easy; time on your feet is the goal, not the pace.",
      steps: [mins("warmup", 10, hr(1)), mins("interval", 75, hr(2)), mins("cooldown", 5, hr(1))],
    },
  ],
  0: [
    {
      sport: "Swim",
      description: "Technique swim",
      details: "An easy swim for recovery. Long, smooth strokes and a relaxed exhale under water.",
      steps: [
        metres("warmup", 200, open),
        repeat(6, [metres("interval", 100, open), rest(20)]),
        metres("cooldown", 200, open),
      ],
    },
    {
      sport: "Swim",
      description: "Aerobic swim: 4 × 200 m",
      details: "Steady 200s with short rests. Count your strokes per length and try to keep the number the same on every rep.",
      steps: [
        metres("warmup", 300, open),
        repeat(4, [metres("interval", 200, open), rest(30)]),
        metres("cooldown", 200, open),
      ],
    },
  ],
};

const plan = dates.map((date, i) => {
  const weekday = new Date(date + "T12:00:00Z").getUTCDay();
  const session = SESSIONS[weekday][i < 7 ? 0 : 1];
  const steps_json = JSON.stringify(session.steps);
  return {
    date,
    sport: session.sport,
    description: session.description,
    details: session.details,
    steps_json,
    target_rooka: session.sport === "Rest" ? 0 : planDayTargetRooka({ sport: session.sport, steps_json }),
  };
});

// --- Write ---------------------------------------------------------------------------------
const db = new sqlite3.Database(dbPath, dryRun ? sqlite3.OPEN_READONLY : sqlite3.OPEN_READWRITE);
const get = (sql, p = []) => new Promise((r, j) => db.get(sql, p, (e, row) => (e ? j(e) : r(row))));
const all = (sql, p = []) => new Promise((r, j) => db.all(sql, p, (e, rows) => (e ? j(e) : r(rows || []))));
const run = (sql, p = []) => new Promise((r, j) => db.run(sql, p, function (e) { return e ? j(e) : r(this); }));

async function main() {
  const user = await get(
    `SELECT id, username FROM users WHERE deleted_at IS NULL AND (id = ? OR LOWER(username) = LOWER(?))`,
    [Number(userArg) || -1, userArg],
  );
  if (!user) throw new Error(`No user "${userArg}" in ${dbPath}`);

  const placeholders = dates.map(() => "?").join(",");
  const existing = await all(
    `SELECT date, sport, description, source FROM micro_plan WHERE user_id = ? AND date IN (${placeholders}) ORDER BY date`,
    [user.id, ...dates],
  );

  console.log(`${dryRun ? "[dry run] " : ""}${user.username} (id ${user.id}), ${dates[0]} to ${dates[13]}, database ${dbPath}`);
  console.log(`Replacing ${existing.length} planned row(s):`);
  existing.forEach((r) => console.log(`  - ${r.date} ${r.sport} "${r.description}" (${r.source})`));
  console.log("With:");
  plan.forEach((w) => console.log(`  + ${w.date} ${w.sport.padEnd(8)} ${String(w.target_rooka).padStart(3)} rooka  ${w.description}`));
  if (dryRun) return;

  await run("BEGIN");
  try {
    await run(
      `INSERT INTO deleted_micro_plan (user_id, date, sport, description, target_rooka, details, steps_json, source)
       SELECT user_id, date, sport, description, target_rooka, details, steps_json, source
       FROM micro_plan WHERE user_id = ? AND date IN (${placeholders})`,
      [user.id, ...dates],
    );
    await run(`DELETE FROM micro_plan WHERE user_id = ? AND date IN (${placeholders})`, [user.id, ...dates]);
    for (const w of plan) {
      await run(
        `INSERT INTO micro_plan (user_id, date, sport, description, target_rooka, details, steps_json, source, origin)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'coach', 'screenshot_seed')`,
        [user.id, w.date, w.sport, w.description, w.target_rooka, w.details, w.steps_json],
      );
    }
    await run("COMMIT");
  } catch (e) {
    await run("ROLLBACK");
    throw e;
  }
  console.log(`Done: ${plan.length} days written. Pull to refresh in the app.`);
}

main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => db.close());
