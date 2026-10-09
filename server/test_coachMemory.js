/**
 * Coach memory & constraint guarantees, end to end against a throwaway database with the
 * LLM mocked. Scenario: the athlete told the coach they're in Italy next week and can only
 * run; the Sunday auto-plan must not schedule bike rides, must keep the days they agreed in
 * chat, and the memory summary must not lose notes written while it runs.
 */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const Module = require("module");

const dbFile = path.join(os.tmpdir(), `rooka_test_coach_memory_${process.pid}.db`);
process.env.DB_PATH = dbFile;

// Mock the LLM before anything requires services/ai.
const llmCalls = [];
let plannerReplies = [];
let summaryDelayMs = 0;
const aiPath = require.resolve("./services/ai");
const aiMock = new Module(aiPath);
aiMock.filename = aiPath;
aiMock.loaded = true;
aiMock.exports = {
  generateWithFallback: async (prompt, systemPrompt) => {
    llmCalls.push({ prompt, systemPrompt });
    if (String(prompt).includes("background AI assistant")) {
      await new Promise((r) => setTimeout(r, summaryDelayMs));
      // Like a real model, keep the notes it was shown; the fixed line marks the rewrite.
      const current = String(prompt).split("CURRENT LONG-TERM MEMORY:\n")[1].split("\n\n")[0];
      const kept = current.split("\n").filter((l) => l.includes("running only."));
      return ["- Summarized: Italy 2026-10-12 to 2026-10-18, running only", ...kept].join("\n");
    }
    return plannerReplies.shift() || "";
  },
  generateImage: async () => null,
};
require.cache[aiPath] = aiMock;

const db = require("./services/db");
const constraints = require("./services/athleteConstraints");
const memory = require("./services/longTermMemory");
const { generateWeeklyPlanForUser } = require("./services/workoutPlanning");

const run = (sql, p = []) => new Promise((res, rej) => db.run(sql, p, (e) => (e ? rej(e) : res())));
const all = (sql, p = []) => new Promise((res, rej) => db.all(sql, p, (e, r) => (e ? rej(e) : res(r))));
const get = (sql, p = []) => new Promise((res, rej) => db.get(sql, p, (e, r) => (e ? rej(e) : res(r))));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const WEEK = ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"];
const day = (date, sport, description, extra = {}) => ({ date, sport, description, target_rooka: 50, details: "x", steps: [], ...extra });
const reply = (plan) => "Strong week ahead.\n```json\n" + JSON.stringify(plan) + "\n```";

