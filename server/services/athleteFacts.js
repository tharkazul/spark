/**
 * What the coach knows about the athlete, as structured, editable records.
 *
 * - athlete_facts: one row per fact ("Can only train at lunch on workdays"), with a
 *   category, where it came from, an optional end date for temporary facts (a
 *   trip, an illness) and when it last changed. The coach adds, updates and
 *   removes single facts instead of rewriting one block of text, and the athlete
 *   sees and edits the same list in Profile -> Coach.
 * - athlete_metrics: baseline numbers under fixed names (ftp, max_hr, ...), each
 *   with a source and a date, so the latest value is always the one used.
 *
 * users.long_term_memory is kept as a rendered view of the facts (renderMemory),
 * so every prompt that already reads it gets the clean, dated list.
 */
const db = require("./db");

const all = (sql, p = []) => new Promise((r) => db.all(sql, p, (e, rows) => r(e || !rows ? [] : rows)));
const get = (sql, p = []) => new Promise((r) => db.get(sql, p, (e, row) => r(e ? null : row || null)));
const run = (sql, p = []) => new Promise((res, rej) => db.run(sql, p, function (e) { return e ? rej(e) : res(this); }));

const CATEGORIES = ["life", "schedule", "goal", "preference", "health", "experience"];
const SOURCES = ["athlete", "coach", "onboarding", "migrated"];
const MAX_FACTS = 40;

// Canonical metric names; anything else is stored under its own label.
const METRIC_ALIASES = {
  ftp: ["ftp", "ftp (watts)", "ftp watts", "functional threshold power"],
  max_hr: ["max_hr", "maxhr", "max hr", "max heart rate", "maximum hr", "hr max"],
  resting_hr: ["resting_hr", "restinghr", "resting hr", "rest hr", "resting heart rate", "rhr"],
  threshold_hr: ["threshold_hr", "lthr", "lactate threshold hr", "lactate threshold heart rate", "threshold hr", "threshold heart rate"],
  threshold_pace: ["threshold_pace", "lactate threshold pace", "threshold pace", "lt pace", "ltp"],
  css: ["css", "critical swim speed", "swim threshold", "css pace"],
  vo2max: ["vo2max", "vo2 max", "vo2_max"],
};
// Settings that live in the same table but aren't athlete metrics.
const SYSTEM_METRICS = new Set(["strava_opt_out_activities", "strava_share_settings"]);

function canonicalMetricKey(raw) {
  const k = String(raw || "").trim().toLowerCase().replace(/\s+/g, " ");
  for (const [canonical, aliases] of Object.entries(METRIC_ALIASES)) {
    if (aliases.includes(k)) return canonical;
  }
  return String(raw || "").trim().slice(0, 40);
}

function todayStr() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Amsterdam" });
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const cleanDate = (d) => (d && DATE_RE.test(String(d).slice(0, 10)) ? String(d).slice(0, 10) : null);
const cleanCategory = (c) => (CATEGORIES.includes(c) ? c : null);

