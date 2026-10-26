// Garmin official API, the data pushes: activity summaries and details into activities
// (mapped, merged with an existing Strava copy, attributed to the Garmin device) and
// health summaries into biometrics. Fake pushes over HTTP, throwaway database.
const path = require("path");
const os = require("os");
process.env.DB_PATH = path.join(os.tmpdir(), `rooka_garmin_ingest_test_${process.pid}.db`);
process.env.ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef";
process.env.JWT_SECRET = "test-secret";
process.env.GARMIN_WEBHOOK_TOKEN = "hook-secret";
const assert = require("assert");
const express = require("express");
const db = require("./services/db");
const ingest = require("./services/garminIngest");
const merge = require("./services/activityMerge");
require("./services/athleteFacts"); // creates athlete_facts, as the server does

const run = (q, p = []) => new Promise((r, j) => db.run(q, p, (e) => (e ? j(e) : r())));
const get = (q, p = []) => new Promise((r) => db.get(q, p, (e, row) => r(row)));
const all = (q, p = []) => new Promise((r) => db.all(q, p, (e, rows) => r(rows || [])));

console.log("⌚ Running Garmin ingestion tests...\n");

// The follow-up steps, watched instead of run (no AI, no push notifications).
const analyses = [];
const totals = [];
const events = [];
const realUtils = require("./services/utils");
const fakeUtils = {
  ...realUtils,
  updateUserRookaAndCheckLevel: (userId) => totals.push(userId),
  processActivityCoachAnalysis: async (userId, activity) => analyses.push({ userId, activity }),
};
ingest.deps.utils = () => fakeUtils;
ingest.deps.sendSSEEvent = (userId, name, data) => events.push({ userId, name, data });

