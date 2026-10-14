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

console.log("\n🎉 All athlete facts tests passed!");
setTimeout(() => {
  try { require("fs").unlinkSync(process.env.DB_PATH); } catch (_) {}
  process.exit(0);
}, 200);
