// Garmin Training API: rooka steps -> Garmin workouts for each sport, and the
// calendar mirror (create + schedule, update in place, delete on removal),
// permission and rate-limit handling, and the routing in /api/sync-garmin and
// /api/devices/send-workouts. Throwaway database, fake Garmin.
const path = require("path");
const os = require("os");
process.env.DB_PATH = path.join(os.tmpdir(), `rooka_garmin_training_test_${process.pid}.db`);
process.env.ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef";
process.env.JWT_SECRET = "test-secret";
process.env.GARMIN_CLIENT_ID = "test-client";
process.env.GARMIN_CLIENT_SECRET = "test-secret-value";
process.env.GARMIN_TOKEN_URL = "https://diauth.garmin.test/oauth/token";
process.env.GARMIN_API_BASE = "https://apis.garmin.test";
const assert = require("assert");
const express = require("express");
const jwt = require("jsonwebtoken");
const db = require("./services/db");
const { encrypt } = require("./services/crypto");
const zones = require("./services/zones");
const gt = require("./services/garminTraining");

const run = (q, p = []) => new Promise((r, j) => db.run(q, p, (e) => (e ? j(e) : r())));
const get = (q, p = []) => new Promise((r) => db.get(q, p, (e, row) => r(row)));
const all = (q, p = []) => new Promise((r) => db.all(q, p, (e, rows) => r(rows || [])));

console.log("⌚ Running Garmin Training API tests...\n");

// ---------------------------------------------------------------------------
// Fake Garmin Training API; localhost goes to the real server
// ---------------------------------------------------------------------------
const realFetch = global.fetch;
const OWNER = 777;
let calls = [];
let nextWorkoutId = 1001;
let nextScheduleId = 5001;
const workouts = new Map(); // workoutId -> body
const schedules = new Map(); // scheduleId -> { workoutId, date }
let permissionsReply = ["ACTIVITY_EXPORT", "WORKOUT_IMPORT"];
let forceStatus = null; // e.g. 429 or 412 for every training call
let scheduleAnswer = "bare"; // what a schedule create answers: "bare" id, or "empty" (no id at all)
let otherAccount = false; // a second Garmin account: its calendar doesn't show the first one's entries
const reply = (status, json, headers = {}) => ({
  status,
  ok: status >= 200 && status < 300,
  headers: { get: (h) => headers[h.toLowerCase()] ?? null },
  json: async () => json,
  text: async () => (json === undefined ? "" : JSON.stringify(json)),
});
global.fetch = async (url, opts = {}) => {
  if (String(url).startsWith("http://127.0.0.1")) return realFetch(url, opts);
  const u = new URL(url);
  const method = opts.method || "GET";
  const body = opts.body ? JSON.parse(opts.body) : undefined;
  calls.push({ method, path: u.pathname, body, auth: opts.headers && opts.headers.Authorization });
  if (u.pathname === "/partner-gateway/rest/user/permissions") return reply(200, permissionsReply);
  if (forceStatus) return reply(forceStatus, { error: "forced" }, { "retry-after": "120" });
  if (u.pathname === "/workoutportal/workout/v2" && method === "POST") {
    assert.strictEqual(body.workoutId, undefined, "a new workout carries no id");
    const id = nextWorkoutId++;
    workouts.set(id, body);
    return reply(200, { ...body, workoutId: id, ownerId: OWNER });
  }
  let m = u.pathname.match(/^\/training-api\/workout\/v2\/(\d+)$/);
  if (m) {
    const id = Number(m[1]);
    if (!workouts.has(id)) return reply(404, { error: "not found" });
    if (method === "GET") return reply(200, { ...workouts.get(id), workoutId: id, ownerId: OWNER });
    if (method === "PUT") {
      assert.strictEqual(body.workoutId, id, "an update names its workout");
      assert.strictEqual(body.ownerId, OWNER, "an update carries the owner id");
      workouts.set(id, body);
      return reply(204, undefined);
    }
    if (method === "DELETE") {
      workouts.delete(id);
      return reply(204, undefined);
    }
  }
  if (u.pathname === "/training-api/schedule/" && method === "POST") {
    if (!workouts.has(body.workoutId)) return reply(400, { error: "unknown workout" });
    const id = nextScheduleId++;
    schedules.set(id, { workoutId: body.workoutId, date: body.date });
    return scheduleAnswer === "empty" ? reply(200, undefined) : reply(200, id); // Garmin answers with the bare schedule id
  }
  if (u.pathname === "/training-api/schedule" && method === "GET") {
    const from = u.searchParams.get("startDate");
    const to = u.searchParams.get("endDate");
    if (otherAccount) return reply(200, []);
    return reply(200, [...schedules].filter(([, e]) => e.date >= from && e.date <= to).map(([id, e]) => ({ scheduleId: id, workoutId: e.workoutId, date: e.date })));
  }
  m = u.pathname.match(/^\/training-api\/schedule\/(\d+)$/);
  if (m && method === "DELETE") {
    const had = schedules.delete(Number(m[1]));
    return reply(had ? 204 : 404, undefined);
  }
  return reply(404, { error: "no route" });
};

