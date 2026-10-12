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

console.log("\n🎉 All season plan tests passed!");
setTimeout(() => {
  try { require("fs").unlinkSync(process.env.DB_PATH); } catch (_) {}
  process.exit(0);
}, 200);