// Keyword guess for facts that arrive without a category (old memory lines, the
// legacy `memory` directive). Covers the five app languages.
function guessCategory(text) {
  const s = String(text || "").toLowerCase();
  if (/injur|pain|knee|achilles|calf|hamstring|shin|back pain|asthma|blessure|pijn|verletz|schmerz|lesi|dolor|bless|douleur/.test(s)) return "health";
  if (/prefer|likes?\b|dislikes?|hates?|enjoys?|wants? to|doesn'?t like|houdt van|liever|hekel aan|bevorzugt|mag gern|prefiere|préfère|aime/.test(s)) return "preference";
  if (/holiday|vacation|travel|trip|abroad|flight|sick|\bill\b|flu|vakantie|reis|ziek|urlaub|reise|krank|vacaciones|viaje|enferm|vacances|voyage|malade|no bike|no gym|geen fiets|lunch|weekend|nap|morning|evening|before work|after work|schedule/.test(s)) return "schedule";
  if (/goal|target|race|marathon|triathlon|ironman|70\.3|5k|10k|doel|ziel|objetivo|objectif|lose weight|afvallen/.test(s)) return "goal";
  if (/years? of|ran .*before|previous|history|former|ex-|used to|experience|ervaring|erfahrung|experiencia|expérience/.test(s)) return "experience";
  return "life";
}

// "Italy 2026-10-12 to 2026-10-18" -> 2026-10-18: the last date in a range.
function guessUntil(text) {
  const m = String(text || "").match(/\d{4}-\d{2}-\d{2}\s*(?:to|-|–|tot|bis|hasta|au|until)\s*(\d{4}-\d{2}-\d{2})/i);
  return m ? m[1] : null;
}

function ensureTables() {
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS athlete_facts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      category TEXT NOT NULL,
      text TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'coach',
      valid_until TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_athlete_facts_user ON athlete_facts(user_id)`);
    db.run(`ALTER TABLE athlete_metrics ADD COLUMN source TEXT`, () => {});
    db.run(`ALTER TABLE athlete_metrics ADD COLUMN updated_at TEXT`, () => {});
    db.run(`ALTER TABLE users ADD COLUMN facts_migrated INTEGER DEFAULT 0`, () => {});
  });
}
ensureTables();

// ---------------------------------------------------------------------------
// Facts
// ---------------------------------------------------------------------------
async function listFacts(userId) {
  return all(
    `SELECT id, category, text, source, valid_until, created_at, updated_at FROM athlete_facts
     WHERE user_id = ? AND (valid_until IS NULL OR valid_until >= ?)
     ORDER BY CASE category ${CATEGORIES.map((c, i) => `WHEN '${c}' THEN ${i}`).join(" ")} ELSE 99 END, updated_at DESC`,
    [userId, todayStr()]
  );
}

async function addFact(userId, { category, text, until, source = "coach" }) {
  const clean = String(text || "").replace(/^\s*[-•*]\s*/, "").trim().slice(0, 400);
  if (!clean) return null;
  const existing = await get(`SELECT id FROM athlete_facts WHERE user_id = ? AND lower(text) = lower(?)`, [userId, clean]);
  if (existing) return existing.id;
  const count = await get(`SELECT COUNT(*) AS n FROM athlete_facts WHERE user_id = ?`, [userId]);
  if (count && count.n >= MAX_FACTS * 2) return null; // hard stop against runaway writes
  const res = await run(
    `INSERT INTO athlete_facts (user_id, category, text, source, valid_until) VALUES (?, ?, ?, ?, ?)`,
    [userId, cleanCategory(category) || guessCategory(clean), clean, SOURCES.includes(source) ? source : "coach", cleanDate(until) || guessUntil(clean)]
  );
  return res.lastID;
}

async function updateFact(userId, id, { category, text, until }) {
  const row = await get(`SELECT * FROM athlete_facts WHERE id = ? AND user_id = ?`, [id, userId]);
  if (!row) return false;
  const nextText = text !== undefined ? String(text).trim().slice(0, 400) : row.text;
  if (!nextText) return deleteFact(userId, id);
  await run(
    `UPDATE athlete_facts SET category = ?, text = ?, valid_until = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`,
    [
      cleanCategory(category) || row.category,
      nextText,
      until === null ? null : until !== undefined ? cleanDate(until) : row.valid_until,
      id,
      userId,
    ]
  );
  return true;
}

async function deleteFact(userId, id) {
  const res = await run(`DELETE FROM athlete_facts WHERE id = ? AND user_id = ?`, [id, userId]);
  return res.changes > 0;
}

/**
 * Applies coach edits: [{op: "add", category, text, until} | {op: "update", id, text?, category?, until?} | {op: "remove", id}].
 * Unknown ids are ignored, so a stale reference can't touch another athlete's data.
 */
async function applyOps(userId, ops, source = "coach") {
  if (!Array.isArray(ops)) return 0;
  let changed = 0;
  for (const o of ops.slice(0, 20)) {
    if (!o || typeof o !== "object") continue;
    const op = String(o.op || o.action || "").toLowerCase();
    const id = Number(o.id);
    try {
      if (op === "add" && o.text) {
        if (await addFact(userId, { category: o.category, text: o.text, until: o.until, source })) changed++;
      } else if (op === "update" && id) {
        if (await updateFact(userId, id, { category: o.category, text: o.text, until: o.until })) changed++;
      } else if ((op === "remove" || op === "delete" || op === "end") && id) {
        if (await deleteFact(userId, id)) changed++;
      }
    } catch (e) {
      console.warn(`[Facts] op failed for user ${userId}:`, e.message);
    }
  }
  if (changed) await renderMemory(userId);
  return changed;
}

const CATEGORY_TITLES = {
  life: "Life",
  schedule: "Schedule & availability",
  goal: "Goals",
  preference: "Preferences",
  health: "Health",
  experience: "Training history",
};

/** Text view of the facts, for prompts. Ids let the coach update or remove a fact. */
function formatFacts(facts) {
  if (!facts.length) return "Nothing recorded yet.";
  const out = [];
  for (const c of CATEGORIES) {
    const rows = facts.filter((f) => f.category === c);
    if (!rows.length) continue;
    out.push(`${CATEGORY_TITLES[c]}:`);
    for (const f of rows) {
      const until = f.valid_until ? ` (until ${f.valid_until})` : "";
      out.push(`- [#${f.id}] ${f.text}${until} (updated ${String(f.updated_at || "").slice(0, 10)})`);
    }
  }
  return out.join("\n");
}

