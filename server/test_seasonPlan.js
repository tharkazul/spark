// Season plan rules. Uses a throwaway database so requiring the service (which
// creates its tables) never touches real data.
const path = require("path");
const os = require("os");
process.env.DB_PATH = path.join(os.tmpdir(), `rooka_season_test_${process.pid}.db`);

const assert = require("assert");
const { computeSkeleton, detectEventType } = require("./services/seasonPlan");

console.log("🏁 Running season plan unit tests...\n");

// 1. The marathon table approved on 2026-10-12 (18 weeks, 25 km/wk, longest run 12 km, cap 55 km).
{
  const rows = computeSkeleton({ eventType: "marathon", weeks: 18, start: { volume: 25, long: [12] }, capVolume: 55, capLong: [null] });
  const vol = rows.map((r) => r.volume);
  const lr = rows.map((r) => r.longSessions[0].value);
  assert.deepStrictEqual(vol, [25, 27, 29, 22, 31, 34, 37, 28, 40, 43, 46, 35, 50, 54, 55, 44, 33, 19]);
  assert.deepStrictEqual(lr, [12, 13.5, 15.5, 10.5, 17, 18.5, 20, 14, 22, 23.5, 25, 17.5, 26.5, 28.5, 30, 24, 16.5, 0]);
  assert.deepStrictEqual(rows.filter((r) => r.isRecovery).map((r) => r.index), [4, 8, 12]);
  assert.deepStrictEqual(rows.map((r) => r.phase).slice(-4), ["peak", "taper", "taper", "race"]);
  assert.ok(rows[14].phase === "peak" && !rows[14].isRecovery, "the week before the taper is a full week");
  console.log("✅ Marathon table matches the approved numbers");
}

// 2. The 70.3 table approved on 2026-10-12 (20 weeks, 5:00 h, ride 1:15, run 10 km, cap 9:00 h).
{
  const rows = computeSkeleton({ eventType: "70.3", weeks: 20, start: { volume: 300, long: [75, 10] }, capVolume: 540, capLong: [null, null] });
  assert.strictEqual(rows[0].volume, 300);
  assert.strictEqual(rows[11].volume, 540, "hits the 9 h availability cap in week 12");
  assert.ok(rows.every((r) => r.volume <= 540), "never above availability");
  assert.strictEqual(rows[17].longSessions[0].value, 210, "long ride peaks at 3:30");
  assert.strictEqual(rows[17].longSessions[1].value, 18, "long run peaks at 18 km");
  assert.deepStrictEqual(rows.filter((r) => r.isRecovery).map((r) => r.index), [3, 7, 11, 15]);
  console.log("✅ 70.3 table matches the approved numbers");
}

// 3. Life first: availability caps volume and the long session, whatever the event asks.
{
  const rows = computeSkeleton({ eventType: "70.3", weeks: 20, start: { volume: 240, long: [60, 8] }, capVolume: 360, capLong: [120, 14] });
  assert.ok(rows.every((r) => r.volume <= 360), "6 h/week is never exceeded");
  assert.ok(rows.every((r) => r.longSessions[0].value <= 120), "long ride fits the longest available day");
  assert.ok(rows.every((r) => r.longSessions[1].value <= 14), "long run fits the longest available day");
  console.log("✅ Availability caps volume and long sessions");
}

// 4. Athletes of 50+ get a recovery week every 3rd week.
{
  const rows = computeSkeleton({ eventType: "marathon", weeks: 18, start: { volume: 25, long: [12] }, capVolume: 55, recoveryEvery: 3 });
  const rec = rows.filter((r) => r.isRecovery).map((r) => r.index);
  assert.deepStrictEqual(rec, [4, 7, 10, 13], "never in the first two weeks");
  assert.ok(!rows[14].isRecovery, "the week before the taper stays a full week");
  console.log("✅ Recovery every 3rd week from age 50");
}

