/**
 * The coach's rolling long-term memory (users.long_term_memory).
 *
 * Two writers touch it: the chat route appends notes from `memory` directives, and the
 * background summary rewrites the whole text with an LLM. Both used to read, modify and
 * write without coordination, so a summary that started before a note was appended would
 * finish seconds later and overwrite it; the travel note the coach had just saved was the
 * usual casualty. Now:
 *   - the summary takes the serialized-transaction lock for its read-merge-write and merges
 *     in any lines that were added while the LLM was running (the chat route appends inside
 *     its own serialized transaction, so the two can't interleave);
 *   - concurrent summary requests for the same athlete collapse into one follow-up run;
 *   - the summary prompt knows today's date, must store absolute dates, drops events that
 *     are over, and treats injuries and constraints from their tables as the truth.
 */
const db = require("./db");
const { hasAiConsent } = require("./aiConsent");
const { generateWithFallback } = require("./ai");
const constraintsService = require("./athleteConstraints");

const HISTORY_ROWS = 20;
const MAX_WORDS = 250;

const all = (sql, params) =>
  new Promise((resolve) => db.all(sql, params, (err, rows) => resolve(err || !rows ? [] : rows)));
const get = (sql, params) =>
  new Promise((resolve) => db.get(sql, params, (err, row) => resolve(err ? null : row || null)));
const run = (sql, params) =>
  new Promise((resolve, reject) => db.run(sql, params, (err) => (err ? reject(err) : resolve())));

function amsToday() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Amsterdam" });
}

/**
 * Appends one note. Callers inside a serialized transaction (the chat route) call this
 * directly; the summary's merge step can't run in between.
 */
async function appendMemoryNote(userId, note) {
  const clean = String(note || "").trim();
  if (!clean) return;
  const row = await get(`SELECT long_term_memory FROM users WHERE id = ?`, [userId]);
  const existing = (row?.long_term_memory || "").trim();
  const line = clean.startsWith("-") ? clean : `- ${clean}`;
  if (existing.split("\n").some((l) => l.trim() === line)) return;
  await run(`UPDATE users SET long_term_memory = ? WHERE id = ?`, [existing ? `${existing}\n${line}` : line, userId]);
}

function chatTimestampDate(ts) {
  return ts ? String(ts).slice(0, 10) : "";
}

async function summarizeOnce(userId) {
  if (!(await hasAiConsent(userId))) return undefined; // AI is off without the athlete's consent

  const user = await get(`SELECT long_term_memory FROM users WHERE id = ?`, [userId]);
  if (!user) return;
  const snapshot = (user.long_term_memory || "").trim();
  const todayStr = amsToday();

  const niggleRows = await all(`SELECT body_part, severity, notes, status FROM athlete_niggles WHERE user_id = ?`, [userId]);
  const activeNiggles = niggleRows.filter((n) => n.status === "active");
  const resolvedNiggles = niggleRows.filter((n) => n.status === "resolved");
  const activeText =
    activeNiggles.length > 0
      ? activeNiggles.map((n) => `- ${n.body_part}: Severity ${n.severity}/5. ${n.notes || ""}`).join("\n")
      : "No active injuries or niggles reported. Athlete is 100% healthy.";
  const resolvedText =
    resolvedNiggles.length > 0 ? resolvedNiggles.map((n) => `- ${n.body_part}: HEALED / RESOLVED`).join("\n") : "None.";

  const constraints = await constraintsService.getCurrentAndUpcomingConstraints(userId, todayStr);
  const constraintsText = constraintsService.formatConstraintsForPrompt(constraints, todayStr);

  const historyRows = await all(
    `SELECT role, content, timestamp FROM (SELECT * FROM chat_history WHERE user_id = ? ORDER BY id DESC LIMIT ?) ORDER BY id ASC`,
    [userId, HISTORY_ROWS]
  );
  const historyText =
    historyRows.length > 0
      ? historyRows.map((r) => `[${chatTimestampDate(r.timestamp)}] ${String(r.role).toUpperCase()}: ${r.content}`).join("\n")
      : "No recent chat.";

  const prompt = `You are a background AI assistant for an endurance coach app. Your job is to update the athlete's long-term memory summary based on recent chat history and the app's real-time records.

TODAY'S DATE: ${todayStr} (Europe/Amsterdam)

CURRENT LONG-TERM MEMORY:
${snapshot || "No summary yet."}

REAL-TIME ACTIVE INJURIES (REALITY / TRUTH):
${activeText}

REAL-TIME RESOLVED / HEALED INJURIES (REALITY / TRUTH):
${resolvedText}

REAL-TIME TRAINING CONSTRAINTS: TRAVEL / ILLNESS / EQUIPMENT (REALITY / TRUTH):
${constraintsText}

RECENT CHAT HISTORY (each line starts with the date it was sent):
${historyText}

INSTRUCTIONS & CRITICAL RULES:
1. INJURY TRUTH: Refer strictly to the ACTIVE INJURIES list above. If an injury is listed under RESOLVED INJURIES or is NOT in ACTIVE INJURIES, REMOVE IT COMPLETELY from current physical issues in the summary. Note it as fully healed or omit it.
2. ABSOLUTE DATES ONLY: Never write relative time ("next week", "tomorrow", "in two weeks", "this weekend"). Convert every one to calendar dates using the date each chat message was sent (e.g. a message sent on 2026-10-07 saying "next week" means 2026-10-12 to 2026-10-18).
3. TRAVEL, HOLIDAYS, ILLNESS & EQUIPMENT (CRITICAL): Record trips, holidays, time away, missing equipment (no bike, no gym) and illness with destination, start and end dates and the agreed training changes (e.g. "Italy 2026-10-12 to 2026-10-18: running only, easy Zone 2, no bike, no gym"). The CONSTRAINTS list above is the truth for dates and rules; if the chat and the list disagree, follow the list.
4. EXPIRY: Remove trips, illnesses and temporary limits whose end date is before ${todayStr}, or shorten them to a single past-tense line if they still matter (e.g. "Back from Italy since 2026-10-18").
5. Keep lasting facts: goals, preferences, life context, baseline numbers, how the athlete likes to be coached. Do not drop a lasting fact just because it is not in the recent chat.
6. Keep it concise (under ${MAX_WORDS} words), as short dated bullet points. No pleasantries. Output only the updated summary text.`;

  const newSummary = String((await generateWithFallback(prompt)) || "").trim();
  if (!newSummary) return;

  // Merge under the lock: anything appended while the LLM was busy is kept.
  const release = await db.beginSerializedTransaction("memory-summary");
  try {
    const current = ((await get(`SELECT long_term_memory FROM users WHERE id = ?`, [userId]))?.long_term_memory || "").trim();
    const snapshotLines = new Set(snapshot.split("\n").map((l) => l.trim()).filter(Boolean));
    const addedMeanwhile = current
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !snapshotLines.has(l));
    const merged = addedMeanwhile.length > 0 ? `${newSummary}\n${addedMeanwhile.join("\n")}` : newSummary;
    await run(`UPDATE users SET long_term_memory = ? WHERE id = ?`, [merged, userId]);
    await run("COMMIT", []);
  } catch (err) {
    await run("ROLLBACK", []).catch(() => {});
    throw err;
  } finally {
    release();
  }
}

