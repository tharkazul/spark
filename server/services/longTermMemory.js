/**
 * Keeps the coach's knowledge of the athlete up to date.
 *
 * The knowledge lives in athlete_facts (services/athleteFacts.js) as separate,
 * dated facts. Two writers:
 *   - the chat route applies the coach's `facts` / `memory` blocks directly;
 *   - the background pass below reads recent chat plus the injury and constraint
 *     tables and returns small edits (add / update / remove one fact), so a fact
 *     is never lost because a whole summary was rewritten.
 * users.long_term_memory is re-rendered from the facts after every change.
 */
const db = require("./db");
const { hasAiConsent } = require("./aiConsent");
const { generateWithFallback } = require("./ai");
const constraintsService = require("./athleteConstraints");
const facts = require("./athleteFacts");
const i18n = require("./i18n");

const HISTORY_ROWS = 20;

const all = (sql, params) =>
  new Promise((resolve) => db.all(sql, params, (err, rows) => resolve(err || !rows ? [] : rows)));
const get = (sql, params) =>
  new Promise((resolve) => db.get(sql, params, (err, row) => resolve(err ? null : row || null)));

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
  await facts.addFact(userId, { text: clean, source: "coach" });
  await facts.renderMemory(userId);
}

function chatTimestampDate(ts) {
  return ts ? String(ts).slice(0, 10) : "";
}

async function summarizeOnce(userId) {
  if (!(await hasAiConsent(userId))) return undefined; // AI is off without the athlete's consent

  const user = await get(`SELECT language FROM users WHERE id = ?`, [userId]);
  if (!user) return;
  await facts.migrateUser(userId);
  const todayStr = amsToday();
  const current = await facts.listFacts(userId);

  const niggleRows = await all(`SELECT body_part, severity, notes, status FROM athlete_niggles WHERE user_id = ?`, [userId]);
  const activeNiggles = niggleRows.filter((n) => n.status === "active");
  const activeText =
    activeNiggles.length > 0
      ? activeNiggles.map((n) => `- ${n.body_part}: Severity ${n.severity}/5. ${n.notes || ""}`).join("\n")
      : "None. The athlete is fully healthy.";

  const constraints = await constraintsService.getCurrentAndUpcomingConstraints(userId, todayStr);
  const constraintsText = constraintsService.formatConstraintsForPrompt(constraints, todayStr);

  // With Garmin data in the coach's context, the coach's replies can carry it, and Garmin's
  // license (§15.11) bars an AI-generated knowledge base built from it. Then this pass
  // reads only what the athlete wrote, so nothing derived from Garmin data reaches the facts.
  const athleteOnly = await require("./garmin").hasGarminData(userId);
  const historyRows = await all(
    `SELECT role, content, timestamp FROM (SELECT * FROM chat_history WHERE user_id = ?${athleteOnly ? " AND role = 'user'" : ""} ORDER BY id DESC LIMIT ?) ORDER BY id ASC`,
    [userId, HISTORY_ROWS]
  );
  const historyText =
    historyRows.length > 0
      ? historyRows.map((r) => `[${chatTimestampDate(r.timestamp)}] ${String(r.role).toUpperCase()}: ${r.content}`).join("\n")
      : "No recent chat.";

  const prompt = `You maintain what an endurance coach knows about one athlete, as a list of separate facts.

TODAY: ${todayStr} (Europe/Amsterdam)

CURRENT FACTS (id, category, text, optional end date):
${facts.formatFacts(current)}

ACTIVE INJURIES (the injury table is the truth; do not store injuries as facts):
${activeText}

TRAINING CONSTRAINTS (travel / illness / equipment; the constraint table is the truth for dates):
${constraintsText}

${athleteOnly ? "RECENT MESSAGES FROM THE ATHLETE (only their own words; each line starts with the date it was sent)" : "RECENT CHAT (each line starts with the date it was sent)"}:
${historyText}

Return ONLY JSON: {"ops": [...]} with the smallest set of edits that keeps the facts true and useful:
- {"op": "add", "category": "life|schedule|goal|preference|health|experience", "text": "...", "until": "YYYY-MM-DD or null"}
- {"op": "update", "id": 12, "text": "...", "until": "YYYY-MM-DD or null"}
- {"op": "remove", "id": 12}
Rules:
1. One fact per item, one short sentence, written in ${i18n.languageName(user.language)}. Lasting things (family, job, when they can train, how they like to be coached, goals, experience) and temporary things with an end date (a trip, a busy work period).
2. Absolute dates only: convert "next week" etc. using the date each message was sent.
3. Update a fact that changed (e.g. "twins due in March" -> "twins born on 2026-03-14") instead of adding a second one. Remove facts that are no longer true.
4. No numbers that belong in metrics (FTP, max HR, resting HR, paces) and no injuries: those have their own tables. Nothing taken from synced workouts or watch data either (distances, times, heart rate, HRV, sleep, steps, weight, VO2 max), also not from the coach's reactions to them: that data stays with its source and must not be copied into facts.
5. Don't repeat what is already there. If nothing changed, return {"ops": []}.
6. At most ${40} facts in total; merge small related facts.`;

  const raw = await generateWithFallback(prompt, null, null, null, userId, "common", true, { language: user.language });
  let ops = [];
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw.replace(/^```json\s*|```$/g, "").trim()) : raw;
    ops = Array.isArray(parsed?.ops) ? parsed.ops : [];
  } catch (_) {
    return;
  }
  await facts.applyOps(userId, ops, "coach");
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
        console.log(`✅ Updated coach facts for user ${userId}`);
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
