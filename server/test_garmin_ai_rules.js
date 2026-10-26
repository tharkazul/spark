/**
 * Garmin license §15.11: no AI-generated knowledge base from Garmin data. Against a
 * throwaway database with the LLM mocked:
 *  - which athletes count as having Garmin data (a connection, or stored Garmin workouts
 *    or health days);
 *  - the coach-memory pass reads only the athlete's own messages for them;
 *  - a metric the coach saves during chat must be a number the athlete typed;
 *  - the weekly public bio isn't AI-written from a month with Garmin workouts.
 */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const Module = require("module");

const dbFile = path.join(os.tmpdir(), `rooka_test_garmin_ai_rules_${process.pid}.db`);
process.env.DB_PATH = dbFile;

// Mock the LLM before anything requires services/ai.
const llmCalls = [];
const aiPath = require.resolve("./services/ai");
const aiMock = new Module(aiPath);
aiMock.filename = aiPath;
aiMock.loaded = true;
aiMock.exports = {
  generateWithFallback: async (prompt) => {
    llmCalls.push(String(prompt));
    if (String(prompt).includes("You maintain what an endurance coach knows")) return JSON.stringify({ ops: [] });
    return "Relentless endurance athlete stacking steady weeks of aerobic work. Built for long days and strong finishes.";
  },
  generateImage: async () => null,
};
require.cache[aiPath] = aiMock;

const db = require("./services/db");
const garmin = require("./services/garmin");
const memory = require("./services/longTermMemory");
const { generateAthleteWeeklyDescription } = require("./services/utils");
const { statedByAthlete } = require("./routes/chat");

const run = (sql, p = []) => new Promise((res, rej) => db.run(sql, p, function (e) { return e ? rej(e) : res(this); }));
const get = (sql, p = []) => new Promise((res, rej) => db.get(sql, p, (e, r) => (e ? rej(e) : res(r))));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  await sleep(2000); // schema creation in db.js is fire-and-forget
  // db.js adds these before it creates activities, so a fresh database lacks them.
  for (const col of ["average_watts REAL", "max_heartrate REAL", "polyline TEXT"]) {
    await run(`ALTER TABLE activities ADD COLUMN ${col}`).catch(() => {});
  }
  await run(`INSERT INTO users (id, username, language, ai_consent) VALUES
    (1, 'applerunner', 'en', 1), (2, 'garminconnected', 'en', 1), (3, 'garminworkouts', 'en', 1), (4, 'garminhealth', 'en', 1)`);
  await run(`INSERT INTO garmin_tokens (user_id, garmin_user_id, access_token, refresh_token, expires_at) VALUES (2, 'g-2', 'a', 'r', 0)`);
  await run(`INSERT INTO activities (user_id, name, sport_type, distance_km, moving_time_min, start_date, garmin_activity_id)
             VALUES (3, 'Morning Run', 'Run', 10, 50, datetime('now', '-2 days'), '9001')`);
  await run(`INSERT INTO activities (user_id, name, sport_type, distance_km, moving_time_min, start_date)
             VALUES (1, 'Lunch Run', 'Run', 8, 40, datetime('now', '-2 days'))`);
  await run(`INSERT INTO biometrics (user_id, date, steps, from_garmin) VALUES (4, '2026-10-25', 9000, 1)`);
  await run(`INSERT INTO biometrics (user_id, date, steps) VALUES (1, '2026-10-25', 9000)`);

  // 1. Who has Garmin data
  assert.deepStrictEqual(
    [await garmin.hasGarminData(1), await garmin.hasGarminData(2), await garmin.hasGarminData(3), await garmin.hasGarminData(4)],
    [false, true, true, true],
    "a connection, a Garmin workout or a Garmin health day each count; Apple Health data doesn't",
  );
  console.log("✅ Garmin data is recognised from the connection, stored workouts and health days");

  // 2. The memory pass reads only the athlete's words when Garmin data is involved
  for (const uid of [1, 2]) {
    await run(`INSERT INTO chat_history (user_id, role, content) VALUES (?, 'user', 'We moved to Utrecht, I can train before work')`, [uid]);
    await run(`INSERT INTO chat_history (user_id, role, content) VALUES (?, 'coach', 'Your overnight HRV of 58 ms and 7h sleep look solid')`, [uid]);
  }
  llmCalls.length = 0;
  await memory.triggerBackgroundSummary(2);
  const garminPrompt = llmCalls.find((p) => p.includes("You maintain what an endurance coach knows"));
  assert.ok(garminPrompt.includes("USER: We moved to Utrecht"), "the athlete's own words are there");
  assert.ok(!garminPrompt.includes("HRV of 58"), "the coach's reply about Garmin data is not");
  assert.ok(garminPrompt.includes("RECENT MESSAGES FROM THE ATHLETE"));
  llmCalls.length = 0;
  await memory.triggerBackgroundSummary(1);
  const applePrompt = llmCalls.find((p) => p.includes("You maintain what an endurance coach knows"));
  assert.ok(applePrompt.includes("HRV of 58"), "without Garmin data the pass still reads the whole chat");
  console.log("✅ Memory pass: athlete's own messages only for Garmin athletes, whole chat otherwise");

  // 3. A coach-saved metric must be a number the athlete typed
  assert.strictEqual(statedByAthlete("285", "My FTP is 285 since the test"), true);
  assert.strictEqual(statedByAthlete(290, "Nice ride today, felt strong"), false, "a number the coach worked out isn't the athlete's");
  assert.strictEqual(statedByAthlete("4:10/km", "threshold pace is 4:10 now"), true);
  assert.strictEqual(statedByAthlete("172 bpm", "max HR 172"), true);
  assert.strictEqual(statedByAthlete("58.5", "my vo2 is 58,5"), true, "decimal comma counts");
  assert.strictEqual(statedByAthlete("high", "it's high"), false, "no number, nothing to match");
  console.log("✅ Coach metrics for Garmin athletes: only numbers the athlete typed");

  // 4. The public bio
  llmCalls.length = 0;
  await generateAthleteWeeklyDescription(3);
  assert.strictEqual(llmCalls.length, 0, "no AI for a month with Garmin workouts");
  const garminBio = (await get(`SELECT public_description FROM users WHERE id = 3`)).public_description;
  assert.ok(garminBio && garminBio.startsWith("Committed endurance runner"), "the archetype bio instead");
  await generateAthleteWeeklyDescription(1);
  assert.strictEqual(llmCalls.length, 1, "AI bio as before without Garmin workouts");
  assert.ok((await get(`SELECT public_description FROM users WHERE id = 1`)).public_description.startsWith("Relentless"));
  console.log("✅ Public bio: archetype text when Garmin workouts are in the month, AI otherwise");

  console.log("\n🎉 Garmin AI rule tests passed!");
  setTimeout(() => {
    try { fs.unlinkSync(dbFile); } catch (_) {}
    process.exit(0);
  }, 200);
})().catch((e) => {
  console.error("❌", e);
  try { fs.unlinkSync(dbFile); } catch (_) {}
  process.exit(1);
});