(async () => {
  await sleep(1500); // schema creation in db.js is fire-and-forget

  await run(`INSERT INTO users (id, username, language, athlete_context, long_term_memory, ai_consent) VALUES (1, 'tester', 'nl', 'Triathlete', '- Old fact: likes morning runs', 1)`);
  await run(`INSERT INTO chat_history (user_id, role, content) VALUES (1, 'user', 'Volgende week ben ik in Italië, ik kan alleen hardlopen')`);

  // 1. The coach logs the trip; re-emitting it updates instead of duplicating.
  const directive = { type: "log_constraint", data: { kind: "travel", start_date: "2026-10-12", end_date: "2026-10-18", allowed_sports: ["Run"], no_intensity: true, note: "Italy, no bike" } };
  const created = await constraints.applyConstraintDirective(1, directive, "2026-10-07");
  const again = await constraints.applyConstraintDirective(1, directive, "2026-10-07");
  assert.strictEqual(created.action, "created");
  assert.strictEqual(again.action, "updated");
  assert.strictEqual((await get(`SELECT COUNT(*) AS n FROM athlete_constraints WHERE user_id = 1`)).n, 1);
  console.log("✅ log_constraint creates once and updates on repeat");

  // 2. Existing plan: the athlete's own session, a day agreed in chat, a stale weekly-job ride.
  await run(`INSERT INTO micro_plan (user_id, date, sport, description, source) VALUES (1, '2026-10-14', 'Strength', 'My own core session', 'user')`);
  await run(`INSERT INTO micro_plan (user_id, date, sport, description, source, origin) VALUES (1, '2026-10-13', 'Run', 'Easy run along the coast (agreed in chat)', 'coach', 'chat')`);
  await run(`INSERT INTO micro_plan (user_id, date, sport, description, source, origin) VALUES (1, '2026-10-15', 'Bike', 'Old weekly ride', 'coach', 'weekly_job')`);

  // 3. Sunday auto-plan: first draft ignores the trip, the retry still has one ride left.
  plannerReplies = [
    reply([
      day("2026-10-12", "Run", "Easy run"),
      day("2026-10-13", "Bike", "Ride that would overwrite the chat day"),
      day("2026-10-14", "Run", "5x1000m Threshold"),
      day("2026-10-15", "Bike", "Sweet spot ride"),
      day("2026-10-16", "Rest", "Rest"),
      day("2026-10-17", "Bike", "Long ride"),
      day("2026-10-18", "Run", "Long run"),
    ]),
    reply([
      day("2026-10-12", "Run", "Easy run"),
      day("2026-10-14", "Run", "Easy run"),
      day("2026-10-15", "Run", "Easy run"),
      day("2026-10-16", "Rest", "Rest"),
      day("2026-10-17", "Bike", "Long ride"),
      day("2026-10-18", "Run", "Long run"),
    ]),
  ];
  await generateWeeklyPlanForUser(1, WEEK);

  const plannerCalls = llmCalls.filter((c) => c.systemPrompt);
  assert.strictEqual(plannerCalls.length, 2, "draft breaking a constraint is regenerated once");
  assert.ok(plannerCalls[0].systemPrompt.includes("HARD TRAINING CONSTRAINTS"), "constraints are in the planner prompt");
  assert.ok(plannerCalls[0].systemPrompt.includes("alleen hardlopen"), "recent chat is in the planner prompt");
  assert.ok(plannerCalls[0].systemPrompt.includes("DAYS ALREADY AGREED WITH THE ATHLETE IN CHAT"), "chat days are listed as locked");
  assert.ok(plannerCalls[1].prompt.includes("previous draft broke"), "retry spells out the violations");

  const week = await all(`SELECT date, sport, description, source, origin FROM micro_plan WHERE user_id = 1 ORDER BY date, id`);
  assert.ok(!week.some((w) => w.sport === "Bike"), `no bike rides during the trip: ${JSON.stringify(week)}`);
  assert.ok(week.some((w) => w.date === "2026-10-13" && w.origin === "chat"), "day agreed in chat survives");
  assert.ok(!week.some((w) => w.date === "2026-10-13" && w.origin === "weekly_job"), "nothing planned over the chat day");
  assert.ok(week.some((w) => w.date === "2026-10-14" && w.source === "user"), "athlete's own session survives");
  const note = await get(`SELECT content FROM chat_history WHERE user_id = 1 AND role = 'coach' ORDER BY id DESC LIMIT 1`);
  assert.ok(/aangepast/.test(note.content), "coach says which days it adjusted");
  console.log("✅ Sunday auto-plan respects the trip, keeps chat and athlete days, retries then repairs");

  // 4. A ride written later (e.g. by the coach in chat) is repaired in the stored calendar.
  await run(`INSERT INTO micro_plan (user_id, date, sport, description, source, origin) VALUES (1, '2026-10-16', 'Bike', 'Sneaky ride', 'coach', 'chat')`);
  const changes = await constraints.repairStoredPlan(1, "2026-10-07", "2026-10-18", "nl");
  assert.ok(changes.some((c) => c.date === "2026-10-16" && c.from === "Bike"));
  assert.ok(!(await all(`SELECT 1 FROM micro_plan WHERE user_id = 1 AND sport = 'Bike'`)).length, "stored ride replaced");
  assert.ok((await all(`SELECT 1 FROM deleted_micro_plan WHERE user_id = 1 AND description = 'Sneaky ride'`)).length, "replaced ride archived");
  console.log("✅ repairStoredPlan fixes and archives stored violations");

  // 5. A note appended while the summary's LLM call is running is not lost.
  summaryDelayMs = 300;
  const summary = memory.triggerBackgroundSummary(1);
  await sleep(50);
  await memory.appendMemoryNote(1, "Rented a road bike in Italy after all? No: running only.");
  memory.triggerBackgroundSummary(1); // overlaps: collapses into one follow-up run
  await summary;
  const mem = (await get(`SELECT long_term_memory FROM users WHERE id = 1`)).long_term_memory;
  assert.ok(mem.includes("Summarized"), mem);
  assert.ok(mem.includes("running only."), `appended note survives the summary: ${mem}`);
  const summaryCalls = llmCalls.filter((c) => String(c.prompt).includes("background AI assistant"));
  assert.strictEqual(summaryCalls.length, 2, "overlapping trigger runs exactly one follow-up");
  assert.ok(summaryCalls[0].prompt.includes("TODAY'S DATE"), "summary knows today's date");
  assert.ok(summaryCalls[0].prompt.includes("Constraint ID"), "summary sees constraints as truth");
  console.log("✅ memory summary merges concurrent notes and coalesces triggers");

  // 6. Multilingual life-event trigger.
  assert.ok(memory.mentionsLifeEvent("Nächste Woche bin ich im Urlaub"));
  assert.ok(memory.mentionsLifeEvent("Je pars en vacances samedi"));
  assert.ok(!memory.mentionsLifeEvent("I will run tomorrow"));
  console.log("✅ life-event trigger works across languages");

  console.log("\n🎉 Coach memory tests passed");
  db.close(() => {
    fs.rmSync(dbFile, { force: true });
    process.exit(0);
  });
})().catch((err) => {
  console.error("❌", err);
  fs.rmSync(dbFile, { force: true });
  process.exit(1);
});
