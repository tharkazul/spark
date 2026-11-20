// Usage analytics: only listed events and values are stored, an opted-out athlete
// records nothing (and turning it off deletes what was there), the summaries are
// right, and they survive the raw events being deleted after 90 days.
// Uses a throwaway database.
const path = require("path");
const os = require("os");
process.env.DB_PATH = path.join(os.tmpdir(), `rooka_usage_test_${process.pid}.db`);

const assert = require("assert");
const db = require("./services/db");
const usage = require("./services/usageAnalytics");

const dbRun = (q, p = []) => new Promise((resolve, reject) => db.run(q, p, (err) => (err ? reject(err) : resolve())));
const dbAll = (q, p = []) => new Promise((resolve, reject) => db.all(q, p, (err, rows) => (err ? reject(err) : resolve(rows))));
const dbGet = (q, p = []) => new Promise((resolve, reject) => db.get(q, p, (err, row) => (err ? reject(err) : resolve(row))));
const { addDays } = usage._internal;

const ok = (label) => console.log(`✅ ${label}`);

async function addEvent(userId, day, name, props = {}, session = `s-${userId}-${day}`) {
  await dbRun(
    `INSERT INTO app_events (user_id, session_id, name, props_json, platform, app_version, day) VALUES (?, ?, ?, ?, 'ios', '1.1.1 (36)', ?)`,
    [userId, session, name, JSON.stringify(props), day],
  );
}