// 5. Regeneration mid-plan keeps the week numbering.
{
  const rows = computeSkeleton({ eventType: "marathon", weeks: 10, weekOffset: 8, start: { volume: 40, long: [22] }, capVolume: 55 });
  assert.strictEqual(rows[0].index, 9);
  assert.strictEqual(rows[0].total, 18);
  assert.strictEqual(rows[rows.length - 1].phase, "race");
  console.log("✅ Regeneration keeps week numbers");
}

// 6. Short build (marathon in 6 weeks): no base, no crash, race week last.
{
  const rows = computeSkeleton({ eventType: "marathon", weeks: 6, start: { volume: 30, long: [15] }, capVolume: 55 });
  assert.strictEqual(rows.length, 6);
  assert.ok(!rows.some((r) => r.phase === "base"));
  assert.strictEqual(rows[5].phase, "race");
  console.log("✅ Short build handled");
}

// 7. Checkpoints sit in the last full week of base and build.
{
  const rows = computeSkeleton({ eventType: "marathon", weeks: 18, start: { volume: 25, long: [12] }, capVolume: 55 });
  assert.deepStrictEqual(rows.filter((r) => r.isCheckpoint).map((r) => r.index), [6, 11]);
  console.log("✅ Checkpoints at the end of base and build");
}

// 8. Event detection from goal names in the five app languages.
{
  const cases = {
    "Amsterdam Marathon": "marathon",
    "Halve marathon Egmond": "half",
    "Berlin Halbmarathon": "half",
    "Ironman 70.3 Westfriesland": "70.3",
    "Ironman Hamburg": "ironman",
    "Olympische triathlon": "olympic_tri",
    "Sprint triathlon Almere": "sprint_tri",
    "Hyrox Amsterdam": "hyrox",
    "Dam tot Damloop": "10k",
    "Parkrun PR": "5k",
    "Losing weight": "other",
  };
  for (const [name, expected] of Object.entries(cases)) assert.strictEqual(detectEventType(name), expected, name);
  console.log("✅ Event types detected from goal names");
}