const inFlight = new Map(); // userId -> { again: boolean }

/** Rewrites the memory in the background. Overlapping calls collapse into one follow-up run. */
async function triggerBackgroundSummary(userId) {
  const pending = inFlight.get(userId);
  if (pending) {
    pending.again = true;
    return;
  }
  const state = { again: false };
  inFlight.set(userId, state);
  console.log(`🤖 Triggering background rolling summary for user ${userId}...`);
  try {
    do {
      state.again = false;
      try {
        await summarizeOnce(userId);
        console.log(`✅ Updated long-term memory for user ${userId}`);
      } catch (e) {
        console.error(`❌ Failed to update long-term memory for user ${userId}:`, e);
      }
    } while (state.again);
  } finally {
    inFlight.delete(userId);
  }
}

// Messages that mention a life event, in every app language. Kept broad on purpose: a
// summary too many costs one cheap LLM call, a missed trip costs the athlete's trust.
const LIFE_EVENT_RE = new RegExp(
  [
    // en
    "holiday", "vacation", "travel", "\\btrip", "flight", "hotel", "airbnb", "abroad", "away from", "sick", "\\bill\\b", "\\bflu\\b", "covid", "injur", "no bike", "no gym", "wedding",
    // nl
    "vakantie", "\\breis", "reizen", "vlucht", "buitenland", "weg ", "ziek", "griep", "blessure", "geen fiets", "verhuis", "bruiloft",
    // de
    "urlaub", "reise", "flug", "ausland", "krank", "erkält", "verletz", "kein rad", "kein fahrrad", "umzug", "hochzeit",
    // es
    "vacaciones", "viaje", "vuelo", "extranjero", "enferm", "gripe", "lesi[oó]n", "sin bici", "mudanza", "boda",
    // fr
    "vacances", "voyage", "[ée]tranger", "malade", "grippe", "bless", "pas de v[ée]lo", "d[ée]m[ée]nag", "mariage",
  ].join("|"),
  "i"
);

function mentionsLifeEvent(message) {
  return LIFE_EVENT_RE.test(String(message || ""));
}

// Re-summarize every few athlete messages even without a keyword. Counted on user rows,
// because one coach reply can be stored as several rows.
const SUMMARY_EVERY_USER_MESSAGES = 4;

async function shouldSummarizeAfterMessage(userId, message) {
  if (mentionsLifeEvent(message)) return true;
  const row = await get(`SELECT COUNT(*) AS count FROM chat_history WHERE user_id = ? AND role = 'user'`, [userId]);
  return Boolean(row && row.count > 0 && row.count % SUMMARY_EVERY_USER_MESSAGES === 0);
}

module.exports = {
  appendMemoryNote,
  triggerBackgroundSummary,
  mentionsLifeEvent,
  shouldSummarizeAfterMessage,
};
