// Facts and metrics helpers. Throwaway database, like the season tests.
const path = require("path");
const os = require("os");
process.env.DB_PATH = path.join(os.tmpdir(), `rooka_facts_test_${process.pid}.db`);
const assert = require("assert");
const f = require("./services/athleteFacts");

console.log("🧠 Running athlete facts unit tests...\n");

{
  const { text, pairs } = f.extractMetricsBlock(
    "Amateur triathlete, father of two.\n[Metrics: FTP (Watts): 272, Max HR: 192, Lactate threshold pace: 5:03, CSS: 1:48]"
  );
  assert.strictEqual(text, "Amateur triathlete, father of two.");
  assert.deepStrictEqual(pairs, [["FTP (Watts)", "272"], ["Max HR", "192"], ["Lactate threshold pace", "5:03"], ["CSS", "1:48"]]);
  console.log("✅ Metrics block is split out, values with a colon intact");
}
{
  assert.strictEqual(f.canonicalMetricKey("FTP (Watts)"), "ftp");
  assert.strictEqual(f.canonicalMetricKey("Lactate threshold HR"), "threshold_hr");
  assert.strictEqual(f.canonicalMetricKey("Lactate threshold pace"), "threshold_pace");
  assert.strictEqual(f.canonicalMetricKey("Resting HR"), "resting_hr");
  assert.strictEqual(f.canonicalMetricKey("5K Pace"), "5K Pace");
  console.log("✅ Metric names are normalised");
}
{
  assert.strictEqual(f.guessCategory("Prefers morning messages short and direct"), "preference");
  assert.strictEqual(f.guessCategory("Holiday in Italy 2026-10-12 to 2026-10-18, no bike"), "schedule");
  assert.strictEqual(f.guessCategory("Sore left knee after long runs"), "health");
  assert.strictEqual(f.guessCategory("Goal: sub 25 min 5k in Gouda"), "goal");
  assert.strictEqual(f.guessCategory("Father of a daughter and twins"), "life");
  console.log("✅ Categories guessed for old memory lines");
}

(async () => {
  const db = require("./services/db");
  const run = (sql, p = []) => new Promise((res, rej) => db.run(sql, p, (err) => (err ? rej(err) : res())));
  const get = (sql, p = []) => new Promise((res, rej) => db.get(sql, p, (err, row) => (err ? rej(err) : res(row))));

  await run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, username TEXT, long_term_memory TEXT DEFAULT '', athlete_context TEXT DEFAULT '', facts_migrated INTEGER DEFAULT 0)`);
  await run(`CREATE TABLE IF NOT EXISTS milestones (id INTEGER PRIMARY KEY, user_id INTEGER, name TEXT, date TEXT, target_ctl REAL, is_main INTEGER DEFAULT 0, goal_type TEXT DEFAULT 'race', target_mode TEXT DEFAULT 'finish', target_value TEXT, target_weight REAL, target_vo2max REAL, event_type TEXT)`);

  const testUserId = 999;
  await run(`INSERT INTO users (id, username) VALUES (?, 'tharaka_tester')`, [testUserId]);

  // Dates relative to today: facts past their valid_until are dropped, so fixed
  // dates made this test fail once they slipped into the past.
  const daysFromNow = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  const firstDate = daysFromNow(14);
  const postponedDate = daysFromNow(44);

  // Seed the original goal fact
  await f.addFact(testUserId, { category: "goal", text: "Sub-20 5k attempt, original race day", until: firstDate });
  await f.renderMemory(testUserId);

  let u = await get(`SELECT long_term_memory FROM users WHERE id = ?`, [testUserId]);
  assert.ok(u.long_term_memory.includes("original race day"), "Memory initially contains the original goal");

  // Athlete postpones the race by a month
  await run(`INSERT INTO milestones (user_id, name, date, target_value, is_main) VALUES (?, '5km', ?, '20:00', 1)`, [testUserId, postponedDate]);

  // Sync goal milestones
  await f.syncGoalMilestones(testUserId);

  // Verify memory and facts
  const factsList = await f.listFacts(testUserId);
  const goalFacts = factsList.filter((x) => x.category === "goal");
  assert.strictEqual(goalFacts.length, 1, "Only one active goal fact should exist");
  assert.ok(goalFacts[0].text.includes(postponedDate), "Goal fact text contains the postponed date");
  assert.strictEqual(goalFacts[0].valid_until, postponedDate, "Goal fact valid_until is the postponed date");

  u = await get(`SELECT long_term_memory FROM users WHERE id = ?`, [testUserId]);
  assert.ok(!u.long_term_memory.includes("original race day"), "Original goal was removed from long_term_memory");
  assert.ok(u.long_term_memory.includes(postponedDate), "Postponed date is present in long_term_memory");
  console.log("✅ syncGoalMilestones purges stale goal facts and updates memory with postponed date");

  console.log("\n🎉 All athlete facts tests passed!");
  try { require("fs").unlinkSync(process.env.DB_PATH); } catch (_) {}
  process.exit(0);
})().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
