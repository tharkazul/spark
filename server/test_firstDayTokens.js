// Free athletes get the rooka+ chat budget on the day they sign up (26 Nov 2026: a new athlete
// hit the 5k limit after three messages while loading his plan). Uses a throwaway database.
const path = require("path");
const os = require("os");
process.env.DB_PATH = path.join(os.tmpdir(), `rooka_firstday_test_${process.pid}.db`);
const assert = require("assert");
const { getEffectiveTokenLimit, isFirstDay, getAMSDateString } = require("./services/utils");
const i18n = require("./services/i18n");
const ok = (label) => console.log(`✅ ${label}`);

const now = new Date();
const yesterday = new Date(now.getTime() - 26 * 3600 * 1000);
assert.strictEqual(isFirstDay({ rooka_start_date: now.toISOString() }), true);
assert.strictEqual(isFirstDay({ rooka_start_date: yesterday.toISOString() }), false);
assert.strictEqual(isFirstDay({ created_at: now.toISOString().replace("T", " ").slice(0, 19) }), true, "SQLite timestamp (UTC)");
assert.strictEqual(isFirstDay({ rooka_start_date: getAMSDateString() }), true, "date only");
assert.strictEqual(isFirstDay({}), false);
ok("The signup day is recognised in Amsterdam time");

assert.strictEqual(getEffectiveTokenLimit({ subscription_tier: "free", daily_token_limit: 5000, rooka_start_date: now.toISOString() }), 50000);
assert.strictEqual(getEffectiveTokenLimit({ subscription_tier: "free", daily_token_limit: 5000, rooka_start_date: yesterday.toISOString() }), 5000);
assert.strictEqual(getEffectiveTokenLimit({ subscription_tier: "free", daily_token_limit: 0, rooka_start_date: now.toISOString() }), 50000, "the new-day reset keeps the first-day budget");
assert.strictEqual(getEffectiveTokenLimit({ subscription_tier: "free", daily_token_limit: 64065, rooka_start_date: now.toISOString() }), 64065, "an extra grant on top stays");
assert.strictEqual(getEffectiveTokenLimit({ subscription_tier: "rooka_plus", daily_token_limit: 50000, rooka_start_date: now.toISOString() }), 50000);
assert.strictEqual(getEffectiveTokenLimit({ subscription_tier: "admin", daily_token_limit: 500000, rooka_start_date: now.toISOString() }), 500000);
ok("Free athletes have 50k on their first day and 5k after; other tiers are unchanged");

for (const lang of ["en", "nl", "de", "es", "fr", "pt"]) {
  const line = i18n.t(lang, "chat.firstDayWelcome");
  assert.ok(line.startsWith("🎁"), `${lang}: ${line}`);
}
ok("The welcome line exists in all six languages");

console.log("All first-day token checks passed.");
setTimeout(() => {
  try { require("fs").unlinkSync(process.env.DB_PATH); } catch (_) {}
  process.exit(0);
}, 300);