// 9. Race estimate: typed-in runs, out-of-band distances and easy runs don't decide it.
{
  const { pickRaceEstimate, zoneForHr } = require("./services/goalStatus");
  const zones = [
    { zone: 1, min: 95, max: 114 }, { zone: 2, min: 115, max: 133 }, { zone: 3, min: 134, max: 152 },
    { zone: 4, min: 153, max: 171 }, { zone: 5, min: 172, max: 190 },
  ];
  assert.strictEqual(zoneForHr(160, zones), 4);
  assert.strictEqual(zoneForHr(80, zones), 1);
  assert.strictEqual(zoneForHr(200, zones), 5);
  const run = (km, min, hr, id = "s") => ({ distance_km: km, moving_time_min: min, average_heartrate: hr, strava_activity_id: id, start_date: "2026-10-01" });
  const typedIn = { distance_km: 14.88, moving_time_min: 75, average_heartrate: null, start_date: "2026-10-02" };
  const halfMarathon = run(21.1, 115, 150);
  const easy = [run(6, 40, 125), run(7, 46, 128), run(5, 33, 120)];
  const hard = [run(7.74, 42.9, 153), run(6.35, 34.93, 163), run(4.61, 24.52, 160)];
  const r1 = pickRaceEstimate([typedIn, halfMarathon, ...easy, ...hard], 5, zones);
  assert.ok(r1.basis.fromHardRuns && r1.basis.runs === 3, "zone 3+ runs are used when they exist");
  assert.ok(r1.seconds > 26 * 60 && r1.seconds < 28 * 60, `estimate ${r1.seconds}s comes from the hard runs`);
  const r2 = pickRaceEstimate([typedIn, ...easy], 5, zones);
  assert.ok(!r2.basis.fromHardRuns && r2.basis.runs === 3, "easy runs are the fallback, the typed-in run is ignored");
  const r3 = pickRaceEstimate([typedIn], 5, zones);
  assert.ok(r3 && r3.basis.typedIn, "typed-in runs only count when nothing was recorded");
  console.log("✅ Race estimate prefers recorded zone 3+ runs near the race distance");

{
  // A 5K effort between a warm-up and a cool-down counts, from its own laps and heart rate.
  const gs = require("./services/goalStatus");
  const lap = (km, pace, hr) => ({ distance: km * 1000, moving_time: Math.round(km * pace * 60), average_heartrate: hr });
  const sprints = [];
  for (let i = 0; i < 5; i++) sprints.push(lap(0.08, 3.5, 140), lap(0.1, 9, 130));
  const laps = [lap(1, 6.5, 135), ...sprints, lap(1, 4.55, 165), lap(1, 4.55, 170), lap(1, 4.55, 172), lap(1, 4.55, 175), lap(1, 4.57, 178), lap(0.36, 7, 150)];
  const km = laps.reduce((a, l) => a + l.distance, 0) / 1000;
  const run = { name: "Evening Run", start_date: "2026-10-17", distance_km: km, moving_time_min: laps.reduce((a, l) => a + l.moving_time, 0) / 60, average_heartrate: 161, laps_json: JSON.stringify(laps) };
  const st = gs.bestLapStretch(run.laps_json, 5);
  assert.strictEqual(Math.round(st.km * 10) / 10, 5);
  assert.ok(Math.abs(st.seconds - 1366) <= 2, `5K stretch ~22:46, got ${st.seconds}s`);
  const est = gs.pickRaceEstimateBestEffort([run], 5, null, { maxHr: 185, restingHr: 46, asOf: "2026-10-19", useLapStretches: true });
  assert.strictEqual(est.basis.method, "best_effort");
  assert.ok(est.basis.fastest.withinLongerRun);
  assert.ok(est.seconds >= 1335 && est.seconds <= 1345, `22:46 with the 2% race-day bonus is ~22:21, got ${est.seconds}s`);
  const easy = { ...run, laps_json: JSON.stringify(laps.map((l) => ({ ...l, average_heartrate: 140 }))), average_heartrate: 140 };
  const none = gs.pickRaceEstimateBestEffort([easy], 5, null, { maxHr: 185, restingHr: 46, asOf: "2026-10-19", useLapStretches: true });
  assert.ok(!none || none.basis.method !== "best_effort", "a stretch below 88% of max HR is not a hard effort");
  console.log("✅ A hard 5K stretch inside a longer run counts");
}
}