/** Rewrites users.long_term_memory from the facts, and clears facts that ended long ago. */
async function renderMemory(userId) {
  const cutoff = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
  await run(`DELETE FROM athlete_facts WHERE user_id = ? AND valid_until IS NOT NULL AND valid_until < ?`, [userId, cutoff]).catch(() => {});
  const text = formatFacts(await listFacts(userId));
  await run(`UPDATE users SET long_term_memory = ? WHERE id = ?`, [text === "Nothing recorded yet." ? "" : text, userId]);
  return text;
}

/**
 * Synchronizes the athlete's primary active goal from the milestones table into athlete_facts
 * and updates long_term_memory. Removes or updates any obsolete/stale goal facts.
 */
async function syncGoalMilestones(userId) {
  if (!userId) return;
  const milestones = await all(
    `SELECT name, date, target_ctl, is_main, goal_type, target_mode, target_value, target_weight, target_vo2max 
     FROM milestones WHERE user_id = ? 
     ORDER BY is_main DESC, date ASC`,
    [userId]
  );

  const mainGoal = milestones.find((m) => m.is_main === 1) || milestones[0];
  if (!mainGoal || !mainGoal.name) {
    const existing = await all(`SELECT id FROM athlete_facts WHERE user_id = ? AND category = 'goal'`, [userId]);
    for (const f of existing) {
      await deleteFact(userId, f.id);
    }
    await renderMemory(userId);
    return;
  }

  let goalDesc = mainGoal.name;
  if (mainGoal.target_value) {
    goalDesc += ` (target: ${mainGoal.target_value})`;
  } else if (mainGoal.target_weight) {
    goalDesc += ` (target weight: ${mainGoal.target_weight} kg)`;
  }
  const factText = mainGoal.date
    ? `Target goal: ${goalDesc} on ${mainGoal.date}`
    : `Target goal: ${goalDesc}`;

  const existingGoalFacts = await all(
    `SELECT id, text FROM athlete_facts WHERE user_id = ? AND category = 'goal'`,
    [userId]
  );

  const alreadyExact = existingGoalFacts.find((f) => f.text.toLowerCase() === factText.toLowerCase());
  if (alreadyExact) {
    if (mainGoal.date) {
      await updateFact(userId, alreadyExact.id, { until: mainGoal.date });
    }
    for (const f of existingGoalFacts) {
      if (f.id !== alreadyExact.id) await deleteFact(userId, f.id);
    }
    await renderMemory(userId);
    return;
  }

  // Remove older / conflicting goal facts so memory stays clean and authoritative
  for (const f of existingGoalFacts) {
    await deleteFact(userId, f.id);
  }

  await addFact(userId, {
    category: "goal",
    text: factText,
    until: mainGoal.date || null,
    source: "athlete",
  });

  await renderMemory(userId);
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------
async function setMetric(userId, rawKey, value, source = "athlete", { ifMissing = false } = {}) {
  const key = canonicalMetricKey(rawKey);
  const val = String(value ?? "").trim().slice(0, 40);
  if (!key || !val || SYSTEM_METRICS.has(key)) return null;
  if (ifMissing) {
    // Migration: an existing value (under any spelling) is newer than the onboarding text.
    const existing = await all(`SELECT metric FROM athlete_metrics WHERE user_id = ?`, [userId]);
    if (existing.some((r) => canonicalMetricKey(r.metric) === key)) return null;
  }
  // An older row may use another spelling of the same metric; keep only the canonical one.
  const rows = await all(`SELECT id, metric FROM athlete_metrics WHERE user_id = ?`, [userId]);
  for (const r of rows) {
    if (r.metric !== key && !SYSTEM_METRICS.has(r.metric) && canonicalMetricKey(r.metric) === key) {
      await run(`DELETE FROM athlete_metrics WHERE id = ?`, [r.id]).catch(() => {});
    }
  }
  await run(
    `INSERT INTO athlete_metrics (user_id, metric, value, source, updated_at) VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(user_id, metric) DO UPDATE SET value = excluded.value, source = excluded.source, updated_at = excluded.updated_at`,
    [userId, key, val, source]
  );
  return key;
}

async function listMetrics(userId) {
  const rows = await all(`SELECT metric, value, source, updated_at FROM athlete_metrics WHERE user_id = ?`, [userId]);
  return rows
    .filter((r) => !SYSTEM_METRICS.has(r.metric))
    .map((r) => ({ key: canonicalMetricKey(r.metric), value: r.value, source: r.source || null, updatedAt: r.updated_at || null }));
}

async function deleteMetric(userId, key) {
  const target = canonicalMetricKey(key);
  const rows = await all(`SELECT id, metric FROM athlete_metrics WHERE user_id = ?`, [userId]);
  let n = 0;
  for (const r of rows) {
    if (!SYSTEM_METRICS.has(r.metric) && canonicalMetricKey(r.metric) === target) {
      await run(`DELETE FROM athlete_metrics WHERE id = ?`, [r.id]);
      n++;
    }
  }
  return n > 0;
}

/** "FTP: 285 (since 2026-10-03, coach), Max HR: 192 (...)" for prompts. */
async function formatMetricsForPrompt(userId) {
  const rows = await listMetrics(userId);
  if (!rows.length) return "None explicitly recorded yet.";
  return rows
    .map((m) => `${m.key}: ${m.value}${m.updatedAt ? ` (as of ${String(m.updatedAt).slice(0, 10)}${m.source ? `, ${m.source}` : ""})` : ""}`)
    .join(", ");
}

/** Splits "[Metrics: FTP (Watts): 272, Max HR: 192]" out of free text. */
function extractMetricsBlock(text) {
  const s = String(text || "");
  const pairs = [];
  const stripped = s.replace(/\s*\[Metrics:\s*(.*?)\]/gis, (_, body) => {
    for (const part of String(body).split(",")) {
      // The first colon separates label and value: values like 5:03 contain one too.
      const idx = part.indexOf(":");
      if (idx <= 0) continue;
      const label = part.slice(0, idx).trim();
      const value = part.slice(idx + 1).trim();
      if (label && value) pairs.push([label, value]);
    }
    return "";
  });
  return { text: stripped.trim(), pairs };
}

/** Saves athlete-written background text: metrics go to the table, the rest stays as text. */
async function cleanAthleteContext(userId, text, source = "athlete", options = {}) {
  const { text: clean, pairs } = extractMetricsBlock(text);
  for (const [label, value] of pairs) await setMetric(userId, label, value, source, options);
  return clean;
}

// ---------------------------------------------------------------------------
// One-time move from the old free-text memory and context
// ---------------------------------------------------------------------------
async function migrateUser(userId) {
  const u = await get(`SELECT id, long_term_memory, athlete_context, facts_migrated FROM users WHERE id = ?`, [userId]);
  if (!u || u.facts_migrated) return false;

  const lines = String(u.long_term_memory || "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !/:$/.test(l) && !/^nothing recorded/i.test(l));
  for (const line of lines) {
    await addFact(userId, { text: line.replace(/^\[#\d+\]\s*/, ""), source: "migrated" });
  }

  if (/\[Metrics:/i.test(u.athlete_context || "")) {
    const clean = await cleanAthleteContext(userId, u.athlete_context, "onboarding", { ifMissing: true });
    await run(`UPDATE users SET athlete_context = ? WHERE id = ?`, [clean, userId]);
  }
  // Older metric rows get a date so "latest wins" has something to compare.
  await run(`UPDATE athlete_metrics SET updated_at = COALESCE(updated_at, datetime('now')) WHERE user_id = ?`, [userId]);
  await run(`UPDATE users SET facts_migrated = 1 WHERE id = ?`, [userId]);
  await renderMemory(userId);
  return true;
}

async function migrateAll() {
  const users = await all(`SELECT id FROM users WHERE COALESCE(facts_migrated, 0) = 0`);
  let n = 0;
  for (const u of users) {
    try {
      if (await migrateUser(u.id)) n++;
    } catch (e) {
      console.warn(`[Facts] migration failed for user ${u.id}:`, e.message);
    }
  }
  if (n) console.log(`[Facts] moved memory and metrics of ${n} athlete(s) into athlete_facts`);
}
// Runs once the column above exists; harmless to repeat (migrated users are skipped).
setTimeout(() => migrateAll().catch((e) => console.warn("[Facts] migration:", e.message)), 1500);

module.exports = {
  CATEGORIES,
  listFacts,
  addFact,
  updateFact,
  deleteFact,
  applyOps,
  formatFacts,
  renderMemory,
  syncGoalMilestones,
  setMetric,
  listMetrics,
  deleteMetric,
  formatMetricsForPrompt,
  extractMetricsBlock,
  cleanAthleteContext,
  canonicalMetricKey,
  guessCategory,
  migrateUser,
  migrateAll,
};
