// One workout from several sources: merged on import, never duplicated. Throwaway database.
const path = require("path");
const os = require("os");
process.env.DB_PATH = path.join(os.tmpdir(), `rooka_merge_test_${process.pid}.db`);
const assert = require("assert");
const db = require("./services/db");
const merge = require("./services/activityMerge");

const run = (q, p = []) => new Promise((r, j) => db.run(q, p, (e) => (e ? j(e) : r())));
const all = (q, p = []) => new Promise((r) => db.all(q, p, (e, rows) => r(rows || [])));

console.log("🔗 Running activity merge tests...\n");

const insert = async (fields) => {
  const cols = Object.keys(fields);
  await run(`INSERT INTO activities (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`, cols.map((c) => fields[c]));
};
const visible = (uid) => all(`SELECT * FROM activities WHERE user_id = ? AND (is_hidden IS NULL OR is_hidden = 0) ORDER BY start_date`, [uid]);

(async () => {
  await new Promise((r) => setTimeout(r, 2000)); // db.js migrations
  await run(`ALTER TABLE activities ADD COLUMN max_heartrate INTEGER`).catch(() => {});
  await run(`INSERT INTO users (id, username, password_hash) VALUES (1, 'quinten', 'x'), (2, 'tharaka', 'x'), (3, 'rutger', 'x')`);

  // 1. Apple Health first, then Strava's copy of the same run (watch uploads to both).
  await insert({ id: 101, user_id: 1, name: "Cardio (Apple Watch van Quinten)", sport_type: "Cardio", healthkit_workout_id: "HK-1", start_date: "2026-10-18T13:32:00.000Z", moving_time_min: 53, distance_km: 8.0, rooka_score: 40 });
  const merged = await merge.absorbIfDuplicate(1, { source: "strava", sourceId: 9001, name: "Namiddagloop", sport_type: "Run", start_date: "2026-10-18T13:32:40Z", moving_time_min: 52, distance_km: 8.1, average_heartrate: 152, laps_json: "[]", rooka_score: 63, tss: 63 });
  assert.strictEqual(merged, 101, "Strava's copy merges into the Apple Health row");
  let rows = await visible(1);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].name, "Namiddagloop", "Strava's title wins over the generated one");
  assert.strictEqual(rows[0].sport_type, "Run", "a specific sport replaces 'Cardio'");
  assert.strictEqual(rows[0].strava_activity_id, "9001");
  assert.strictEqual(rows[0].healthkit_workout_id, "HK-1");
  assert.strictEqual(rows[0].average_heartrate, 152);
  assert.strictEqual(rows[0].rooka_score, 63);
  console.log("✅ Apple Health first, then Strava: one workout with the best of both");

  // 2. Strava first, then Apple Health: nothing new, Strava's title stays, the Apple id is recorded.
  await insert({ id: 201, user_id: 2, name: "Morning Run", sport_type: "Run", strava_activity_id: "9100", start_date: "2026-10-18T06:00:00Z", moving_time_min: 40, distance_km: 7, average_heartrate: 148, rooka_score: 50 });
  const m2 = await merge.absorbIfDuplicate(2, { source: "healthkit", sourceId: "HK-2", name: "Run (Apple Watch)", sport_type: "Run", start_date: "2026-10-18T05:59:10.000Z", moving_time_min: 41, distance_km: 6.9, rooka_score: 41 });
  assert.strictEqual(m2, 201);
  rows = await visible(2);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].name, "Morning Run");
  assert.strictEqual(rows[0].healthkit_workout_id, "HK-2");
  assert.strictEqual(rows[0].rooka_score, 50, "Strava's score (with heart rate) stays");
  console.log("✅ Strava first, then Apple Health: no duplicate, Strava's data stays");

  // 3. Not the same workout: a brick, a far-apart start, two Strava uploads, a much longer session.
  await insert({ id: 301, user_id: 3, name: "Brick bike", sport_type: "Ride", strava_activity_id: "9200", start_date: "2026-10-18T09:00:00Z", moving_time_min: 60 });
  assert.strictEqual(await merge.absorbIfDuplicate(3, { source: "healthkit", sourceId: "HK-3", sport_type: "Run", start_date: "2026-10-18T09:05:00Z", moving_time_min: 20 }), null, "a run is not a ride");
  assert.strictEqual(await merge.absorbIfDuplicate(3, { source: "healthkit", sourceId: "HK-4", sport_type: "Ride", start_date: "2026-10-18T09:40:00Z", moving_time_min: 60 }), null, "40 min apart is another workout");
  assert.strictEqual(await merge.absorbIfDuplicate(3, { source: "strava", sourceId: "9201", sport_type: "Ride", start_date: "2026-10-18T09:00:30Z", moving_time_min: 60 }), null, "two Strava uploads are two activities");
  assert.strictEqual(await merge.absorbIfDuplicate(3, { source: "healthkit", sourceId: "HK-5", sport_type: "Ride", start_date: "2026-10-18T09:10:00Z", moving_time_min: 180 }), null, "10 min later and 3x longer is another workout");
  assert.strictEqual(await merge.absorbIfDuplicate(3, { source: "strava", sourceId: "9200", sport_type: "Ride", start_date: "2026-10-18T09:00:00Z", moving_time_min: 60 }), null, "the same Strava id is the caller's own update");
  console.log("✅ Bricks, separate sessions and same-source uploads stay separate");

  // 3b. A pool swim: Garmin Connect writes it to Apple Health twice, Strava has it too. One workout.
  await run(`INSERT INTO users (id, username, password_hash) VALUES (4, 'swimmer', 'x')`);
  assert.strictEqual(await merge.absorbIfDuplicate(4, { source: "healthkit", sourceId: "HK-S1", name: "Swim (Connect)", sport_type: "Swim", start_date: "2026-10-21T07:02:05.000Z", moving_time_min: 30, distance_km: 0.9, rooka_score: 30 }), null, "first copy is new");
  await insert({ id: 501, user_id: 4, name: "Swim (Connect)", sport_type: "Swim", healthkit_workout_id: "HK-S1", start_date: "2026-10-21T07:02:05.000Z", moving_time_min: 30, distance_km: 0.9, rooka_score: 30 });
  assert.strictEqual(await merge.absorbIfDuplicate(4, { source: "healthkit", sourceId: "HK-S2", name: "Swim (Connect)", sport_type: "Swim", start_date: "2026-10-21T07:02:05.000Z", moving_time_min: 0, rooka_score: 0 }), 501, "the Apple Health twin merges");
  assert.strictEqual(await merge.absorbIfDuplicate(4, { source: "strava", sourceId: "9400", name: "30 min EVF Technique & Paddles", sport_type: "Swim", start_date: "2026-10-21T07:02:00Z", moving_time_min: 17, distance_km: 0.9, rooka_score: 20, tss: 20 }), 501, "Strava merges too");
  rows = await visible(4);
  assert.strictEqual(rows.length, 1, "one swim, not three");
  assert.strictEqual(rows[0].name, "30 min EVF Technique & Paddles");
  assert.strictEqual(rows[0].healthkit_workout_id, "HK-S1", "the first Apple id stays");
  assert.strictEqual(rows[0].strava_activity_id, "9400");
  assert.strictEqual(await merge.absorbIfDuplicate(4, { source: "healthkit", sourceId: "HK-S2", sport_type: "Swim", start_date: "2026-10-21T07:02:05.000Z", moving_time_min: 30 }), 501, "a later sync of the twin still lands on the same row");
  assert.strictEqual((await visible(4)).length, 1);
  assert.strictEqual(await merge.absorbIfDuplicate(4, { source: "healthkit", sourceId: "HK-S3", sport_type: "Swim", start_date: "2026-10-21T07:20:00.000Z", moving_time_min: 30 }), null, "an Apple Health swim 18 min later is another workout");
  console.log("✅ A swim from Apple Health twice and Strava once is one workout");

  // 4. Clean-up of an old duplicate: hidden, kudos and comments move, ids end up on the row that stays.
  await insert({ id: 401, user_id: 2, name: "Evening Run", sport_type: "Run", strava_activity_id: "9300", start_date: "2026-10-17T18:00:00Z", moving_time_min: 30, rooka_score: 35 });
  await insert({ id: 402, user_id: 2, name: "Cardio (Apple Watch)", sport_type: "Cardio", healthkit_workout_id: "HK-6", start_date: "2026-10-17T18:00:20Z", moving_time_min: 30, rooka_score: "NaN" });
  await run(`INSERT INTO kudos (activity_id, user_id) VALUES (402, 1)`);
  const [keep, dup] = await all(`SELECT * FROM activities WHERE id IN (401, 402) ORDER BY id`);
  await merge.foldExisting(keep, dup);
  const after = await all(`SELECT id, is_hidden, rooka_score, strava_activity_id, healthkit_workout_id FROM activities WHERE id IN (401, 402) ORDER BY id`);
  assert.strictEqual(after[0].healthkit_workout_id, "HK-6");
  assert.strictEqual(after[0].strava_activity_id, "9300");
  assert.strictEqual(after[1].is_hidden, 1);
  assert.strictEqual(after[1].healthkit_workout_id, null);
  assert.strictEqual((await all(`SELECT * FROM kudos WHERE activity_id = 401`)).length, 1, "kudos moved to the row that stays");
  console.log("✅ Old duplicates fold into one row, kudos included");

  console.log("\n🎉 All activity merge tests passed!");
  setTimeout(() => {
    try { require("fs").unlinkSync(process.env.DB_PATH); } catch (_) {}
    process.exit(0);
  }, 200);
})().catch((e) => {
  console.error("❌", e);
  try { require("fs").unlinkSync(process.env.DB_PATH); } catch (_) {}
  process.exit(1);
});
