// The race-day workout follows the race plan's pacing, not the goal pace (tester: 20:00 5K goal,
// realistic plan about 22:00, but the watch said 4:00/km). Uses a throwaway database.
const path = require("path");
const os = require("os");
process.env.DB_PATH = path.join(os.tmpdir(), `rooka_raceday_test_${process.pid}.db`);

const assert = require("assert");
const db = require("./services/db");
const rd = require("./services/raceDayWorkout");
require("./services/racePlan"); // creates race_plans
require("./services/seasonPlan"); // creates season_meta

const dbRun = (q, p = []) => new Promise((resolve, reject) => db.run(q, p, (err) => (err ? reject(err) : resolve())));
const dbGet = (q, p = []) => new Promise((resolve) => db.get(q, p, (err, row) => resolve(row)));
const ok = (label) => console.log(`✅ ${label}`);

(async () => {
  await new Promise((r) => setTimeout(r, 400)); // let the migrations finish

  // --- Paces and segments ----------------------------------------------------------
  assert.strictEqual(rd.paceSec("4:25"), 265);
  assert.strictEqual(rd.paceSec("4:25 min/km"), 265);
  assert.strictEqual(rd.paceSec("22:00"), null, "a finish time is not a pace");
  assert.strictEqual(rd.paceSec("easy"), null);

  const steps = [
    { distance_m: 1000, pace: "4:28" },
    { distance_m: 3000, pace: "4:24" },
    { distance_m: 990, pace: "4:15" },
  ];
  const segs = rd.segmentsFromRaceSteps(steps, 5);
  assert.deepStrictEqual(segs.map((s) => s.distance_m), [1000, 3000, 1000], "the last segment absorbs rounding");
  assert.strictEqual(rd.segmentsFromRaceSteps([{ distance_m: 3000, pace: "4:20" }], 5), null, "3 of 5 km is not a race");
  assert.strictEqual(rd.segmentsFromRaceSteps([{ distance_m: 5000, pace: "fast" }], 5), null);
  ok("Race steps must cover the race with real paces");

  // Plans from before raceSteps: read the pacing table.
  const pacing = [
    { segment: "km 0–1", target: "4:25–4:30/km", note: "settle in" },
    { segment: "km 1-4", target: "4:22 min/km", note: "steady" },
    { segment: "4-5 km", target: "4:15/km or faster", note: "go" },
  ];
  const fromText = rd.segmentsFromPacingText(pacing, 5);
  assert.deepStrictEqual(fromText.map((s) => [s.distance_m, s.paceSec]), [[1000, 268], [3000, 262], [1000, 255]]);
  assert.strictEqual(rd.segmentsFromPacingText([{ segment: "Start", target: "4:20/km" }], 5), null, "no km range");
  assert.strictEqual(rd.segmentsFromPacingText([{ segment: "km 0-3", target: "4:20/km" }], 5), null, "doesn't reach the finish");
  assert.strictEqual(rd.segmentsFromPacingText([{ segment: "km 0-2", target: "4:20" }, { segment: "km 3-5", target: "4:20" }], 5), null, "gap");
  ok("Older plans: the pacing table is read when it covers the race");

  const watch = rd.buildRaceDaySteps(segs, "en");
  assert.strictEqual(watch[0].type, "warmup");
  assert.strictEqual(watch[0].condition_value, null, "warm-up is open (lap at the start line); the app shows no length");
  assert.deepStrictEqual(
    watch.slice(1, -1).map((s) => [s.exerciseName, s.condition_value, s.target_type, s.target_value]),
    [["km 0–1", 1000, "pace.exact", "4:28"], ["km 1–4", 3000, "pace.exact", "4:24"], ["km 4–5", 1000, "pace.exact", "4:15"]],
  );
  assert.strictEqual(watch[watch.length - 1].type, "cooldown");
  const { timeSec } = rd.raceTiming(segs);
  assert.strictEqual(Math.round(timeSec), 4 * 60 + 28 + 3 * 264 + 255);
  ok("Watch steps: warm-up until lap, one paced step per segment, cool-down");

  // --- On the race day --------------------------------------------------------------
  const RACE = "2026-11-27";
  await dbRun(`INSERT INTO users (id, username, email, onboarding_completed, language) VALUES (1, 'tharaka', 't@example.test', 1, 'en')`);
  await dbRun(`INSERT INTO season_meta (user_id, event_type, race_name, race_date) VALUES (1, '5k', 'Parkrun', ?)`, [RACE]);
  const goalSteps = JSON.stringify([{ type: "interval", condition_type: "distance", condition_value: 5000, target_type: "pace.exact", target_value: "4:00" }]);
  await dbRun(`INSERT INTO micro_plan (user_id, date, sport, description, target_rooka, details, steps_json, source) VALUES (1, ?, 'Run', '5K race', 58, '20:00 attempt at 4:00/km', ?, 'coach')`, [RACE, goalSteps]);
  await dbRun(`INSERT INTO micro_plan (user_id, date, sport, description, target_rooka, details, steps_json, source) VALUES (1, ?, 'Run', 'Hockey', 75, 'club', '[]', 'recurring')`, [RACE]);

  let r = await rd.applyRacePlanToRaceDay(1, RACE);
  assert.deepStrictEqual(r, { skipped: true, reason: "no race plan" });

  await dbRun(`INSERT INTO race_plans (user_id, race_date, race_name, plan_json) VALUES (1, ?, 'Parkrun', ?)`, [
    RACE,
    JSON.stringify({ summary: "Start controlled, finish strong.", pacing, raceSteps: steps }),
  ]);
  r = await rd.applyRacePlanToRaceDay(1, RACE);
  assert.strictEqual(r.applied, true);
  assert.strictEqual(r.time, "21:55");
  const race = await dbGet(`SELECT steps_json, details FROM micro_plan WHERE user_id = 1 AND date = ? AND description = '5K race'`, [RACE]);
  assert.ok(!race.steps_json.includes('"4:00"'), "the goal pace is gone from the watch steps");
  assert.ok(race.steps_json.includes('"4:24"'));
  assert.match(race.details, /Start controlled, finish strong\.\n\nRace plan: about 21:55, 4:23\/km on average/);
  const hockey = await dbGet(`SELECT steps_json FROM micro_plan WHERE user_id = 1 AND description = 'Hockey'`);
  assert.strictEqual(hockey.steps_json, "[]", "the recurring session on that day is left alone");
  ok("The race-day session gets the race plan's pacing; the goal pace is gone");

  const line = await rd.racePlanPromptLine(1, ["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", RACE, "2026-11-28", "2026-11-29"]);
  assert.match(line, /planned finish about 21:55 at 4:23\/km/);
  assert.strictEqual(await rd.racePlanPromptLine(1, ["2026-11-30", "2026-12-06"]), null);
  ok("The weekly planner is told the plan's pacing for that week");

  // A triathlon isn't one watch workout.
  await dbRun(`UPDATE season_meta SET event_type = '70.3' WHERE user_id = 1`);
  r = await rd.applyRacePlanToRaceDay(1, RACE);
  assert.strictEqual(r.skipped, true);
  await dbRun(`UPDATE season_meta SET event_type = '5k' WHERE user_id = 1`);

  // --- A moved race keeps its plan -----------------------------------------------------
  const { moveRacePlans } = require("./services/raceMoveReplan");
  await moveRacePlans(1, [{ name: "Parkrun", from: RACE, to: "2026-11-26" }]);
  assert.ok(await dbGet(`SELECT 1 FROM race_plans WHERE user_id = 1 AND race_date = '2026-11-26'`), "plan moved to the new date");
  assert.ok(!(await dbGet(`SELECT 1 FROM race_plans WHERE user_id = 1 AND race_date = ?`, [RACE])));
  ok("Moving a race moves its race plan");

  console.log("All race-day workout checks passed.");
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
