/**
 * Moving a race close by re-plans the rest of this week: days up to and including today stay,
 * the days after get a new plan, nothing happens for a race far away or a date moved and back,
 * and a failed AI call leaves the old plan in place. Throwaway database, LLM mocked.
 */
const assert = require("assert");
const os = require("os");
const path = require("path");
const Module = require("module");

process.env.DB_PATH = path.join(os.tmpdir(), `rooka_test_race_move_${process.pid}.db`);

const calls = [];
let replies = [];
const aiPath = require.resolve("./services/ai");
const aiMock = new Module(aiPath);
aiMock.filename = aiPath;
aiMock.loaded = true;
aiMock.exports = {
  generateWithFallback: async (prompt, systemPrompt) => {
    calls.push({ prompt, systemPrompt });
    return replies.shift() || "";
  },
  generateImage: async () => null,
};
require.cache[aiPath] = aiMock;

const db = require("./services/db");
const rm = require("./services/raceMoveReplan");

const run = (sql, p = []) => new Promise((res, rej) => db.run(sql, p, (e) => (e ? rej(e) : res())));
const all = (sql, p = []) => new Promise((res, rej) => db.all(sql, p, (e, r) => (e ? rej(e) : res(r))));
const ok = (label) => console.log(`✅ ${label}`);

// Wednesday 25 November 2026, 10:00 in Amsterdam. Week: Mon 23 - Sun 29.
const NOW = new Date("2026-11-25T10:00:00+01:00");
const day = (date, sport, description) => ({ date, sport, description, target_rooka: 40, details: "x", steps: [] });
const reply = (plan) => "Re-planned.\n```json\n" + JSON.stringify(plan) + "\n```";

(async () => {
  await new Promise((r) => setTimeout(r, 1500)); // db.js creates its schema without waiting

  // --- What counts as a change ------------------------------------------------------
  const sat = [{ name: "Zwolle 10k", date: "2026-11-28", goal_type: "race" }];
  const fri = [{ name: "Zwolle 10k", date: "2026-11-27", goal_type: "race" }];
  assert.deepStrictEqual(rm.raceChanges(sat, fri), [{ name: "Zwolle 10k", from: "2026-11-28", to: "2026-11-27" }]);
  assert.deepStrictEqual(rm.raceChanges(sat, sat), []);
  assert.deepStrictEqual(rm.raceChanges([], fri), [{ name: "Zwolle 10k", from: null, to: "2026-11-27" }]);
  assert.deepStrictEqual(rm.raceChanges([{ name: "Lose weight", date: "2026-11-27", goal_type: "physiological" }], []), [], "only races");
  assert.strictEqual(rm.sundayOf("2026-11-25"), "2026-11-29");
  assert.strictEqual(rm.sundayOf("2026-11-29"), "2026-11-29");
  assert.strictEqual(rm.affectsThisWeek(rm.raceChanges(sat, fri), "2026-11-25"), true);
  assert.strictEqual(rm.affectsThisWeek([{ name: "x", from: "2026-12-05", to: "2026-12-06" }], "2026-11-25"), true, "next week's race shapes this week's end");
  assert.strictEqual(rm.affectsThisWeek([{ name: "x", from: "2027-04-10", to: "2027-04-17" }], "2026-11-25"), false, "a spring race doesn't");
  assert.strictEqual(rm.affectsThisWeek([{ name: "x", from: "2026-11-20", to: null }], "2026-11-25"), false, "a race in the past doesn't");
  ok("Race changes near this week are spotted; far away, past and non-race goals are not");

  // --- The replan ----------------------------------------------------------------------
  await run(`INSERT INTO users (id, username, language, athlete_context, ai_consent, onboarding_completed) VALUES (1, 'tharaka', 'en', 'Runner', 1, 1)`);
  await run(`INSERT INTO milestones (user_id, name, date, goal_type, is_main) VALUES (1, 'Zwolle 10k', '2026-11-27', 'race', 1)`);
  const week = [
    ["2026-11-23", "Run", "Easy run"],
    ["2026-11-24", "Bike", "Sweet spot"],
    ["2026-11-25", "Swim", "Technique"],
    ["2026-11-26", "Run", "Tempo"],
    ["2026-11-27", "Run", "Easy shakeout"],
    ["2026-11-28", "Run", "Race: Zwolle 10k"],
    ["2026-11-29", "Rest", "Rest"],
  ];
  for (const [date, sport, description] of week) {
    await run(`INSERT INTO micro_plan (user_id, date, sport, description, source, origin) VALUES (1, ?, ?, ?, 'coach', 'weekly_job')`, [date, sport, description]);
  }

  replies = [
    reply([
      day("2026-11-24", "Run", "Should be ignored: a kept day"),
      day("2026-11-26", "Run", "Openers: 4 x 1 min"),
      day("2026-11-27", "Run", "Race: Zwolle 10k"),
      day("2026-11-28", "Run", "Recovery jog"),
      day("2026-11-29", "Rest", "Rest"),
    ]),
  ];
  const result = await rm._check(1, sat, { now: NOW });
  assert.ok(result && result.success, `replanned (${JSON.stringify(result)})`);
  const plan = await all(`SELECT date, description FROM micro_plan WHERE user_id = 1 ORDER BY date`);
  assert.deepStrictEqual(
    plan.map((r) => [r.date, r.description]),
    [
      ["2026-11-23", "Easy run"],
      ["2026-11-24", "Sweet spot"],
      ["2026-11-25", "Technique"],
      ["2026-11-26", "Openers: 4 x 1 min"],
      ["2026-11-27", "Race: Zwolle 10k"],
      ["2026-11-28", "Recovery jog"],
      ["2026-11-29", "Rest"],
    ],
  );
  const { systemPrompt, prompt } = calls[0];
  assert.ok(systemPrompt.includes("DAYS ALREADY GONE OR UNDER WAY"), "kept days are listed");
  assert.ok(systemPrompt.includes("2026-11-25: Swim - Technique"), "with what was planned on them");
  assert.ok(prompt.includes('my race "Zwolle 10k" moved from 2026-11-28 to 2026-11-27'), "the planner hears what moved");
  assert.ok(prompt.includes("output ONLY 2026-11-26, 2026-11-27, 2026-11-28, 2026-11-29"));
  const archived = await all(`SELECT date FROM deleted_micro_plan WHERE user_id = 1 ORDER BY date`);
  assert.deepStrictEqual(archived.map((r) => r.date), ["2026-11-26", "2026-11-27", "2026-11-28"], "replaced workouts are archived; kept days aren't touched");
  const note = await all(`SELECT content FROM chat_history WHERE user_id = 1 AND role = 'coach'`);
  assert.strictEqual(note.length, 1, "the coach says what it did");
  ok("Race moved from Saturday to Friday: Monday to today stay, Thursday to Sunday are planned again");

  // --- Nothing changed, or the AI fails ----------------------------------------------
  calls.length = 0;
  assert.strictEqual((await rm._check(1, fri, { now: NOW })).skipped, true, "moved and back: no replan");
  assert.strictEqual(calls.length, 0, "and no AI call");

  replies = ["", ""];
  const failed = await rm._check(1, sat, { now: NOW });
  assert.strictEqual(failed.skipped, true);
  const after = await all(`SELECT date, description FROM micro_plan WHERE user_id = 1 ORDER BY date`);
  assert.deepStrictEqual(after, plan, "a failed replan never swaps in the generic week");
  ok("No change means no AI call; a failed AI call leaves the plan as it was");

  console.log("🎉 Race move replan tests passed");
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