/** Google polyline decoder, to check the stored route. */
function decodePolyline(str) {
  const points = [];
  let i = 0;
  let lat = 0;
  let lng = 0;
  const next = () => {
    let result = 0;
    let shift = 0;
    let b;
    do {
      b = str.charCodeAt(i++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (i < str.length) {
    lat += next();
    lng += next();
    points.push([lat / 1e5, lng / 1e5]);
  }
  return points;
}

const nowSec = Math.floor(Date.now() / 1000);
const HOUR = 3600;

/** Twenty minutes of 10-second samples: 3 m/s, two laps (140 bpm / 200 W, then 160 bpm / 300 W). */
function samplesFrom(start) {
  const list = [];
  for (let t = 0; t < 1200; t += 10) {
    const second = t >= 600;
    list.push({
      startTimeInSeconds: start + t,
      latitudeInDegree: 52.37 + t / 100000,
      longitudeInDegree: 4.89 + t / 200000,
      heartRate: second ? 160 : 140,
      powerInWatts: second ? 300 : 200,
      totalDistanceInMeters: 3 * t,
      timerDurationInSeconds: t,
    });
  }
  return list;
}

const summary = (fields) => ({
  userId: "garmin-u1",
  startTimeOffsetInSeconds: 3600,
  ...fields,
});

(async () => {
  await new Promise((r) => setTimeout(r, 2000)); // db.js migrations
  // db.js adds these before it creates activities, so a fresh database lacks them.
  for (const col of ["average_watts REAL", "max_heartrate REAL", "polyline TEXT"]) {
    await run(`ALTER TABLE activities ADD COLUMN ${col}`).catch(() => {});
  }
  await run(`INSERT INTO users (id, username, password_hash, ai_consent, deleted_at) VALUES
      (1, 'garminrunner', 'x', 1, NULL),
      (2, 'activityonly', 'x', NULL, NULL),
      (3, 'gone', 'x', 1, '2026-10-01'),
      (4, 'healthonly', 'x', 1, NULL)`);
  const tokenRow = (userId, garminId, perms) =>
    run(
      `INSERT INTO garmin_tokens (user_id, garmin_user_id, access_token, refresh_token, expires_at, permissions) VALUES (?, ?, 'a', 'r', 0, ?)`,
      [userId, garminId, JSON.stringify(perms)],
    );
  await tokenRow(1, "garmin-u1", ["ACTIVITY_EXPORT", "HEALTH_EXPORT", "WORKOUT_IMPORT"]);
  await tokenRow(2, "garmin-u2", ["ACTIVITY_EXPORT"]);
  await tokenRow(3, "garmin-u3", ["ACTIVITY_EXPORT", "HEALTH_EXPORT"]);
  await tokenRow(4, "garmin-u4", ["HEALTH_EXPORT"]);

  const app = express();
  app.use(express.json({ limit: "50mb" }));
  app.use("/", require("./routes/garmin"));
  const server = await new Promise((r) => {
    const s = app.listen(0, "127.0.0.1", () => r(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const push = async (kind, body) => {
    const res = await fetch(`${base}/api/webhooks/garmin/hook-secret/${kind}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    assert.strictEqual(res.status, 200, `${kind} push is answered 200`);
    await new Promise((r) => setTimeout(r, 100)); // processing runs after the 200
    await ingest.idle();
  };
  const activitiesOf = (uid) => all(`SELECT * FROM activities WHERE user_id = ? ORDER BY start_date`, [uid]);

  // -------------------------------------------------------------------------
  // 1. Mapping
  // -------------------------------------------------------------------------
  assert.strictEqual(ingest.garminSport("TRAIL_RUNNING"), "Run");
  assert.strictEqual(ingest.garminSport("TREADMILL_RUNNING"), "Run");
  assert.strictEqual(ingest.garminSport("ROAD_BIKING"), "Bike");
  assert.strictEqual(ingest.garminSport("VIRTUAL_RIDE"), "Bike");
  assert.strictEqual(ingest.garminSport("ENDURO_MTB"), "Bike");
  assert.strictEqual(ingest.garminSport("LAP_SWIMMING"), "Swim");
  assert.strictEqual(ingest.garminSport("HIKING"), "Walk");
  assert.strictEqual(ingest.garminSport("STRENGTH_TRAINING"), "Strength");
  assert.strictEqual(ingest.garminSport("YOGA"), "Mobility");
  assert.strictEqual(ingest.garminSport("STAIR_CLIMBING"), "Cardio");
  assert.strictEqual(ingest.garminSport("INDOOR_ROWING"), "Cardio");
  assert.strictEqual(ingest.garminSport("RUCKING"), "Walk");
  console.log("✅ Garmin activity types map to rooka's sports");

  // -------------------------------------------------------------------------
  // 2. An activity summary, then its details
  // -------------------------------------------------------------------------
  const rideStart = nowSec - 3 * HOUR;
  await push("activities", {
    activities: [
      summary({
        summaryId: "7001",
        activityId: 7001,
        activityName: "Amstel Loop",
        activityType: "ROAD_BIKING",
        startTimeInSeconds: rideStart,
        durationInSeconds: 1200,
        distanceInMeters: 3600,
        averageHeartRateInBeatsPerMinute: 150,
        maxHeartRateInBeatsPerMinute: 171,
        totalElevationGainInMeters: 42.4,
        deviceName: "Edge 840",
      }),
    ],
  });
  let rows = await activitiesOf(1);
  assert.strictEqual(rows.length, 1);
  let ride = rows[0];
  assert.strictEqual(ride.garmin_activity_id, "7001");
  assert.strictEqual(ride.name, "Amstel Loop");
  assert.strictEqual(ride.sport_type, "Bike");
  assert.strictEqual(ride.start_date, new Date(rideStart * 1000).toISOString());
  assert.strictEqual(ride.moving_time_min, 20);
  assert.strictEqual(ride.distance_km, 3.6);
  assert.strictEqual(ride.elevation_m, 42);
  assert.strictEqual(ride.average_heartrate, 150);
  assert.strictEqual(ride.max_heartrate, 171);
  assert.strictEqual(ride.garmin_device, "Edge 840");
  assert.ok(ride.rooka_score > 0, "scored like other imports");
  assert.strictEqual(ride.tss, Math.round((20 / 60) * 50));
  assert.strictEqual(ingest.garminAttribution(ride), "Garmin Edge 840");
  assert.deepStrictEqual(totals, [1], "the rooka total is updated");
  assert.ok(events.some((e) => e.userId === 1 && e.name === "sync_complete" && e.data.provider === "garmin"), "the app is told to refresh");
  assert.strictEqual(analyses.length, 1, "a new recent workout gets a coach reaction (consent given)");
  assert.strictEqual(analyses[0].activity.id, ride.id);
  assert.ok(analyses[0].activity.start_date_local.startsWith(new Date((rideStart + 3600) * 1000).toISOString().slice(0, 16)), "with the watch's local time");
  console.log("✅ An activity summary becomes a workout with sport, time, distance, heart rate, device and score");

  await push("activity-details", {
    activityDetails: [
      {
        userId: "garmin-u1",
        summaryId: "7001-detail",
        activityId: 7001,
        // No name or type in this one: the summary's stay.
        summary: {
          startTimeInSeconds: rideStart,
          startTimeOffsetInSeconds: 3600,
          durationInSeconds: 1200,
          distanceInMeters: 3600,
          averageHeartRateInBeatsPerMinute: 150,
          maxHeartRateInBeatsPerMinute: 171,
          deviceName: "Edge 840",
        },
        samples: samplesFrom(rideStart),
        laps: [{ startTimeInSeconds: rideStart }, { startTimeInSeconds: rideStart + 600 }],
      },
    ],
  });
  rows = await activitiesOf(1);
  assert.strictEqual(rows.length, 1, "the details update the same workout");
  ride = rows[0];
  assert.deepStrictEqual([ride.name, ride.sport_type], ["Amstel Loop", "Bike"], "a details push without name or type keeps them");
  assert.ok(ride.average_watts >= 245 && ride.average_watts <= 255, `average power from the samples (${ride.average_watts})`);
  const laps = JSON.parse(ride.laps_json);
  assert.strictEqual(laps.length, 2);
  assert.deepStrictEqual(
    laps.map((l) => [l.lap_index, l.distance, l.elapsed_time, l.average_heartrate, l.max_heartrate]),
    [
      [1, 1800, 600, 140, 140],
      [2, 1770, 600, 160, 160],
    ],
  );
  assert.strictEqual(laps[0].average_speed, 3);
  const route = decodePolyline(ride.polyline);
  assert.ok(route.length >= 100, "the route is kept");
  assert.deepStrictEqual(route[0], [52.37, 4.89]);
  assert.strictEqual(analyses.length, 1, "no second coach reaction for the update");
  console.log("✅ Activity details add power, laps (as Strava laps are stored) and the route");

  // Details first, summary after: still one workout, nothing lost.
  const runStart = nowSec - 2 * HOUR;
  await push("activity-details", {
    activityDetails: [
      {
        userId: "garmin-u1",
        summaryId: "7002-detail",
        activityId: 7002,
        summary: { activityType: "RUNNING", startTimeInSeconds: runStart, durationInSeconds: 1800, distanceInMeters: 5000, deviceName: "Garmin Forerunner 965" },
        samples: samplesFrom(runStart),
        laps: [],
      },
    ],
  });
  await push("activities", {
    activities: [
      summary({ summaryId: "7002", activityId: 7002, activityName: "Evening Run", activityType: "RUNNING", startTimeInSeconds: runStart, durationInSeconds: 1800, distanceInMeters: 5000, averageHeartRateInBeatsPerMinute: 152, deviceName: "Garmin Forerunner 965" }),
    ],
  });
  const runRows = (await activitiesOf(1)).filter((r) => r.garmin_activity_id === "7002");
  assert.strictEqual(runRows.length, 1);
  assert.strictEqual(runRows[0].name, "Evening Run", "the summary's title replaces the generated one");
  assert.strictEqual(runRows[0].average_heartrate, 152);
  assert.strictEqual(runRows[0].laps_json, "[]", "details without laps are kept as no laps");
  assert.ok(runRows[0].polyline, "the route from the details stays");
  assert.strictEqual(ingest.garminAttribution(runRows[0]), "Garmin Forerunner 965", "no double 'Garmin'");
  assert.strictEqual(analyses.length, 2);
  console.log("✅ Details before the summary: one workout, the summary fills the title");

  // -------------------------------------------------------------------------
  // 3. Dedup against Strava, both ways
  // -------------------------------------------------------------------------
  // Strava first (rooka already wrote its title back and the coach reacted).
  const stravaStart = nowSec - 26 * HOUR;
  await run(
    `INSERT INTO activities (user_id, strava_activity_id, name, sport_type, start_date, moving_time_min, distance_km, average_heartrate, rooka_score, tss, coach_analyzed)
     VALUES (1, 's-77', 'Tempo Tuesday 🔥 rooka', 'Ride', ?, 61, 30.2, 145, 70, 50, 1)`,
    [new Date(stravaStart * 1000).toISOString()],
  );
  await push("activities", {
    activities: [summary({ summaryId: "7003", activityId: 7003, activityName: "Haarlem Cycling", activityType: "CYCLING", startTimeInSeconds: stravaStart + 40, durationInSeconds: 3700, distanceInMeters: 30150, averageHeartRateInBeatsPerMinute: 146, deviceName: "Edge 1050" })],
  });
  await push("activity-details", {
    activityDetails: [
      { userId: "garmin-u1", activityId: 7003, summaryId: "7003-detail", summary: { activityType: "CYCLING", startTimeInSeconds: stravaStart + 40, durationInSeconds: 3700, deviceName: "Edge 1050" }, samples: samplesFrom(stravaStart + 40), laps: [{ startTimeInSeconds: stravaStart + 40 }, { startTimeInSeconds: stravaStart + 640 }] },
    ],
  });
  const strava = (await activitiesOf(1)).filter((r) => r.strava_activity_id === "s-77" || r.garmin_activity_id === "7003");
  assert.strictEqual(strava.length, 1, "Garmin's copy merges into the Strava workout");
  assert.strictEqual(strava[0].strava_activity_id, "s-77");
  assert.strictEqual(strava[0].garmin_activity_id, "7003");
  assert.strictEqual(strava[0].name, "Tempo Tuesday 🔥 rooka", "Strava's (rooka's) title stays");
  assert.strictEqual(strava[0].moving_time_min, 61, "Strava's time stays");
  assert.strictEqual(strava[0].rooka_score, 70, "Strava's score stays");
  assert.ok(strava[0].average_watts > 0 && JSON.parse(strava[0].laps_json).length === 2 && strava[0].polyline, "Garmin fills power, laps and route Strava lacked");
  assert.strictEqual(ingest.garminAttribution(strava[0]), "Garmin Edge 1050", "a merged workout still credits Garmin");
  assert.strictEqual(analyses.length, 2, "already analysed: no second coach reaction");
  console.log("✅ Strava first, then Garmin: one workout, Strava's title and score, Garmin's power, laps and device");

  // Garmin first, then Strava's webhook (merge as routes/integrations does it).
  const mergedId = await merge.absorbIfDuplicate(1, {
    source: "strava",
    sourceId: "s-78",
    name: "Avondrit",
    sport_type: "Run",
    start_date: new Date((runStart + 30) * 1000).toISOString(),
    moving_time_min: 29.5,
    distance_km: 5.02,
    average_heartrate: 151,
    rooka_score: 33,
    tss: 25,
  });
  const runRow = (await activitiesOf(1)).find((r) => r.garmin_activity_id === "7002");
  assert.strictEqual(mergedId, runRow.id, "Strava's copy merges into the Garmin workout");
  assert.strictEqual(runRow.name, "Avondrit", "Strava's title wins over Garmin's");
  assert.strictEqual(runRow.strava_activity_id, "s-78");
  assert.strictEqual(ingest.garminAttribution(runRow), "Garmin Forerunner 965");
  // A later Garmin update no longer overrides what Strava brought.
  await push("activities", {
    activities: [summary({ summaryId: "7002", activityId: 7002, activityName: "Evening Run (edited)", activityType: "RUNNING", startTimeInSeconds: runStart, durationInSeconds: 1800, distanceInMeters: 5000, deviceName: "Garmin Forerunner 965" })],
  });
  assert.strictEqual((await get(`SELECT name FROM activities WHERE id = ?`, [runRow.id])).name, "Avondrit");
  console.log("✅ Garmin first, then Strava: one workout, Strava's title wins and Garmin is still credited");

  // -------------------------------------------------------------------------
  // 4. Who gets what
  // -------------------------------------------------------------------------
  const before = (await all(`SELECT id FROM activities`)).length;
  await push("activities", {
    activities: [
      { userId: "garmin-nobody", summaryId: "9001", activityId: 9001, activityType: "RUNNING", startTimeInSeconds: nowSec - HOUR, durationInSeconds: 600 },
      { userId: "garmin-u3", summaryId: "9002", activityId: 9002, activityType: "RUNNING", startTimeInSeconds: nowSec - HOUR, durationInSeconds: 600 },
      { summaryId: "9003", activityId: 9003, activityType: "RUNNING", startTimeInSeconds: nowSec - HOUR, durationInSeconds: 600 },
    ],
  });
  await push("dailies", { dailies: [{ userId: "garmin-nobody", calendarDate: "2026-10-20", steps: 5000 }] });
  assert.strictEqual((await all(`SELECT id FROM activities`)).length, before, "unknown, deleted and anonymous Garmin users are ignored");
  assert.strictEqual((await all(`SELECT id FROM biometrics`)).length, 0);
  console.log("✅ Pushes for unknown or deleted accounts are ignored");

  await push("activities", {
    activities: [{ userId: "garmin-u2", summaryId: "8001", activityId: 8001, activityType: "WALKING", startTimeInSeconds: nowSec - HOUR, durationInSeconds: 1500, distanceInMeters: 2000 }],
  });
  await push("dailies", { dailies: [{ userId: "garmin-u2", calendarDate: "2026-10-25", steps: 8000 }] });
  const walk = await activitiesOf(2);
  assert.strictEqual(walk.length, 1, "activities come in with ACTIVITY_EXPORT");
  assert.strictEqual(walk[0].sport_type, "Walk");
  assert.strictEqual(walk[0].name, "Walking", "named after the type when Garmin has no name");
  assert.strictEqual(ingest.garminAttribution(walk[0]), "Garmin", "no device model: plain 'Garmin'");
  assert.strictEqual((await all(`SELECT id FROM biometrics WHERE user_id = 2`)).length, 0, "no HEALTH_EXPORT, no health data");
  assert.ok(!analyses.some((a) => a.userId === 2), "no coach reaction without AI consent");
  console.log("✅ Permissions decide what is stored; no AI without consent");

  await run(`UPDATE garmin_tokens SET permissions = ? WHERE user_id = 2`, [JSON.stringify(["HEALTH_EXPORT"])]);
  await push("activities", {
    activities: [{ userId: "garmin-u2", summaryId: "8002", activityId: 8002, activityType: "WALKING", startTimeInSeconds: nowSec - 1800, durationInSeconds: 900 }],
  });
  assert.strictEqual((await activitiesOf(2)).length, 1, "ACTIVITY_EXPORT withdrawn: no more activities");
  console.log("✅ A withdrawn ACTIVITY_EXPORT stops activities");

  // -------------------------------------------------------------------------
  // 5. Which workouts
  // -------------------------------------------------------------------------
  const triStart = nowSec - 5 * HOUR;
  await push("activities", {
    activities: [
      summary({ summaryId: "7100", activityId: 7100, activityType: "MULTI_SPORT", isParent: true, startTimeInSeconds: triStart, durationInSeconds: 4000 }),
      summary({ summaryId: "7101", activityId: 7101, activityType: "OPEN_WATER_SWIMMING", parentSummaryId: "7100", startTimeInSeconds: triStart, durationInSeconds: 1200, distanceInMeters: 1500 }),
      summary({ summaryId: "7102", activityId: 7102, activityType: "SWIM_TO_BIKE_TRANSITION_V2", parentSummaryId: "7100", startTimeInSeconds: triStart + 1200, durationInSeconds: 120 }),
      summary({ summaryId: "7103", activityId: 7103, activityType: "ROAD_BIKING", parentSummaryId: "7100", startTimeInSeconds: triStart + 1320, durationInSeconds: 2680, distanceInMeters: 40000 }),
    ],
  });
  const tri = (await activitiesOf(1)).filter((r) => ["7100", "7101", "7102", "7103"].includes(r.garmin_activity_id));
  assert.deepStrictEqual(tri.map((r) => [r.garmin_activity_id, r.sport_type]), [["7101", "Swim"], ["7103", "Bike"]]);
  console.log("✅ A multisport race comes in as its legs, without the parent or the transitions");

  const oldStart = nowSec - 5 * 24 * HOUR;
  const analysedBefore = analyses.length;
  await push("activities", { activities: [summary({ summaryId: "7200", activityId: 7200, activityType: "RUNNING", startTimeInSeconds: oldStart, durationInSeconds: 2400 })] });
  assert.ok((await activitiesOf(1)).some((r) => r.garmin_activity_id === "7200"), "an old workout is stored");
  assert.strictEqual(analyses.length, analysedBefore, "but gets no 'you just did this' coach reaction");
  console.log("✅ A workout from days ago is stored without a coach reaction");

  // Edits on the Connect website update what we have and never add.
  await push("manually-updated-activities", {
    manuallyUpdatedActivities: [
      summary({ summaryId: "7200", activityId: 7200, activityName: "Long Run (fixed)", activityType: "RUNNING", startTimeInSeconds: oldStart, durationInSeconds: 2400, distanceInMeters: 8000, manual: true }),
      summary({ summaryId: "EXAMPLE_404", activityType: "RUNNING", startTimeInSeconds: oldStart + 900, durationInSeconds: 600, manual: true }),
    ],
  });
  const edited = (await activitiesOf(1)).filter((r) => r.garmin_activity_id === "7200" || r.garmin_activity_id === "EXAMPLE_404");
  assert.deepStrictEqual(edited.map((r) => [r.name, r.distance_km]), [["Long Run (fixed)", 8]]);
  console.log("✅ Manual edits update the workout and never add one");

  // Linked away by the athlete: the hidden row isn't revived.
  await run(`UPDATE activities SET is_hidden = 1, rooka_score = 0 WHERE garmin_activity_id = '7200'`);
  await push("activities", { activities: [summary({ summaryId: "7200", activityId: 7200, activityName: "Again", activityType: "RUNNING", startTimeInSeconds: oldStart, durationInSeconds: 2400 })] });
  const hidden = await get(`SELECT name, rooka_score, is_hidden FROM activities WHERE garmin_activity_id = '7200'`);
  assert.deepStrictEqual({ ...hidden }, { name: "Long Run (fixed)", rooka_score: 0, is_hidden: 1 });
  console.log("✅ A workout the athlete linked away stays hidden");

  // -------------------------------------------------------------------------
  // 6. Health
  // -------------------------------------------------------------------------
  // Apple Health already wrote that day (weight): Garmin fills the rest beside it.
  await run(`INSERT INTO biometrics (user_id, date, weight_kg, sleep_minutes) VALUES (1, '2026-10-25', 71.5, 400)`);
  await push("dailies", {
    dailies: [
      { userId: "garmin-u1", summaryId: "d1", calendarDate: "2026-10-25", startTimeInSeconds: 1, durationInSeconds: 43200, steps: 6100, activeKilocalories: 410, restingHeartRateInBeatsPerMinute: 48, averageHeartRateInBeatsPerMinute: 99, timeOffsetHeartRateSamples: { 15: 60, 30: 64, 3180: 80 } },
    ],
  });
  let bio = await get(`SELECT * FROM biometrics WHERE user_id = 1 AND date = '2026-10-25'`);
  assert.strictEqual(bio.steps, 6100);
  assert.strictEqual(bio.active_calories, 410);
  assert.strictEqual(bio.resting_hr, 48);
  assert.strictEqual(bio.avg_hr, 68, "the day's average from its samples, not Garmin's 7-day average");
  assert.strictEqual(bio.weight_kg, 71.5, "Apple Health's weight stays");
  assert.strictEqual(bio.from_garmin, 1);
  // Later in the day Garmin sends the same day again with more: it replaces.
  await push("dailies", { dailies: [{ userId: "garmin-u1", summaryId: "d1", calendarDate: "2026-10-25", steps: 11200, activeKilocalories: 720, restingHeartRateInBeatsPerMinute: 47 }] });
  bio = await get(`SELECT * FROM biometrics WHERE user_id = 1 AND date = '2026-10-25'`);
  assert.deepStrictEqual([bio.steps, bio.active_calories, bio.resting_hr, bio.avg_hr], [11200, 720, 47, 68]);
  console.log("✅ Dailies fill steps, calories and heart rate; a newer daily replaces the older values");

  await push("sleeps", {
    sleeps: [
      { userId: "garmin-u1", summaryId: "s1", calendarDate: "2026-10-25", startTimeInSeconds: 1761341000, startTimeOffsetInSeconds: 7200, durationInSeconds: 27000, deepSleepDurationInSeconds: 5400, lightSleepDurationInSeconds: 15600, remSleepInSeconds: 6000, awakeDurationInSeconds: 1200, validation: "ENHANCED_FINAL" },
      { userId: "garmin-u1", summaryId: "s2", calendarDate: "2026-10-24", startTimeInSeconds: 1761254000, durationInSeconds: 25200, deepSleepDurationInSeconds: 0, lightSleepDurationInSeconds: 0, remSleepInSeconds: 0, awakeDurationInSeconds: 0, validation: "OFF_WRIST" },
    ],
  });
  await push("hrv", { hrv: [{ userId: "garmin-u1", summaryId: "h1", calendarDate: "2026-10-25", lastNightAvg: 58, lastNight5MinHigh: 81 }] });
  await push("body-comps", { bodyComps: [{ userId: "garmin-u1", summaryId: "b1", measurementTimeInSeconds: Date.UTC(2026, 9, 25, 23, 30) / 1000, measurementTimeOffsetInSeconds: 3600, weightInGrams: 70850, bodyFatInPercent: 14.2, bodyMassIndex: 22.1 }] });
  await push("user-metrics", { userMetrics: [{ userId: "garmin-u1", summaryId: "m1", calendarDate: "2026-10-25", vo2Max: 56.0, fitnessAge: 30 }] });
  bio = await get(`SELECT * FROM biometrics WHERE user_id = 1 AND date = '2026-10-25'`);
  assert.deepStrictEqual(
    [bio.sleep_minutes, bio.sleep_deep_minutes, bio.sleep_core_minutes, bio.sleep_rem_minutes, bio.sleep_awake_minutes],
    [450, 90, 260, 100, 20],
    "sleep stages: light goes where Apple's core sleep goes",
  );
  assert.deepStrictEqual([bio.hrv_rmssd, bio.hrv_sdnn], [58, null], "overnight HRV (RMSSD) in its own column, not Apple's SDNN");
  assert.strictEqual(bio.vo2_max, 56);
  const offWrist = await get(`SELECT * FROM biometrics WHERE user_id = 1 AND date = '2026-10-24'`);
  assert.strictEqual(offWrist.sleep_minutes, 420);
  assert.strictEqual(offWrist.sleep_deep_minutes, null, "an off-wrist night has its length but no stages");
  const weighIn = await get(`SELECT * FROM biometrics WHERE user_id = 1 AND date = '2026-10-26'`);
  assert.deepStrictEqual([weighIn.weight_kg, weighIn.body_fat_percent, weighIn.bmi], [70.9, 14.2, 22.1], "weighed at 00:30 on the scale's clock: that day");
  console.log("✅ Sleeps, body composition and VO2 max land in the Apple Health columns and HRV in its own, by the athlete's day");

  // -------------------------------------------------------------------------
  // 7. No AI-generated knowledge base from Garmin data (license §15.11)
  // -------------------------------------------------------------------------
  assert.strictEqual((await get(`SELECT COUNT(*) AS n FROM athlete_facts`)).n, 0, "no facts");
  assert.strictEqual((await get(`SELECT COUNT(*) AS n FROM athlete_metrics`)).n, 0, "one day of resting HR is no baseline yet");
  assert.ok(!(await get(`SELECT long_term_memory FROM users WHERE id = 1`)).long_term_memory, "no long-term memory");
  console.log("✅ Garmin data never reaches the coach's AI-written memory (facts, long-term memory)");

  // -------------------------------------------------------------------------
  // 8. Resting HR baseline: Apple Health's rule, computed in code
  // -------------------------------------------------------------------------
  const daysAgo = (k) => new Date(Date.now() - k * 86400000).toISOString().slice(0, 10);
  const rhrDay = (k, bpm) => ({ userId: "garmin-u4", summaryId: `r${k}`, calendarDate: daysAgo(k), restingHeartRateInBeatsPerMinute: bpm });
  await push("dailies", { dailies: [rhrDay(3, 50), rhrDay(2, 52)] });
  assert.ok(!(await get(`SELECT 1 FROM athlete_metrics WHERE user_id = 4`)), "two days: no baseline yet");
  await push("dailies", { dailies: [rhrDay(1, 57)] });
  const rhrMetric = await get(`SELECT value, source FROM athlete_metrics WHERE user_id = 4 AND metric = 'resting_hr'`);
  assert.deepStrictEqual([rhrMetric.value, rhrMetric.source], ["53", "garmin"], "three days: their average, credited to Garmin");
  assert.strictEqual((await get(`SELECT COUNT(*) AS n FROM athlete_facts`)).n, 0, "still no facts");
  assert.ok(!(await get(`SELECT long_term_memory FROM users WHERE id = 4`)).long_term_memory, "still no long-term memory");
  console.log("✅ Garmin's resting HR sets the baseline the way Apple Health's does");

  server.close();
  console.log("\n🎉 All Garmin ingestion tests passed!");
  setTimeout(() => {
    try { require("fs").unlinkSync(process.env.DB_PATH); } catch (_) {}
    process.exit(0);
  }, 200);
})().catch((e) => {
  console.error("❌", e);
  try { require("fs").unlinkSync(process.env.DB_PATH); } catch (_) {}
  process.exit(1);
});
