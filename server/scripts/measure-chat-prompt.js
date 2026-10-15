/**
 * Shows what one athlete's coach chat prompt is made of, section by section.
 *
 * Read-only: it snapshots the database to a temp file and runs the real /api/chat
 * handler against that copy, with the Gemini call, push and weather stubbed out.
 * Nothing is sent to Gemini unless you pass --exact, which counts each section's
 * tokens with Gemini's free countTokens endpoint (the same data every chat
 * message already sends). Without it, tokens are estimated from characters.
 *
 *   node scripts/measure-chat-prompt.js                 most active athlete of the last 14 days
 *   node scripts/measure-chat-prompt.js 12              athlete 12
 *   node scripts/measure-chat-prompt.js 12 --exact      exact token counts
 */
const path = require("path");
const fs = require("fs");
const os = require("os");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const sqlite3 = require("sqlite3");

const args = process.argv.slice(2);
const exact = args.includes("--exact");
const userArg = args.find((a) => /^\d+$/.test(a));
const CHARS_PER_TOKEN = 3.5;

const liveDb = process.env.DB_PATH
  ? path.resolve(__dirname, "..", process.env.DB_PATH)
  : path.join(__dirname, "..", "rooka_native.db");
const snapshot = path.join(os.tmpdir(), `rooka_prompt_measure_${process.pid}.db`);

function snapshotDb() {
  return new Promise((resolve, reject) => {
    const src = new sqlite3.Database(liveDb, sqlite3.OPEN_READONLY, (openErr) => {
      if (openErr) return reject(new Error(`Cannot open ${liveDb}: ${openErr.message}`));
      src.run(`VACUUM INTO ?`, [snapshot], (err) => src.close(() => (err ? reject(err) : resolve())));
    });
  });
}