(async () => {
  // The estimate is cached per athlete and recalculated as soon as a run is added or edited.
  const gs = require("./services/goalStatus");
  const sp = require("./services/seasonPlan");
  const db = require("./services/db");
  const dbRun = (q, p = []) => new Promise((resolve) => db.run(q, p, () => resolve()));
  await new Promise((r) => setTimeout(r, 500));
  await dbRun(`ALTER TABLE activities ADD COLUMN max_heartrate INTEGER`);
  await dbRun(`INSERT INTO users (id, username, password_hash) VALUES (77, 'cache', 'x')`);
  const addRun = (id, daysAgo, min) =>
    dbRun(`INSERT INTO activities (id, user_id, name, sport_type, distance_km, moving_time_min, average_heartrate, max_heartrate, start_date) VALUES (?, 77, 'Run', 'Run', 5, ?, 170, 185, ?)`, [id, min, sp.addDays(sp.todayStr(), -daysAgo) + "T07:00:00Z"]);
  for (let i = 1; i <= 4; i++) await addRun(7700 + i, i * 3, 27);
  const first = await gs.estimateRaceSeconds(77, 5);
  const again = await gs.estimateRaceSeconds(77, 5);
  assert.strictEqual(again, first, "an unchanged history reuses the cached result");
  await addRun(7799, 0, 23);
  const after = await gs.estimateRaceSeconds(77, 5);
  assert.ok(after.seconds < first.seconds, "a new, faster run updates the estimate straight away");
  await dbRun(`UPDATE activities SET moving_time_min = 21 WHERE id = 7799`);
  const edited = await gs.estimateRaceSeconds(77, 5);
  assert.ok(edited.seconds < after.seconds, "an edited run updates the estimate too");
  console.log("✅ Race estimate is cached until the runs change");

  // The season continues when the race moves by a week or the event changes; a bigger move starts over.
  {
    const sp = require("./services/seasonPlan");
    const q = (sql, p = []) => new Promise((r) => db.all(sql, p, (e, rows) => r(rows || [])));
    const today = sp.todayStr();
    const thisMonday = sp.mondayOf(today);
    await dbRun(`INSERT INTO users (id, username, password_hash) VALUES (88, 'season', 'x')`);
    const race = sp.addDays(thisMonday, 7 * 16 + 5); // a Saturday, 17 weeks of plan from this Monday
    await dbRun(`INSERT INTO milestones (id, user_id, name, date, is_main, goal_type, event_type) VALUES (880, 88, 'Almere 70.3', ?, 1, 'race', '70.3')`, [race]);
    await sp.regenerateSeason(88);
    // Pretend the plan started 4 weeks ago, with base and build weeks behind it.
    const planStart = sp.addDays(thisMonday, -28);
    await dbRun(`UPDATE season_meta SET plan_start = ? WHERE user_id = 88`, [planStart]);
    for (let w = 0; w < 4; w++) {
      await dbRun(
        `INSERT INTO season_weeks (user_id, week_start, week_index, total_weeks, phase, is_recovery, is_checkpoint, unit, target_volume) VALUES (88, ?, ?, 21, ?, 0, 0, 'min', 300)`,
        [sp.addDays(planStart, 7 * w), w + 1, w < 2 ? "base" : "build"]
      );
    }
    const current = async () => (await q(`SELECT week_index, phase FROM season_weeks WHERE user_id = 88 AND week_start = ?`, [thisMonday]))[0];
    const past = async () => q(`SELECT phase FROM season_weeks WHERE user_id = 88 AND week_start < ? ORDER BY week_start`, [thisMonday]);

    await dbRun(`UPDATE milestones SET date = ? WHERE id = 880`, [sp.addDays(race, 3)]);
    await sp.regenerateSeason(88);
    assert.strictEqual((await current()).week_index, 5, "moved 3 days: still week 5");
    assert.deepStrictEqual((await past()).map((r) => r.phase), ["base", "base", "build", "build"], "the weeks done stay as they were");

    await dbRun(`UPDATE milestones SET event_type = 'ironman', name = 'Almere full distance' WHERE id = 880`);
    await sp.regenerateSeason(88);
    assert.strictEqual((await current()).week_index, 5, "70.3 to full distance: still week 5");
    assert.strictEqual((await past()).length, 4, "base and build already done are kept");
    assert.notStrictEqual((await current()).phase, "base", "no drop back to base after reaching build");

    await dbRun(`UPDATE milestones SET date = ? WHERE id = 880`, [sp.addDays(race, 24)]);
    await sp.regenerateSeason(88);
    assert.strictEqual((await current()).week_index, 1, "moved 3 weeks: a new plan from this week");
    assert.strictEqual((await past()).length, 0);

    // Running to triathlon is a new plan too (km and minutes don't compare).
    await dbRun(`UPDATE season_meta SET plan_start = ? WHERE user_id = 88`, [planStart]);
    await dbRun(`UPDATE milestones SET event_type = 'half', name = 'Half marathon' WHERE id = 880`);
    await sp.regenerateSeason(88);
    assert.strictEqual((await current()).week_index, 1);
    console.log("✅ The season continues on a small date move or a new event, and restarts on a big move");
  }

  console.log("\n🎉 All season plan tests passed!");
  setTimeout(() => {
    try { require("fs").unlinkSync(process.env.DB_PATH); } catch (_) {}
    process.exit(0);
  }, 200);
})().catch((e) => {
  console.error("❌", e);
  process.exit(1);
});
