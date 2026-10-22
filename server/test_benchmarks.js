// Pending benchmark tests close themselves once the athlete has done them. Throwaway database.
const path = require("path");
const os = require("os");
process.env.DB_PATH = path.join(os.tmpdir(), `rooka_benchmark_test_${process.pid}.db`);
const assert = require("assert");
const db = require("./services/db");
const { reconcilePendingBenchmarks } = require("./services/benchmarks");

const run = (q, p = []) => new Promise((r, j) => db.run(q, p, (e) => (e ? j(e) : r())));
const get = (q, p = []) => new Promise((r) => db.get(q, p, (e, row) => r(row)));

console.log("🏁 Running benchmark completion tests...\n");

const insert = async (table, fields) => {
  const cols = Object.keys(fields);
  await run(`INSERT INTO ${table} (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`, cols.map((c) => fields[c]));
};
const pendingTest = (id, user_id, sport_type, test_name, created_at) =>
  insert("benchmark_tests", {
    id, user_id, sport_type, test_name, created_at,
    metrics_json: JSON.stringify({ status: "Pending Completion", test: test_name }),
    coach_notes: "Initial Onboarding Baseline Assessment",
  });
const test = (id) => get(`SELECT * FROM benchmark_tests WHERE id = ?`, [id]);

(async () => {
  await new Promise((r) => setTimeout(r, 2000)); // db.js migrations
  await run(`ALTER TABLE activities ADD COLUMN max_heartrate INTEGER`).catch(() => {});
  await run(`ALTER TABLE activities ADD COLUMN average_watts REAL`).catch(() => {});
  await run(`INSERT INTO users (id, username, password_hash) VALUES (1, 'rutger', 'x'), (2, 'felix', 'x'), (3, 'sam', 'x')`);

  // 1. Registered at onboarding, easy runs in between, the test itself weeks later (pushed workout keeps its title).
  await pendingTest(1, 1, "Run", "5k Pace & HR Baseline Test", "2026-08-24 09:00:00");
  await insert("activities", { id: 11, user_id: 1, name: "Morning Run", sport_type: "Run", start_date: "2026-08-20T07:00:00Z", moving_time_min: 40, distance_km: 7 });
  await insert("activities", { id: 12, user_id: 1, name: "Easy Run", sport_type: "Run", start_date: "2026-09-02T07:00:00Z", moving_time_min: 45, distance_km: 7.5 });
  await insert("activities", { id: 13, user_id: 1, name: "5k Pace & HR Baseline Test", sport_type: "Run", start_date: "2026-10-17T18:58:00Z", moving_time_min: 35.57, distance_km: 6.8, average_heartrate: 171.4, max_heartrate: 186 });
  assert.strictEqual(await reconcilePendingBenchmarks(1), 1);
  let t = await test(1);
  assert.strictEqual(t.completed_at, "2026-10-17T18:58:00Z", "completed on the day of the test, not the easy run");
  const m = JSON.parse(t.metrics_json);
  assert.deepStrictEqual(m, { distance: "6.80 km", time: "35:34", pace: "5:14 /km", avg_hr: 171, max_hr: 186, measured: "whole activity", activity: "5k Pace & HR Baseline Test" });
  console.log("✅ The test activity closes the pending benchmark; without laps its whole numbers stand in, and the card says so");

  assert.strictEqual(await reconcilePendingBenchmarks(1), 0, "nothing left to close");
  console.log("✅ Running it again changes nothing");

  // 2. No matching title: the ride on the day the plan held the benchmark session counts.
  await pendingTest(2, 2, "Bike", "20-Min FTP Baseline Test", "2026-08-21 14:00:00");
  await insert("micro_plan", { user_id: 2, date: "2026-08-23", sport: "Bike", description: "Benchmark Assessment: 20-Min FTP Baseline Test", target_rooka: 60 });
  await insert("activities", { id: 21, user_id: 2, name: "Lunch Ride", sport_type: "Ride", start_date: "2026-08-22T12:00:00Z", moving_time_min: 60, distance_km: 30 });
  await insert("activities", { id: 22, user_id: 2, name: "Zwift - Watopia", sport_type: "VirtualRide", start_date: "2026-08-23T18:00:00Z", moving_time_min: 50, distance_km: 28, average_watts: 212.6 });
  assert.strictEqual(await reconcilePendingBenchmarks(2), 1);
  t = await test(2);
  assert.strictEqual(t.completed_at, "2026-08-23T18:00:00Z");
  assert.strictEqual(JSON.parse(t.metrics_json).avg_watts, 213);
  console.log("✅ Without a matching title, the ride on the planned benchmark day counts");

  // 3. Wrong sport, too short, or before the test existed: still pending.
  await pendingTest(3, 3, "Run", "5k Pace & HR Baseline Test", "2026-09-10 08:00:00");
  await insert("micro_plan", { user_id: 3, date: "2026-09-11", sport: "Run", description: "Benchmark Assessment: 5k Pace & HR Test", target_rooka: 50 });
  await insert("activities", { id: 31, user_id: 3, name: "5k Pace & HR Baseline Test", sport_type: "Run", start_date: "2026-09-01T07:00:00Z", moving_time_min: 30, distance_km: 6 });
  await insert("activities", { id: 32, user_id: 3, name: "Evening Ride", sport_type: "Ride", start_date: "2026-09-11T18:00:00Z", moving_time_min: 60, distance_km: 25 });
  await insert("activities", { id: 33, user_id: 3, name: "Shakeout", sport_type: "Run", start_date: "2026-09-11T07:00:00Z", moving_time_min: 8, distance_km: 1.4 });
  assert.strictEqual(await reconcilePendingBenchmarks(3), 0);
  t = await test(3);
  assert.strictEqual(t.completed_at, null);
  assert.strictEqual(JSON.parse(t.metrics_json).status, "Pending Completion");
  console.log("✅ A ride, an 8-minute shakeout or a run before the test was set do not close it");

  // 4. The laps arrive (the activity is opened, or Strava sent them): the test is measured
  // again over its own 5 km. Warm-up, three strides with rests, 5 x 1 km, cool-down (Garmin's 14 laps).
  const lap = (distance, elapsed_time, average_heartrate, max_heartrate) => ({ distance, elapsed_time, moving_time: elapsed_time, average_heartrate, max_heartrate });
  const garminLaps = [
    lap(1000, 400, 140, 150), lap(40, 14, 145, 146),
    lap(80, 20.2, 150, 160), lap(70, 45, 145, 158), lap(80, 18.7, 155, 165), lap(70, 45, 150, 162), lap(80, 19, 158, 168), lap(70, 45, 152, 165),
    lap(1000, 275, 165, 170), lap(1000, 272, 168, 172), lap(1000, 275, 170, 175), lap(1000, 272, 172, 178), lap(1000, 273.9, 176, 185),
    lap(280, 166.9, 160, 176),
  ];
  await run(`UPDATE activities SET laps_json = ? WHERE id = 13`, [JSON.stringify(garminLaps)]);
  await reconcilePendingBenchmarks(1);
  t = await test(1);
  assert.strictEqual(t.activity_id, 13, "linked to its activity from now on");
  assert.deepStrictEqual(JSON.parse(t.metrics_json), {
    distance: "5.00 km", time: "22:48", pace: "4:34 /km", avg_hr: 170, max_hr: 185, measured: "laps 9-13 of 14", activity: "5k Pace & HR Baseline Test",
  });
  console.log("✅ Once laps arrive, the 5k is measured over its own 5 km: no warm-up, strides or cool-down in it");

  // 5. Laps that never make 5 km, but Strava's best efforts are there: the 5k effort's time, no heart rate.
  await pendingTest(4, 2, "Run", "5k Pace & HR Baseline Test", "2026-10-01 08:00:00");
  await insert("activities", {
    id: 41, user_id: 2, name: "5k Pace & HR Baseline Test", sport_type: "Run", start_date: "2026-10-05T07:00:00Z", moving_time_min: 50, distance_km: 9, average_heartrate: 150,
    laps_json: JSON.stringify([lap(4500, 1500, 150, 170), lap(4500, 1500, 150, 170)]),
    sets_json: JSON.stringify([{ name: "1k", distance: 1000, elapsed_time: 250 }, { name: "5k", distance: 5000, elapsed_time: 1380, pr_rank: 1 }]),
  });
  assert.strictEqual(await reconcilePendingBenchmarks(2), 1);
  assert.deepStrictEqual(JSON.parse((await test(4)).metrics_json), {
    distance: "5.00 km", time: "23:00", pace: "4:36 /km", measured: "Strava best effort", activity: "5k Pace & HR Baseline Test",
  });
  console.log("✅ Without laps that make the distance, Strava's best effort gives the time, and no muddled heart rate");

  // 6. A manually logged result is the athlete's own: never measured again.
  await insert("benchmark_tests", {
    id: 5, user_id: 1, sport_type: "Run", test_name: "5k Time Trial", completed_at: "2026-10-17T18:58:00Z",
    metrics_json: JSON.stringify({ time: "21:30", activity: "5k Pace & HR Baseline Test" }), coach_notes: "Manually logged benchmark baseline",
  });
  await reconcilePendingBenchmarks(1);
  assert.deepStrictEqual(JSON.parse((await test(5)).metrics_json), { time: "21:30", activity: "5k Pace & HR Baseline Test" });
  console.log("✅ Manually logged results stay as logged");

  console.log("\n🎉 All benchmark completion tests passed!");
  process.exit(0);
})().catch((e) => {
  console.error("❌", e);
  process.exit(1);
});