(async () => {
  await snapshotDb();
  process.env.DB_PATH = snapshot;

  // Stub everything that would leave the machine or reach the athlete.
  const ai = require("../services/ai");
  let captured = null;
  ai.generateWithFallback = async (prompt, systemInstruction, chatHistory, images, userId, pool, isJson, options = {}) => {
    if (Array.isArray(chatHistory) && !captured) {
      const { languageDirective } = require("../services/i18n");
      captured = {
        prompt,
        systemInstruction: (systemInstruction || "") + (options.language ? languageDirective(options.language) : ""),
        chatHistory,
        prefix: options.cachedSystemPrefix || "",
      };
    }
    return "OK";
  };
  require("../services/pushNotificationService").sendPushToUser = async () => {};
  require("../services/utils").getWeatherContext = async () =>
    "\nWEATHER CONTEXT:\nCurrent Weather: 12°C, Wind: 14 km/h, Precipitation: 0 mm/h (Daily total: 0 mm).\n";
  const db = require("../services/db");
  const get = (sql, p = []) => new Promise((r) => db.get(sql, p, (e, row) => r(e ? null : row)));
  await new Promise((r) => setTimeout(r, 1500)); // let db.js migrations settle

  let userId = userArg ? Number(userArg) : null;
  if (!userId) {
    const row = await get(
      `SELECT user_id, COUNT(*) AS n FROM chat_history WHERE role = 'user' AND timestamp >= datetime('now', '-14 days') GROUP BY user_id ORDER BY n DESC LIMIT 1`,
    );
    if (!row) throw new Error("No athlete sent a chat message in the last 14 days; pass a user id.");
    userId = row.user_id;
  }
  // The snapshot is throwaway, so make sure the consent gate and budget don't stop the run.
  await new Promise((r) => db.run(`UPDATE users SET ai_consent = 1 WHERE id = ?`, [userId], () => r()));
  await new Promise((r) => db.run(`UPDATE users SET daily_token_usage = 0 WHERE id = ?`, [userId], () => r()));

  const router = require("../routes/chat");
  const layer = router.stack.find((l) => l.route && l.route.path === "/api/chat" && l.route.methods.post);
  const handler = layer.route.stack[layer.route.stack.length - 1].handle;
  await new Promise((resolve) => {
    const res = { status() { return this; }, json: () => resolve() };
    handler({ user: { id: userId }, body: { message: "Top!" } }, res);
    setTimeout(resolve, 30000);
  });
  if (!captured) throw new Error(`No chat prompt was built for athlete ${userId}.`);

  const { systemInstruction, chatHistory, prefix } = captured;
  const context = systemInstruction.startsWith(prefix) ? systemInstruction.slice(prefix.length) : systemInstruction;

  // Section headers in the order chat.js writes them; anything before the first is the
  // discipline drills, image status and cycle text.
  const headers = [
    ["persona", "COACH PERSONA:"],
    ["season plan", "SEASON PLAN ("],
    ["phase + time", "Current Training Phase:"],
    ["time context", "TIME CONTEXT:"],
    ["weather", "WEATHER CONTEXT:"],
    ["athlete context", "ATHLETE CONTEXT:"],
    ["nutrition today", "TODAY'S LOGGED NUTRITION"],
    ["facts memory", "WHAT YOU KNOW ABOUT THE ATHLETE"],
    ["metrics", "PHYSIOLOGICAL METRICS:"],
    ["heart-rate zones", "HEART-RATE ZONES:"],
    ["biometrics", "ATHLETE RECOVERY & BIOMETRICS (FROM"],
    ["milestones", "UPCOMING EVENTS/MILESTONES:"],
    ["availability", "DAILY EXERCISE LIMITATIONS & WEEKLY SCHEDULE BOUNDARIES:\n"],
    ["recurring sports", "RECURRING SPORTS & PERIODICAL TRAININGS (NON-ROOKA ACTIVITIES):\n"],
    ["constraints", "TRAINING CONSTRAINTS: TRAVEL"],
    ["planned workouts", "UPCOMING SCHEDULED WORKOUTS (Microplan):\n"],
    ["deleted-workout archive", "RECENTLY DELETED WORKOUTS (TEMPORARY ARCHIVE - AVAILABLE FOR RESTORATION):\n"],
    ["recent activities", "RECENT COMPLETED WORKOUTS"],
    ["strength history", "RECENT STRENGTH & PB HISTORY"],
    ["muscle status", "MUSCLE STATUS (Fatigue"],
    ["benchmarks", "BENCHMARK ASSESSMENTS"],
    ["injuries", "ACTIVE INJURIES / NIGGLES (REAL"],
    ["gamification", "GAMIFICATION:"],
    ["language directive", "LANGUAGE (MANDATORY):"],
  ];
  const found = headers
    .map(([name, h]) => ({ name, i: context.indexOf(h) }))
    .filter((x) => x.i >= 0)
    .sort((a, b) => a.i - b.i);
  const sections = [];
  if (found.length && found[0].i > 0) sections.push({ name: "image + cycle rules", text: context.slice(0, found[0].i) });
  found.forEach((x, j) => sections.push({ name: x.name, text: context.slice(x.i, j + 1 < found.length ? found[j + 1].i : context.length) }));
  const historyText = chatHistory.map((t) => t.parts.map((p) => p.text || "").join("")).join("\n");
  sections.push({ name: `chat history (${chatHistory.length} turns)`, text: historyText });

  let count = (text) => Math.round(text.length / CHARS_PER_TOKEN);
  if (exact) {
    const { GoogleGenAI } = require("@google/genai");
    const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY2 });
    const cache = new Map();
    for (const s of [{ text: prefix }, ...sections]) {
      if (!s.text.trim()) continue;
      const r = await client.models.countTokens({ model: "gemini-3.8-flash", contents: s.text });
      cache.set(s.text, r.totalTokens);
    }
    count = (text) => cache.get(text) || 0;
  }
  for (const s of sections) s.tokens = count(s.text);
  sections.sort((a, b) => b.tokens - a.tokens);

  const total = sections.reduce((n, s) => n + s.tokens, 0);
  const unit = exact ? "tokens" : "~tokens";
  console.log(`\nAthlete ${userId}: uncached part of one chat message (${exact ? "exact" : `estimated at ${CHARS_PER_TOKEN} chars/token`})\n`);
  for (const s of sections) {
    console.log(`${s.name.padEnd(40)} ${String(s.tokens).padStart(6)} ${unit}  ${((100 * s.tokens) / total).toFixed(0).padStart(3)}%   ${String(s.text.length).padStart(6)} chars`);
  }
  console.log(`${"TOTAL uncached".padEnd(40)} ${String(total).padStart(6)} ${unit}`);
  console.log(`${"cached prefix: rules + drills (reference)".padEnd(40)} ${String(count(prefix)).padStart(6)} ${unit}`);

  db.close(() => {
    fs.rmSync(snapshot, { force: true });
    process.exit(0);
  });
})().catch((err) => {
  console.error("❌", err.message);
  fs.rmSync(snapshot, { force: true });
  process.exit(1);
});