(async () => {
  await new Promise((r) => setTimeout(r, 300)); // let db.js finish its migrations

  // --- Only listed events, properties and values -------------------------------
  assert.strictEqual(usage.sanitizeEvent({ name: "made_up" }), null);
  assert.deepStrictEqual(usage.sanitizeEvent({ name: "tab_viewed", props: { tab: "coach", via: "tap", text: "secret" } }), {
    name: "tab_viewed",
    props: { tab: "coach", via: "tap" },
  });
  assert.deepStrictEqual(usage.sanitizeEvent({ name: "tab_viewed", props: { tab: "inbox" } }).props, {});
  assert.deepStrictEqual(usage.sanitizeEvent({ name: "workout_added", props: { sport: "VirtualRide", how: "manual" } }).props, {
    sport: "bike",
    how: "manual",
  });
  assert.deepStrictEqual(usage.sanitizeEvent({ name: "app_opened", props: { cold: true } }).props, { cold: "yes" });
  assert.deepStrictEqual(usage.sanitizeEvent({ name: "plan_shifted", props: { days: 40 } }).props, {});
  ok("Unknown events, properties and values are dropped; sports are grouped");

  // --- Storing, opting out -------------------------------------------------------
  await dbRun(`INSERT INTO users (id, username, created_at) VALUES (1, 'anna', '2026-08-03 08:00:00'), (2, 'bram', '2026-08-04 21:30:00'), (3, 'cees', '2026-08-05 10:00:00')`);
  await dbRun(`UPDATE users SET usage_stats_enabled = 0 WHERE id = 3`);

  const batch = { session_id: "abc", platform: "ios", app_version: "1.1.1 (36)", events: [{ name: "app_opened", props: { cold: true } }, { name: "nope" }] };
  assert.strictEqual(await usage.recordEvents(1, batch), 1);
  assert.strictEqual(await usage.recordEvents(3, batch), 0);
  assert.strictEqual(await usage.recordEvents(null, { ...batch, events: [{ name: "login_viewed" }] }), 1);
  assert.strictEqual(await usage.recordEvents(1, { events: batch.events }), 0, "no session id, nothing stored");
  const stored = await dbAll(`SELECT user_id, name FROM app_events ORDER BY id`);
  assert.deepStrictEqual(stored.map((r) => [r.user_id, r.name]), [[1, "app_opened"], [null, "login_viewed"]]);
  ok("Events are stored for athletes who allow it and before login, never for one who turned it off");

  await usage.setUsageStatsEnabled(1, false);
  assert.strictEqual((await dbGet(`SELECT COUNT(*) AS n FROM app_events WHERE user_id = 1`)).n, 0);
  assert.strictEqual(await usage.recordEvents(1, batch), 0);
  await usage.setUsageStatsEnabled(1, true);
  ok("Turning usage statistics off deletes the athlete's events and stops new ones");

  // --- Summaries -----------------------------------------------------------------
  await dbRun(`DELETE FROM app_events`);
  await dbRun(`INSERT OR REPLACE INTO app_analytics_meta (key, value) VALUES ('collecting_since', '2026-08-03')`);
  // Anna (signed up Mon 3 Aug): full onboarding, connects Garmin, comes back on day 8.
  for (const [name, props] of [
    ["app_opened", { cold: "yes" }],
    ["onboarding_step_viewed", { step: "welcome" }],
    ["onboarding_step_viewed", { step: "language" }],
    ["onboarding_step_viewed", { step: "coach_style" }],
    ["onboarding_step_viewed", { step: "coach_gender" }],
    ["onboarding_step_viewed", { step: "goal" }],
    ["onboarding_completed", {}],
    ["ai_consent_answered", { answer: "allow", where: "onboarding" }],
    ["integration_connected", { service: "garmin" }],
    ["tab_viewed", { tab: "planning", via: "tap" }],
  ])
    await addEvent(1, "2026-08-03", name, props);
  await addEvent(1, "2026-08-11", "app_opened", { cold: "yes" });
  await addEvent(1, "2026-08-11", "tab_viewed", { tab: "coach", via: "swipe" });
  await addEvent(1, "2026-08-11", "coach_message_sent", { kind: "text" });
  // Bram (Tue 4 Aug): stops at the language step.
  await addEvent(2, "2026-08-04", "app_opened", { cold: "yes" });
  await addEvent(2, "2026-08-04", "onboarding_step_viewed", { step: "welcome" });
  await addEvent(2, "2026-08-04", "onboarding_step_viewed", { step: "language" });
  await addEvent(2, "2026-08-04", "paywall_shown", { from: "coach" });
  await addEvent(2, "2026-08-04", "paywall_closed", { from: "coach", result: "purchased" });

  const aug20 = new Date("2026-08-20T12:00:00Z");
  await usage.runRollup({ now: aug20 });

  const funnel = Object.fromEntries((await dbAll(`SELECT step, users FROM app_cohort_funnel WHERE cohort_week = '2026-08-03'`)).map((r) => [r.step, r.users]));
  assert.deepStrictEqual(funnel, {
    signed_up: 2,
    opened_app: 2,
    onboarding_welcome: 2,
    onboarding_language: 2,
    onboarding_coach_style: 1,
    onboarding_coach_gender: 1,
    onboarding_goal: 1,
    onboarding_completed: 1,
    ai_allowed: 1,
    device_connected: 1,
    first_coach_message: 1,
    back_after_a_week: 1,
  });
  ok("Funnel per sign-up week: 2 signed up, 1 got past the language step (the opted-out athlete isn't counted)");

  const ret = await dbAll(`SELECT week_offset, cohort_size, active_users FROM app_cohort_retention WHERE cohort_week = '2026-08-03' ORDER BY week_offset`);
  assert.deepStrictEqual(ret.slice(0, 2).map((r) => [r.week_offset, r.cohort_size, r.active_users]), [[0, 2, 2], [1, 2, 1]]);
  ok("Retention: both active in their first week, one in their second");

  const day3 = await dbGet(`SELECT users, events FROM app_event_rollup WHERE period = 'day' AND period_start = '2026-08-03' AND name = '*' AND dim = ''`);
  assert.deepStrictEqual([day3.users, day3.events], [1, 10]);
  const week = await dbGet(`SELECT users FROM app_event_rollup WHERE period = 'week' AND period_start = '2026-08-03' AND name = '*' AND dim = ''`);
  assert.strictEqual(week.users, 2);
  const paid = await dbGet(`SELECT events FROM app_event_rollup WHERE period = 'day' AND name = 'paywall_closed' AND dim = 'from,result' AND dim_value = 'coach|purchased'`);
  assert.strictEqual(paid.events, 1);
  ok("Daily and weekly counts, broken down by property (paywall source and result together)");

  const before = await usage.overview({ days: 30, now: aug20 });
  assert.strictEqual(before.funnel.find((s) => s.step === "onboarding_coach_style").users, 1);
  assert.deepStrictEqual(before.paywall, [{ from: "coach", shown: 1, purchased: 1, restored: 0, cancelled: 0 }]);
  assert.strictEqual(before.tabs.find((t) => t.tab === "coach").share > 0, true);
  ok("The admin overview reads the summaries");

  // --- Raw data goes, the charts stay ------------------------------------------
  const dec1 = new Date("2026-12-01T12:00:00Z");
  const result = await usage.runRollup({ now: dec1 });
  assert.strictEqual(result.purged, 18);
  assert.strictEqual((await dbGet(`SELECT COUNT(*) AS n FROM app_events WHERE day < ?`, [addDays("2026-12-01", -90)])).n, 0);
  const funnelAfter = Object.fromEntries((await dbAll(`SELECT step, users FROM app_cohort_funnel WHERE cohort_week = '2026-08-03'`)).map((r) => [r.step, r.users]));
  assert.deepStrictEqual(funnelAfter, funnel);
  const day3After = await dbGet(`SELECT users, events FROM app_event_rollup WHERE period = 'day' AND period_start = '2026-08-03' AND name = '*' AND dim = ''`);
  assert.deepStrictEqual([day3After.users, day3After.events], [1, 10]);
  const retAfter = await dbAll(`SELECT week_offset, active_users FROM app_cohort_retention WHERE cohort_week = '2026-08-03' ORDER BY week_offset`);
  assert.deepStrictEqual(retAfter.slice(0, 2).map((r) => [r.week_offset, r.active_users]), [[0, 2], [1, 1]]);
  const after = await usage.overview({ days: 365, now: dec1 });
  assert.strictEqual(after.funnel.find((s) => s.step === "signed_up").users, 2);
  ok("After 90 days the raw events are deleted and the funnel, retention and daily counts are unchanged");

  // --- Account deletion takes the athlete's events ----------------------------
  await addEvent(2, "2026-11-30", "app_opened");
  await require("./services/accountDeletion").eraseAccount(2);
  assert.strictEqual((await dbGet(`SELECT COUNT(*) AS n FROM app_events WHERE user_id = 2`)).n, 0);
  ok("Deleting an account deletes its events");

  console.log("\n🎉 All usage analytics tests passed!");
  process.exit(0);
})().catch((err) => {
  console.error("❌", err);
  process.exit(1);
});