const ymd = (offset) => {
  const d = new Date(`${new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Amsterdam" })}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};
const steps = (s) => s.segments[0].steps;
const flat = (list) => list.flatMap((s) => (s.type === "WorkoutRepeatStep" ? [s, ...s.steps] : [s]));
const trainingCalls = () => calls.filter((c) => !c.path.startsWith("/partner-gateway"));

// What the Training API takes, checked on every workout the fake receives.
const VALID = {
  sport: ["RUNNING", "CYCLING", "LAP_SWIMMING", "STRENGTH_TRAINING"],
  intensity: ["REST", "WARMUP", "COOLDOWN", "RECOVERY", "ACTIVE", "INTERVAL", "MAIN"],
  durationType: ["TIME", "DISTANCE", "OPEN", "REPS", "FIXED_REST"],
  targetType: [null, "OPEN", "HEART_RATE", "PACE", "SPEED", "POWER", "CADENCE"],
};
function checkWorkout(w) {
  assert.ok(VALID.sport.includes(w.sport), w.sport);
  assert.strictEqual(w.segments.length, 1);
  assert.strictEqual(w.segments[0].sport, w.sport);
  assert.ok(w.description.length <= 1024);
  assert.ok(w.workoutProvider.length <= 20 && w.workoutSourceId.length <= 20);
  const all = flat(steps(w));
  assert.ok(all.length <= gt.MAX_STEPS, `${all.length} steps`);
  all.forEach((s, i) => assert.strictEqual(s.stepOrder, i + 1, "steps are numbered in order, repeats included"));
  for (const s of all) {
    if (s.type === "WorkoutRepeatStep") {
      assert.strictEqual(s.repeatType, "REPEAT_UNTIL_STEPS_CMPLT");
      assert.ok(s.repeatValue >= 2);
      assert.ok(s.steps.every((c) => c.type === "WorkoutStep"), "repeats don't nest");
      continue;
    }
    assert.strictEqual(s.type, "WorkoutStep");
    assert.ok(VALID.intensity.includes(s.intensity), s.intensity);
    assert.ok(VALID.durationType.includes(s.durationType), s.durationType);
    assert.ok(VALID.targetType.includes(s.targetType), s.targetType);
    assert.ok(!s.description || s.description.length <= 512);
    if (s.durationType === "REPS") assert.strictEqual(w.sport, "STRENGTH_TRAINING", "reps are strength only");
    if (s.durationType === "FIXED_REST") assert.strictEqual(w.sport, "LAP_SWIMMING");
    if (w.sport === "LAP_SWIMMING") assert.strictEqual(s.targetType, null, "swim targets are secondary");
    if (s.exerciseCategory) assert.ok(!gt.NOT_IN_TRAINING_API.has(`${s.exerciseCategory}/${s.exerciseName}`), "only official exercises");
    if (s.targetValueLow != null) assert.ok(s.targetValueHigh > s.targetValueLow);
  }
}

const hrZones = [
  { zone: 1, min: 100, max: 120 },
  { zone: 2, min: 121, max: 140 },
  { zone: 3, min: 141, max: 155 },
  { zone: 4, min: 156, max: 170 },
  { zone: 5, min: 171, max: 195 },
];

(async () => {
  await new Promise((r) => setTimeout(r, 2000)); // db.js migrations

  // -------------------------------------------------------------------------
  // 1. Converter
  // -------------------------------------------------------------------------
  assert.strictEqual(gt.garminSport("Run"), "RUNNING");
  assert.strictEqual(gt.garminSport("BIKE"), "CYCLING");
  assert.strictEqual(gt.garminSport("Swim"), "LAP_SWIMMING");
  assert.strictEqual(gt.garminSport("Strength"), "STRENGTH_TRAINING");
  assert.strictEqual(gt.garminSport("Walk"), "RUNNING", "walks go out as runs, as the old push did");
  assert.strictEqual(gt.garminSport("Rest"), null);
  assert.strictEqual(gt.garminSport("Hockey"), null);

  // Run: time / distance, repeat, pace, HR with the athlete's bpm, and without.
  const runBody = gt.buildWorkout(
    {
      date: ymd(1),
      sport: "Run",
      title: "Threshold intervals",
      details: "5x1000m at threshold",
      steps: [
        { type: "warmup", exerciseName: "Easy jog", condition_type: "time", condition_value: 10, target_type: "heart.rate.zone", zone: 1 },
        {
          type: "repeat",
          iterations: 5,
          steps: [
            { type: "interval", exerciseName: "1000m Threshold", condition_type: "distance", condition_value: 1000, target_type: "pace.exact", target_value: "4:10" },
            { type: "rest", condition_type: "time_sec", condition_value: 90, target_type: "heart.rate.zone", zone: 1 },
          ],
        },
        { type: "interval", exerciseName: "Strides", condition_type: "reps", condition_value: 4, target_type: "no.target" },
        { type: "cooldown", condition_type: "time", condition_value: 10, target_type: "power.exact", target_value: "220" },
      ],
    },
    { hrZones },
  );
  checkWorkout(runBody);
  assert.strictEqual(runBody.workoutName, "rooka: Threshold intervals");
  assert.strictEqual(runBody.description, "5x1000m at threshold");
  assert.strictEqual(runBody.poolLength, null);
  let s = steps(runBody);
  assert.deepStrictEqual(
    [s[0].intensity, s[0].durationType, s[0].durationValue, s[0].targetType, s[0].targetValueLow, s[0].targetValueHigh, s[0].description],
    ["WARMUP", "TIME", 600, "HEART_RATE", 100, 120, "Easy jog"],
    "HR zone goes out as the athlete's bpm band",
  );
  assert.strictEqual(s[1].type, "WorkoutRepeatStep");
  assert.strictEqual(s[1].repeatValue, 5);
  assert.strictEqual(s[1].skipLastRestStep, false);
  const rep = s[1].steps[0];
  assert.deepStrictEqual([rep.intensity, rep.durationType, rep.durationValue, rep.durationValueType, rep.targetType], ["INTERVAL", "DISTANCE", 1000, "METER", "PACE"]);
  assert.ok(Math.abs(rep.targetValueLow - (1000 / 250) * 0.95) < 0.001 && Math.abs(rep.targetValueHigh - (1000 / 250) * 1.05) < 0.001, "4:10/km ±5% in m/s");
  assert.deepStrictEqual([s[1].steps[1].intensity, s[1].steps[1].durationType, s[1].steps[1].durationValue], ["REST", "TIME", 90]);
  assert.deepStrictEqual([s[2].durationType, s[2].description], ["OPEN", "Strides · 4x"], "reps outside strength: lap button, count in the note");
  assert.deepStrictEqual([s[3].targetType, s[3].targetValueLow, s[3].targetValueHigh], ["POWER", 198, 242]);
  const noOwnZones = gt.buildWorkout({ date: ymd(1), sport: "Run", title: "Z2", steps: [{ type: "interval", condition_type: "time", condition_value: 45, target_type: "heart.rate.zone", zone: 2 }] }, {});
  assert.deepStrictEqual([steps(noOwnZones)[0].targetType, steps(noOwnZones)[0].targetValue], ["HEART_RATE", 2], "without own zones the watch's zone 2 is used");
  console.log("✅ Run: time, distance, repeats, pace in m/s, HR as the athlete's bpm or the zone number");

  // Bike: power zones from rooka's FTP, exact watts, cadence as a secondary target.
  const powerZones = zones.buildPowerZones(250);
  const bikeBody = gt.buildWorkout(
    {
      date: ymd(1),
      sport: "Bike",
      title: "Sweet spot",
      steps: [
        { type: "warmup", exerciseName: "High Cadence Spin-Up (100-110 rpm)", condition_type: "time", condition_value: 10, target_type: "no.target" },
        { type: "repeat", iterations: 3, steps: [
          { type: "interval", condition_type: "time", condition_value: 12, target_type: "power.zone", zone: 4 },
          { type: "recovery", condition_type: "time", condition_value: 4, target_type: "power.zone", zone: 1 },
        ] },
        { type: "interval", exerciseName: "Seated climb 70 rpm", condition_type: "distance_km", condition_value: 5, target_type: "power.exact", target_value: "250W" },
        { type: "interval", condition_type: "time", condition_value: 5, target_type: "power.zone", zone: 7 },
      ],
    },
    { hrZones, powerZones },
  );
  checkWorkout(bikeBody);
  s = steps(bikeBody);
  assert.deepStrictEqual([s[0].targetType, s[0].targetValueLow, s[0].targetValueHigh], ["CADENCE", 100, 110], "cadence is the target when nothing else is");
  const z4 = powerZones.find((z) => z.zone === 4);
  assert.deepStrictEqual([s[1].steps[0].targetType, s[1].steps[0].targetValueLow, s[1].steps[0].targetValueHigh], ["POWER", z4.min, z4.max], "power zone 4 in the athlete's watts");
  assert.strictEqual(s[1].steps[1].intensity, "RECOVERY");
  assert.deepStrictEqual(
    [s[2].durationType, s[2].durationValue, s[2].targetType, s[2].targetValueLow, s[2].targetValueHigh, s[2].secondaryTargetType, s[2].secondaryTargetValueLow, s[2].secondaryTargetValueHigh],
    ["DISTANCE", 5000, "POWER", 225, 275, "CADENCE", 65, 75],
  );
  assert.deepStrictEqual([s[3].targetType, s[3].targetValue], ["POWER", 7], "an open-ended zone goes as the zone number");
  // A zone number in target_value (no `zone`) is a zone, never a 1–7 W range.
  const zoneInValue = gt.buildWorkout({ date: ymd(2), sport: "Bike", title: "Z3", steps: [{ type: "interval", condition_type: "time", condition_value: 27, target_type: "power.zone", target_value: 3 }] }, {});
  const z3 = zoneInValue.segments[0].steps[0];
  assert.deepStrictEqual([z3.targetType, z3.targetValue, z3.targetValueLow, z3.targetValueHigh], ["POWER", 3, null, null]);
  console.log("✅ Bike: power zones in the athlete's watts, exact power ±10%, cadence as a secondary target");

  // Swim: pool length, distance steps, rest at the wall, stroke/drill/equipment, secondary targets.
  const swimBody = gt.buildWorkout(
    {
      date: ymd(2),
      sport: "Swim",
      title: "CSS set",
      steps: [
        { type: "warmup", exerciseName: "Easy choice", condition_type: "distance", condition_value: 300, target_type: "no.target" },
        { type: "drill", exerciseName: "Kick with fins", condition_type: "distance", condition_value: 200, target_type: "heart.rate.zone", zone: 2 },
        { type: "repeat", iterations: 8, steps: [
          { type: "interval", exerciseName: "100m freestyle at CSS", condition_type: "distance", condition_value: 100, target_type: "pace.exact", target_value: "1:40" },
          { type: "rest", condition_type: "time_sec", condition_value: 20, target_type: "no.target" },
        ] },
        { type: "interval", exerciseName: "Pull buoy", condition_type: "distance", condition_value: 400, target_type: "no.target" },
        { type: "cooldown", exerciseName: "Backstroke easy", condition_type: "time", condition_value: 5, target_type: "no.target" },
      ],
    },
    { hrZones },
  );
  checkWorkout(swimBody);
  assert.deepStrictEqual([swimBody.poolLength, swimBody.poolLengthUnit, swimBody.segments[0].poolLength], [25, "METER", 25]);
  s = steps(swimBody);
  assert.deepStrictEqual([s[0].strokeType, s[0].durationType, s[0].durationValue], ["CHOICE", "DISTANCE", 300]);
  assert.deepStrictEqual([s[1].drillType, s[1].equipmentType, s[1].secondaryTargetType, s[1].secondaryTargetValueLow], ["KICK", "SWIM_FINS", "SWIM_INSTRUCTION", 3], "HR Z2 as 'easy'");
  assert.strictEqual(s[2].type, "WorkoutRepeatStep");
  assert.strictEqual(s[2].skipLastRestStep, true);
  const css = s[2].steps[0];
  assert.deepStrictEqual([css.strokeType, css.secondaryTargetType], ["FREESTYLE", "PACE_ZONE"]);
  assert.ok(Math.abs(css.secondaryTargetValueLow - (100 / 100) * 0.95) < 0.001, "1:40 /100m in m/s");
  assert.deepStrictEqual([s[2].steps[1].intensity, s[2].steps[1].durationType, s[2].steps[1].durationValue], ["REST", "FIXED_REST", 20]);
  assert.deepStrictEqual([s[3].intensity, s[3].durationType, s[3].durationValue], ["REST", "FIXED_REST", 20], "the rest after the last rep is repeated after the block");
  assert.deepStrictEqual([s[4].drillType, s[4].equipmentType], ["PULL", "SWIM_PULL_BUOY"]);
  assert.deepStrictEqual([s[5].strokeType, s[5].durationType, s[5].durationValue], ["BACKSTROKE", "TIME", 300]);
  console.log("✅ Swim: 25 m pool, distance steps, rest at the wall, stroke / drill / equipment, pace and intensity as secondary targets");

  // Strength: official exercises, generic ones (category only), an alias, carries, weights.
  const strengthBody = gt.buildWorkout({
    date: ymd(3),
    sport: "Strength",
    title: "Legs & core",
    steps: [
      { type: "warmup", exerciseName: "Cat Camel", condition_type: "time", condition_value: 5, target_type: "no.target" },
      { type: "repeat", iterations: 3, steps: [
        { type: "interval", exerciseName: "Barbell Back Squat", condition_type: "reps", condition_value: 10, weight: 60, target_type: "weight" },
        { type: "rest", condition_type: "time_sec", condition_value: 90, target_type: "no.target" },
      ] },
      { type: "repeat", iterations: 3, steps: [
        { type: "interval", exerciseName: "Bench Press", condition_type: "reps", condition_value: 8, weight: 50, target_type: "weight" },
        { type: "rest", condition_type: "time_sec", condition_value: 120, target_type: "no.target" },
      ] },
      { type: "interval", exerciseName: "Upright Row", condition_type: "reps", condition_value: 12, target_type: "no.target" },
      { type: "interval", exerciseName: "Farmers Carry", condition_type: "distance", condition_value: 100, weight: 24, target_type: "weight" },
      { type: "interval", exerciseName: "Plank", condition_type: "time_sec", condition_value: 60, target_type: "no.target" },
    ],
  });
  checkWorkout(strengthBody);
  s = steps(strengthBody);
  assert.deepStrictEqual([s[0].exerciseCategory, s[0].exerciseName, s[0].durationType], ["WARM_UP", "STRETCH_CAT_COW", "TIME"], "an unofficial warm-up maps to its official twin");
  const squat = s[1].steps[0];
  assert.deepStrictEqual(
    [squat.exerciseCategory, squat.exerciseName, squat.durationType, squat.durationValue, squat.weightValue, squat.weightDisplayUnit, squat.targetType],
    ["SQUAT", "BARBELL_BACK_SQUAT", "REPS", 10, 60, "KILOGRAM", "OPEN"],
  );
  assert.deepStrictEqual([s[1].steps[1].intensity, s[1].steps[1].durationType, s[1].steps[1].exerciseCategory], ["REST", "TIME", null]);
  const bench = s[2].steps[0];
  assert.deepStrictEqual([bench.exerciseCategory, bench.exerciseName, bench.description], ["BENCH_PRESS", null, "Bench Press"], "a generic exercise sends only its category");
  assert.deepStrictEqual([s[3].exerciseCategory, s[3].exerciseName], ["SHRUG", "BARBELL_UPRIGHT_ROW"]);
  assert.deepStrictEqual([s[4].durationType, s[4].description, s[4].weightValue], ["OPEN", "Farmers Carry · 100 m", 24], "a carry: lap button, distance in the note");
  assert.deepStrictEqual([s[5].exerciseCategory, s[5].exerciseName, s[5].durationType, s[5].durationValue], ["PLANK", "PLANK", "TIME", 60], "official same-name pairs stay");
  // The 67 unofficial entries are all in garmin_exercises.json, and none of them is ever sent as an exercise.
  const exercises = require("./garmin_exercises.json");
  const keys = new Set(exercises.map((e) => `${e.category_key}/${e.exercise_key}`));
  assert.strictEqual(gt.NOT_IN_TRAINING_API.size, 67);
  for (const k of gt.NOT_IN_TRAINING_API) assert.ok(keys.has(k), k);
  assert.strictEqual(exercises.length - 67, 1460, "the rest are the 1,460 official exercises");
  for (const e of exercises) {
    const r = gt.strengthExercise(e.exercise_name);
    assert.ok(r && r.exerciseCategory, e.exercise_name);
    assert.ok(!gt.NOT_IN_TRAINING_API.has(`${r.exerciseCategory}/${r.exerciseName}`), e.exercise_name);
  }
  const aliasTargets = ["SHRUG/BARBELL_UPRIGHT_ROW", "WARM_UP/STRETCH_CAT_COW", "WARM_UP/STRETCH_HAMSTRING", "WARM_UP/STRETCH_NECK"];
  for (const k of aliasTargets) assert.ok(exercises.some((e) => `${e.category_key}/${e.exercise_key}` === k), `${k} exists`);
  console.log("✅ Strength: official exercises, generic ones as category only, aliases, reps, weights, carries");

  // A repeat inside a repeat is unrolled; a huge session is cut at Garmin's 100 steps.
  const nested = gt.toGarminSteps(
    [{ type: "repeat", iterations: 2, steps: [{ type: "repeat", iterations: 3, steps: [{ type: "interval", condition_type: "time_sec", condition_value: 30, target_type: "no.target" }] }, { type: "rest", condition_type: "time", condition_value: 2 }] }],
    "RUNNING",
  );
  assert.strictEqual(nested.length, 1);
  assert.strictEqual(nested[0].repeatValue, 2);
  assert.strictEqual(nested[0].steps.length, 4, "3 unrolled intervals + the rest");
  const huge = gt.buildWorkout({
    date: ymd(3),
    sport: "Strength",
    title: "Too long",
    steps: Array.from({ length: 70 }, (_, i) => ({ type: "repeat", iterations: 3, steps: [
      { type: "interval", exerciseName: "Push Up", condition_type: "reps", condition_value: 10 + i },
      { type: "rest", condition_type: "time_sec", condition_value: 60 },
    ] })),
  });
  checkWorkout(huge);
  const hugeSteps = flat(steps(huge));
  assert.strictEqual(hugeSteps.length, 100);
  assert.strictEqual(hugeSteps[99].description, "Rest of this session: see rooka");
  console.log("✅ Nested repeats are unrolled; sessions over 100 steps are cut with a note");

  // -------------------------------------------------------------------------
  // 2. Permission: nothing goes out without WORKOUT_IMPORT
  // -------------------------------------------------------------------------
  const nowSec = Math.floor(Date.now() / 1000);
  await run(`INSERT INTO users (id, username, password_hash) VALUES (1, 'runner', 'x'), (2, 'noimport', 'x'), (3, 'unknown', 'x'), (4, 'notconnected', 'x')`);
  const connect = (id, garminId, perms) =>
    run(`INSERT INTO garmin_tokens (user_id, garmin_user_id, access_token, refresh_token, expires_at, refresh_expires_at, permissions) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, garminId, encrypt(`access-${id}`), encrypt(`refresh-${id}`), nowSec + 80000, nowSec + 80 * 86400, perms === null ? null : JSON.stringify(perms)]);
  await connect(1, "g-1", ["ACTIVITY_EXPORT", "HEALTH_EXPORT", "WORKOUT_IMPORT"]);
  await connect(2, "g-2", ["ACTIVITY_EXPORT", "HEALTH_EXPORT"]);
  await connect(3, "g-3", null);

  const planRow = (userId, offset, sport, description, stepsJson, details = "") =>
    run(`INSERT INTO micro_plan (user_id, date, sport, description, details, target_rooka, steps_json) VALUES (?, ?, ?, ?, ?, 50, ?)`,
      [userId, ymd(offset), sport, description, details, JSON.stringify(stepsJson)]);
  const easyRun = (mins) => [{ type: "interval", exerciseName: "Easy", condition_type: "time", condition_value: mins, target_type: "heart.rate.zone", zone: 2 }];
  await planRow(2, 1, "Run", "Easy run", easyRun(40));

  assert.strictEqual(await gt.isConnected(2), true);
  assert.strictEqual(await gt.canReceiveWorkouts(2), false);
  calls = [];
  let r = await gt.pushWorkouts(2, [{ date: ymd(1), sport: "Run", title: "Easy run", steps: easyRun(40) }]);
  assert.deepStrictEqual([r.status, r.body.code], [403, "GARMIN_NO_WORKOUT_IMPORT"]);
  r = await gt.pushWorkouts(2, null);
  assert.strictEqual(r.status, 403);
  await gt.syncAllGarminUsers();
  assert.strictEqual(calls.length, 0, "no Garmin calls at all without WORKOUT_IMPORT");
  assert.strictEqual((await all(`SELECT * FROM garmin_workouts WHERE user_id = 2`)).length, 0);
  console.log("✅ Without WORKOUT_IMPORT nothing is sent (no calls), and the app gets a clear 403");

  // Permissions unknown since the connect: asked once, then stored.
  assert.strictEqual(await gt.canReceiveWorkouts(3), true, "unknown counts until asked");
  permissionsReply = ["ACTIVITY_EXPORT"];
  r = await gt.pushWorkouts(3, [{ date: ymd(1), sport: "Run", title: "Easy run", steps: easyRun(30) }]);
  assert.strictEqual(r.status, 403);
  assert.deepStrictEqual(JSON.parse((await get(`SELECT permissions FROM garmin_tokens WHERE user_id = 3`)).permissions), ["ACTIVITY_EXPORT"]);
  assert.strictEqual(await gt.canReceiveWorkouts(3), false);
  permissionsReply = ["ACTIVITY_EXPORT", "WORKOUT_IMPORT"];
  console.log("✅ Unknown permissions are asked from Garmin once and stored");

  // -------------------------------------------------------------------------
  // 3. Mirror a week of mixed sessions onto the Garmin calendar
  // -------------------------------------------------------------------------
  await run(`INSERT INTO athlete_zones (user_id, sport, kind, zones_json, source) VALUES (1, 'default', 'hr', ?, 'manual')`, [JSON.stringify(hrZones)]);
  await run(`INSERT INTO athlete_metrics (user_id, metric, value) VALUES (1, 'ftp', '250')`);
  await planRow(1, 0, "Run", "Threshold intervals", [
    { type: "warmup", condition_type: "time", condition_value: 10, target_type: "no.target" },
    { type: "repeat", iterations: 5, steps: [
      { type: "interval", condition_type: "distance", condition_value: 1000, target_type: "pace.exact", target_value: "4:10" },
      { type: "rest", condition_type: "time_sec", condition_value: 90, target_type: "heart.rate.zone", zone: 1 },
    ] },
  ]);
  await planRow(1, 1, "Bike", "Brick: bike", [{ type: "interval", condition_type: "time", condition_value: 60, target_type: "power.zone", zone: 2 }]);
  await planRow(1, 1, "Run", "Brick: run off the bike", easyRun(15));
  await planRow(1, 2, "Swim", "CSS set", [{ type: "repeat", iterations: 8, steps: [
    { type: "interval", condition_type: "distance", condition_value: 100, target_type: "pace.exact", target_value: "1:40" },
    { type: "rest", condition_type: "time_sec", condition_value: 20 },
  ] }]);
  await planRow(1, 3, "Strength", "Legs", [{ type: "repeat", iterations: 3, steps: [
    { type: "interval", exerciseName: "Barbell Back Squat", condition_type: "reps", condition_value: 10, weight: 60 },
    { type: "rest", condition_type: "time_sec", condition_value: 90 },
  ] }]);
  await planRow(1, 4, "Rest", "Rest day", []);
  await planRow(1, 5, "Run", "Morning run", easyRun(30));
  await planRow(1, 5, "Run", "Evening shakeout", easyRun(20));
  await planRow(1, 6, "Bike", "Endurance ride", [{ type: "interval", condition_type: "time", condition_value: 90, target_type: "heart.rate.zone", zone: 2 }]);
  await planRow(1, 20, "Run", "Far ahead", easyRun(30));

  calls = [];
  r = await gt.pushWorkouts(1, null);
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.strictEqual(r.body.syncedCount, 8);
  const posts = calls.filter((c) => c.method === "POST" && c.path === "/workoutportal/workout/v2");
  const schedPosts = calls.filter((c) => c.method === "POST" && c.path === "/training-api/schedule/");
  assert.strictEqual(posts.length, 8, "one workout per session (rest and the far-ahead run left out)");
  assert.strictEqual(schedPosts.length, 8);
  assert.ok(calls.every((c) => c.auth === "Bearer access-1"));
  for (const w of workouts.values()) checkWorkout(w);
  const onCalendar = [...schedules.values()].map((sc) => `${sc.date} ${workouts.get(sc.workoutId).sport} ${workouts.get(sc.workoutId).workoutName}`).sort();
  assert.deepStrictEqual(onCalendar, [
    `${ymd(0)} RUNNING rooka: Threshold intervals`,
    `${ymd(1)} CYCLING rooka: Brick: bike`,
    `${ymd(1)} RUNNING rooka: Brick: run off the bike`,
    `${ymd(2)} LAP_SWIMMING rooka: CSS set`,
    `${ymd(3)} STRENGTH_TRAINING rooka: Legs`,
    `${ymd(5)} RUNNING rooka: Evening shakeout`,
    `${ymd(5)} RUNNING rooka: Morning run`,
    `${ymd(6)} CYCLING rooka: Endurance ride`,
  ]);
  let rows = await all(`SELECT * FROM garmin_workouts WHERE user_id = 1 ORDER BY workout_key`);
  assert.deepStrictEqual(rows.map((x) => x.workout_key), [
    `${ymd(0)}:running:0`, `${ymd(1)}:cycling:0`, `${ymd(1)}:running:0`, `${ymd(2)}:lap_swimming:0`,
    `${ymd(3)}:strength_training:0`, `${ymd(5)}:running:0`, `${ymd(5)}:running:1`, `${ymd(6)}:cycling:0`,
  ]);
  assert.ok(rows.every((x) => x.garmin_user_id === "g-1" && x.owner_id === String(OWNER) && x.schedule_id && x.source_hash));
  const bikeZ2 = steps(workouts.get(Number(rows[1].workout_id)))[0];
  const z2 = zones.buildPowerZones(250).find((z) => z.zone === 2);
  assert.deepStrictEqual([bikeZ2.targetType, bikeZ2.targetValueLow, bikeZ2.targetValueHigh], ["POWER", z2.min, z2.max], "power zones come from the athlete's FTP");
  console.log("✅ A week of mixed sessions lands on the Garmin calendar: one workout + schedule each, brick and double days included");

  calls = [];
  r = await gt.pushWorkouts(1, null);
  assert.deepStrictEqual([r.status, r.body.syncedCount], [200, 0]);
  assert.strictEqual(calls.length, 0, "an unchanged plan costs no calls");
  console.log("✅ Syncing an unchanged plan makes no calls");

  // A plan change updates the same Garmin workout in place.
  const swimRow = rows.find((x) => x.workout_key.endsWith(":lap_swimming:0"));
  await run(`UPDATE micro_plan SET steps_json = ?, description = 'CSS set (longer)' WHERE user_id = 1 AND sport = 'Swim'`, [
    JSON.stringify([{ type: "repeat", iterations: 10, steps: [
      { type: "interval", condition_type: "distance", condition_value: 100, target_type: "pace.exact", target_value: "1:40" },
      { type: "rest", condition_type: "time_sec", condition_value: 15 },
    ] }]),
  ]);
  calls = [];
  r = await gt.pushWorkouts(1, null);
  assert.deepStrictEqual([r.status, r.body.syncedCount], [200, 1]);
  assert.deepStrictEqual(calls.map((c) => `${c.method} ${c.path}`), [`PUT /training-api/workout/v2/${swimRow.workout_id}`], "one call: the update");
  const swimNow = workouts.get(Number(swimRow.workout_id));
  assert.strictEqual(swimNow.workoutName, "rooka: CSS set (longer)");
  assert.strictEqual(steps(swimNow)[0].repeatValue, 10);
  assert.strictEqual(schedules.size, 8, "still scheduled once");
  const swimAfter = await get(`SELECT * FROM garmin_workouts WHERE user_id = 1 AND workout_key = ?`, [swimRow.workout_key]);
  assert.strictEqual(swimAfter.workout_id, swimRow.workout_id);
  assert.notStrictEqual(swimAfter.source_hash, swimRow.source_hash);
  console.log("✅ A plan change updates the same Garmin workout in place (one PUT, same schedule)");

  // New HR zones change the converted targets, so those workouts update too.
  await run(`UPDATE athlete_zones SET zones_json = ? WHERE user_id = 1 AND kind = 'hr'`, [JSON.stringify(hrZones.map((z) => ({ ...z, min: z.min + 2, max: z.max + 2 })))]);
  calls = [];
  r = await gt.pushWorkouts(1, null);
  // The four runs and the endurance ride; not the power-zone bike, the swim or the strength session.
  assert.strictEqual(r.body.syncedCount, 5, "every session with an HR target");
  assert.ok(calls.every((c) => c.method === "PUT"));
  console.log("✅ Changed HR zones update the workouts that use them");

  // A removed session is deleted from Garmin: its schedule, then the workout.
  const evening = rows.find((x) => x.workout_key === `${ymd(5)}:running:1`);
  const ride = rows.find((x) => x.workout_key === `${ymd(6)}:cycling:0`);
  await run(`DELETE FROM micro_plan WHERE user_id = 1 AND description = 'Evening shakeout'`);
  await run(`UPDATE micro_plan SET sport = 'Rest', steps_json = '[]' WHERE user_id = 1 AND description = 'Endurance ride'`);
  calls = [];
  r = await gt.pushWorkouts(1, null);
  assert.deepStrictEqual([r.status, r.body.deletedCount, r.body.syncedCount], [200, 2, 0]);
  assert.deepStrictEqual(calls.map((c) => `${c.method} ${c.path}`).sort(), [
    `DELETE /training-api/schedule/${evening.schedule_id}`,
    `DELETE /training-api/schedule/${ride.schedule_id}`,
    `DELETE /training-api/workout/v2/${evening.workout_id}`,
    `DELETE /training-api/workout/v2/${ride.workout_id}`,
  ].sort());
  assert.ok(!workouts.has(Number(evening.workout_id)) && !workouts.has(Number(ride.workout_id)));
  assert.strictEqual(schedules.size, 6);
  assert.strictEqual((await all(`SELECT * FROM garmin_workouts WHERE user_id = 1`)).length, 6);
  console.log("✅ Removed sessions (deleted, or turned into rest) are deleted from the Garmin calendar");

  // Deleted by the athlete in Garmin Connect: the next change makes it again.
  const strengthRow = rows.find((x) => x.workout_key.endsWith(":strength_training:0"));
  workouts.delete(Number(strengthRow.workout_id));
  await run(`UPDATE micro_plan SET description = 'Legs (heavier)' WHERE user_id = 1 AND sport = 'Strength'`);
  calls = [];
  r = await gt.pushWorkouts(1, null);
  assert.strictEqual(r.body.syncedCount, 1);
  assert.deepStrictEqual(calls.map((c) => `${c.method} ${c.path}`), [
    `PUT /training-api/workout/v2/${strengthRow.workout_id}`,
    // best effort: whatever is left of the old one goes, so a false "deleted" leaves no copy
    `DELETE /training-api/schedule/${strengthRow.schedule_id}`,
    `DELETE /training-api/workout/v2/${strengthRow.workout_id}`,
    "POST /workoutportal/workout/v2",
    "GET /training-api/schedule",
    "POST /training-api/schedule/",
  ]);
  const remade = await get(`SELECT * FROM garmin_workouts WHERE user_id = 1 AND workout_key = ?`, [strengthRow.workout_key]);
  assert.notStrictEqual(remade.workout_id, strengthRow.workout_id);
  assert.strictEqual(schedules.get(Number(remade.schedule_id)).date, ymd(3));
  console.log("✅ A workout deleted in Garmin Connect is made and scheduled again on the next change");

  // An explicit send (the app's send button) always updates, even when unchanged.
  calls = [];
  r = await gt.pushWorkouts(1, [
    { date: ymd(0), sport: "RUN", title: "Threshold intervals", description: "Threshold intervals", rookaPoints: 80, steps: [{ type: "interval", condition_type: "time", condition_value: 50, target_type: "no.target" }] },
    { date: ymd(4), sport: "REST", title: "Rest", steps: [] },
  ]);
  assert.deepStrictEqual([r.status, r.body.syncedCount], [200, 1]);
  const runRow = rows.find((x) => x.workout_key === `${ymd(0)}:running:0`);
  assert.deepStrictEqual(
    calls.map((c) => `${c.method} ${c.path}`),
    [`PUT /training-api/workout/v2/${runRow.workout_id}`, "GET /training-api/schedule"],
    "same session key -> same workout (and a look at that day for duplicates)",
  );
  r = await gt.pushWorkouts(1, [{ date: ymd(4), sport: "REST", title: "Rest", steps: [] }]);
  assert.deepStrictEqual([r.status, r.body.skipped], [200, true], "nothing Garmin takes: skipped");
  console.log("✅ Explicit sends update the same workout; a rest-only send is skipped");

  // The week's "Send to device" batch skips days already past; one session is sent as asked.
  calls = [];
  r = await gt.pushWorkouts(1, [
    { date: ymd(-2), sport: "Bike", title: "Old ride", steps: [{ type: "interval", condition_type: "time", condition_value: 60, target_type: "no.target" }] },
    { date: ymd(0), sport: "RUN", title: "Threshold intervals", rookaPoints: 80, steps: [{ type: "interval", condition_type: "time", condition_value: 50, target_type: "no.target" }] },
  ]);
  assert.strictEqual(r.body.syncedCount, 1);
  assert.ok(!calls.some((c) => c.body && c.body.workoutName === "rooka: Old ride"), "the past ride isn't sent");
  console.log("✅ A week batch skips days already past");

  // Duplicates from earlier sends are cleared when the athlete sends again; other apps' workouts stay.
  const runNow = await get(`SELECT * FROM garmin_workouts WHERE user_id = 1 AND workout_key = ?`, [runRow.workout_key]);
  const extraEntry = nextScheduleId++;
  schedules.set(extraEntry, { workoutId: Number(runNow.workout_id), date: ymd(0) }); // a second entry for the same workout
  const strayId = nextWorkoutId++;
  workouts.set(strayId, { workoutName: "rooka: Threshold intervals", sport: "RUNNING", workoutProvider: "rooka" }); // an older rooka copy
  const strayEntry = nextScheduleId++;
  schedules.set(strayEntry, { workoutId: strayId, date: ymd(0) });
  const otherAppId = nextWorkoutId++;
  workouts.set(otherAppId, { workoutName: "Tempo", sport: "RUNNING", workoutProvider: "trainingpeaks" });
  const otherAppEntry = nextScheduleId++;
  schedules.set(otherAppEntry, { workoutId: otherAppId, date: ymd(0) });
  r = await gt.pushWorkouts(1, [
    { date: ymd(0), sport: "RUN", title: "Threshold intervals", rookaPoints: 80, steps: [{ type: "interval", condition_type: "time", condition_value: 50, target_type: "no.target" }] },
  ]);
  assert.strictEqual(r.status, 200);
  assert.ok(!schedules.has(extraEntry), "the second entry for the same workout is gone");
  assert.ok(!schedules.has(strayEntry) && !workouts.has(strayId), "the older rooka copy is gone");
  assert.ok(schedules.has(otherAppEntry) && workouts.has(otherAppId), "another app's workout stays");
  assert.ok(schedules.has(Number(runNow.schedule_id)) && workouts.has(Number(runNow.workout_id)), "the tracked one stays");
  console.log("✅ Sending again clears duplicate rooka entries on that day; other apps' workouts stay");

  // A schedule create answered without an id: looked up by date, so syncs don't keep adding entries.
  scheduleAnswer = "empty";
  await run(`INSERT INTO micro_plan (user_id, date, sport, description, details, target_rooka, steps_json) VALUES (1, ?, 'Run', 'Easy run', '', 50, ?)`, [
    ymd(8),
    JSON.stringify([{ type: "interval", condition_type: "time", condition_value: 40, target_type: "no.target" }]),
  ]);
  await gt.pushWorkouts(1, null);
  const easy = await get(`SELECT * FROM garmin_workouts WHERE user_id = 1 AND workout_key = ?`, [`${ymd(8)}:running:0`]);
  assert.ok(easy && easy.schedule_id && easy.source_hash, "the schedule id is found by date and stored");
  assert.strictEqual([...schedules.values()].filter((e) => e.workoutId === Number(easy.workout_id)).length, 1, "one calendar entry");
  calls = [];
  await gt.pushWorkouts(1, null);
  assert.strictEqual(calls.length, 0, "the next sync has nothing to do");
  scheduleAnswer = "bare";
  console.log("✅ A schedule answer without an id is looked up by date: no repeated calendar entries");

  // Past sessions stay in Garmin Connect; rooka stops tracking them without calls.
  await run(`UPDATE garmin_workouts SET calendar_date = ? WHERE user_id = 1 AND workout_key = ?`, [ymd(-1), runRow.workout_key]);
  await run(`DELETE FROM micro_plan WHERE user_id = 1 AND description = 'Threshold intervals'`);
  calls = [];
  await gt.pushWorkouts(1, null);
  assert.strictEqual(calls.length, 0);
  assert.strictEqual(await get(`SELECT 1 FROM garmin_workouts WHERE user_id = 1 AND workout_key = ?`, [runRow.workout_key]), undefined);
  assert.ok(workouts.has(Number(runRow.workout_id)), "not deleted from Garmin");
  console.log("✅ Past sessions are left on the Garmin calendar and no longer tracked");

  // Another Garmin account connected: old rows are dropped, not updated.
  await run(`UPDATE garmin_tokens SET garmin_user_id = 'g-other' WHERE user_id = 1`);
  otherAccount = true;
  calls = [];
  r = await gt.pushWorkouts(1, null);
  const tracked = await all(`SELECT * FROM garmin_workouts WHERE user_id = 1`);
  assert.ok(tracked.length > 0 && tracked.every((x) => x.garmin_user_id === "g-other"));
  assert.ok(
    calls.every((c) => c.method === "POST" || (c.method === "GET" && c.path === "/training-api/schedule")),
    "made fresh in the new account, nothing touched in the old one",
  );
  await run(`UPDATE garmin_tokens SET garmin_user_id = 'g-1' WHERE user_id = 1`);
  await run(`DELETE FROM garmin_workouts WHERE user_id = 1`);
  otherAccount = false;
  console.log("✅ After switching Garmin accounts the workouts are made fresh in the new one");

  // -------------------------------------------------------------------------
  // 4. Rate limits and a revoked permission
  // -------------------------------------------------------------------------
  forceStatus = 429;
  calls = [];
  r = await gt.pushWorkouts(1, [{ date: ymd(2), sport: "Swim", title: "x", steps: [] }]);
  assert.strictEqual(r.status, 503);
  assert.match(r.body.error, /Garmin is busy/);
  assert.strictEqual(trainingCalls().length, 1);
  forceStatus = null;
  calls = [];
  r = await gt.pushWorkouts(1, [{ date: ymd(2), sport: "Swim", title: "x", steps: [] }]);
  assert.strictEqual(r.status, 503);
  assert.strictEqual(calls.length, 0, "paused after Garmin's 429");
  gt._pausedUntil.clear();
  gt._resetAppPause();
  gt._appLog.length = 0;
  console.log("✅ Garmin's 429 pauses sending (503 to the app, no further calls)");

  gt._userLog.set(1, Array.from({ length: 190 }, () => Date.now()));
  calls = [];
  r = await gt.pushWorkouts(1, [{ date: ymd(2), sport: "Swim", title: "x", steps: [] }]);
  assert.strictEqual(r.status, 503);
  assert.strictEqual(calls.length, 0, "the athlete's daily budget is kept under Garmin's 200");
  gt._userLog.clear();
  console.log("✅ The per-athlete daily budget stops sends before Garmin would");

  forceStatus = 412;
  r = await gt.pushWorkouts(1, [{ date: ymd(2), sport: "Swim", title: "x", steps: [] }]);
  forceStatus = null;
  assert.deepStrictEqual([r.status, r.body.code], [403, "GARMIN_NO_WORKOUT_IMPORT"]);
  assert.strictEqual((await get(`SELECT permissions FROM garmin_tokens WHERE user_id = 1`)).permissions, null, "asked again next time");
  console.log("✅ Garmin's 412 (import no longer allowed) is reported and the permissions re-checked");

  // -------------------------------------------------------------------------
  // 5. Routing: /api/sync-garmin and /api/devices/send-workouts
  // -------------------------------------------------------------------------
  const app = express();
  app.use(express.json());
  app.use("/", require("./routes/integrations"));
  app.use("/", require("./routes/devices"));
  const server = await new Promise((resolve) => {
    const srv = app.listen(0, "127.0.0.1", () => resolve(srv));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (p, id, body) =>
    realFetch(`${base}${p}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET)}` },
      body: JSON.stringify(body),
    }).then(async (res) => ({ status: res.status, body: await res.json() }));

  const payload = { workouts: [{ date: ymd(2), sport: "SWIM", title: "CSS set", steps: [{ type: "interval", condition_type: "distance", condition_value: 1500 }] }] };
  calls = [];
  let res = await post("/api/sync-garmin", 1, payload);
  assert.strictEqual(res.status, 200, JSON.stringify(res.body));
  assert.ok(calls.some((c) => c.path === "/workoutportal/workout/v2"), "official connection -> Training API");

  calls = [];
  res = await post("/api/devices/send-workouts", 1, payload);
  const garminResult = res.body.devices.find((d) => d.id === "garmin");
  assert.deepStrictEqual([garminResult.success, garminResult.syncedCount], [true, 1]);
  assert.ok(calls.some((c) => c.method === "PUT"), "the same session updates");

  res = await post("/api/devices/send-workouts", 2, payload);
  assert.ok(!(res.body.devices || []).some((d) => d.id === "garmin"), "no WORKOUT_IMPORT: Garmin isn't a send target");
  res = await post("/api/sync-garmin", 2, payload);
  assert.deepStrictEqual([res.status, res.body.code], [403, "GARMIN_NO_WORKOUT_IMPORT"]);

  // No Garmin connection: nothing is sent, and there is no other way to Garmin any more.
  calls = [];
  res = await post("/api/sync-garmin", 4, payload);
  assert.deepStrictEqual([res.status, res.body.error], [400, "Garmin is not connected."]);
  assert.strictEqual(calls.length, 0);
  console.log("✅ /api/sync-garmin and the device fan-out send through the Training API only");

  server.close();
  console.log("\n🎉 All Garmin Training API tests passed!");
  setTimeout(() => {
    try { require("fs").unlinkSync(process.env.DB_PATH); } catch (_) {}
    process.exit(0);
  }, 200);
})().catch((e) => {
  console.error("❌", e);
  try { require("fs").unlinkSync(process.env.DB_PATH); } catch (_) {}
  process.exit(1);
});
