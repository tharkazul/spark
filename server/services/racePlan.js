/**
 * Race plan and race-day moments.
 *
 * - When the taper starts, the coach offers a race plan (a chat message + push,
 *   written without the LLM so it needs no AI consent).
 * - The athlete creates it from the Goal page (or by asking): pacing, fuelling,
 *   race-week checklist and race morning, generated once and stored.
 * - The day after the race, the coach asks for a debrief.
 */
const db = require("./db");
const seasonPlan = require("./seasonPlan");
const goalStatus = require("./goalStatus");
const { hasAiConsent } = require("./aiConsent");
const { generateWithFallback } = require("./ai");
const { sendSSEEvent } = require("./sse");
const { sendPushToUser } = require("./pushNotificationService");
const { resolveCoachName } = require("./coachPersona");
const i18n = require("./i18n");

const dbAll = (sql, params = []) => new Promise((resolve) => db.all(sql, params, (err, rows) => resolve(err || !rows ? [] : rows)));
const dbGet = (sql, params = []) => new Promise((resolve) => db.get(sql, params, (err, row) => resolve(err ? null : row || null)));
const dbRun = (sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, function (err) { return err ? reject(err) : resolve(this); }));

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS race_plans (
    user_id INTEGER NOT NULL,
    race_date TEXT NOT NULL,
    race_name TEXT,
    plan_json TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, race_date)
  )`);
  // One row per moment, so the offer and the debrief are each sent once per race.
  db.run(`CREATE TABLE IF NOT EXISTS race_moments (
    user_id INTEGER NOT NULL,
    race_date TEXT NOT NULL,
    kind TEXT NOT NULL,
    sent_at TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, race_date, kind)
  )`);
});

async function getRacePlan(userId, raceDate) {
  if (!raceDate) return null;
  const row = await dbGet(`SELECT plan_json, created_at FROM race_plans WHERE user_id = ? AND race_date = ?`, [userId, raceDate]);
  if (!row) return null;
  try {
    return { ...JSON.parse(row.plan_json), createdAt: row.created_at };
  } catch (_) {
    return null;
  }
}

function formatHms(sec) {
  if (!sec) return null;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.round(sec % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

/** Generates (or regenerates) the race plan. Throws 'AI_CONSENT_REQUIRED' without consent. */
async function createRacePlan(userId) {
  if (!(await hasAiConsent(userId))) {
    const err = new Error("AI consent required");
    err.code = "AI_CONSENT_REQUIRED";
    throw err;
  }
  const season = await seasonPlan.getSeason(userId);
  if (!season) {
    const err = new Error("No upcoming race");
    err.code = "NO_RACE";
    throw err;
  }
  const user = await dbGet(`SELECT language, coach_tone, coach_name, athlete_context, long_term_memory FROM users WHERE id = ?`, [userId]);
  const weight = await dbGet(`SELECT weight_kg FROM biometrics WHERE user_id = ? AND weight_kg IS NOT NULL ORDER BY date DESC LIMIT 1`, [userId]);
  const status = await goalStatus.getRaceStatus(userId, season);
  const lang = i18n.normalizeLang(user?.language);
  const cfg = seasonPlan.EVENT_TYPES[season.eventType] || seasonPlan.EVENT_TYPES.other;
  const isTri = cfg.discipline === "triathlon";

  const facts = [
    `Race: ${season.raceName} (${season.eventType}) on ${season.raceDate}, in ${season.daysToRace} days.`,
    status?.targetSec ? `Target time: ${formatHms(status.targetSec)}.` : `Goal: finish strong (no target time).`,
    status?.estimateSec ? `Current estimate from recent runs: ${formatHms(status.estimateSec)}.` : null,
    status?.readiness?.length ? `Longest recent sessions vs plan peak: ${status.readiness.map((r) => `${r.sport} ${r.done}/${r.peak} ${r.unit}`).join(", ")}.` : null,
    season.flags?.easyPace ? `Typical easy run pace: ${Math.floor(season.flags.easyPace)}:${String(Math.round((season.flags.easyPace % 1) * 60)).padStart(2, "0")} min/km.` : null,
    weight?.weight_kg ? `Body weight: ${weight.weight_kg} kg.` : null,
    user?.athlete_context ? `Athlete context: ${user.athlete_context}` : null,
    user?.long_term_memory ? `What the coach knows: ${String(user.long_term_memory).slice(0, 1500)}` : null,
  ].filter(Boolean);

  const system = `You are an endurance coach writing a practical race plan for an amateur athlete. ${i18n.languageDirective ? i18n.languageDirective(lang) : `Write in ${i18n.languageName(lang)}.`}
Plain words, short lines, no jargon without a one-line explanation. Be realistic: base pacing on the estimate when it is slower than the target, and say so kindly.
Return ONLY JSON with this shape:
{
  "summary": "2-3 sentences: the strategy in plain words",
  "pacing": [{ "segment": "${isTri ? "e.g. Swim / T1 / Bike 0-30 km / Run 0-5 km" : "e.g. km 0-5"}", "target": "pace, power, heart rate or effort", "note": "one short cue" }],
  "fueling": [{ "when": "e.g. 3 h before / every 30 min / km 25", "what": "what and how much (g carbs, ml fluid, sodium)" }],
  "raceWeek": [{ "day": "e.g. Mon / 3 days before", "items": ["short actionable items"] }],
  "raceMorning": ["short actionable items, in order"],
  "mindset": ["2-4 short cues for when it gets hard"]
}
Use 4-8 pacing segments, 4-8 fuelling moments, 4-6 race-week days.`;

  const raw = await generateWithFallback(
    `Write my race plan.\n${facts.join("\n")}`,
    system,
    null,
    null,
    userId,
    "common",
    true,
    { language: lang }
  );
  let plan;
  try {
    plan = typeof raw === "string" ? JSON.parse(raw.replace(/^```json\s*|```$/g, "").trim()) : raw;
  } catch (e) {
    const err = new Error("Could not read the race plan");
    err.code = "BAD_AI_OUTPUT";
    throw err;
  }
  const clean = {
    summary: String(plan.summary || ""),
    pacing: Array.isArray(plan.pacing) ? plan.pacing.slice(0, 10) : [],
    fueling: Array.isArray(plan.fueling) ? plan.fueling.slice(0, 10) : [],
    raceWeek: Array.isArray(plan.raceWeek) ? plan.raceWeek.slice(0, 8) : [],
    raceMorning: Array.isArray(plan.raceMorning) ? plan.raceMorning.slice(0, 10) : [],
    mindset: Array.isArray(plan.mindset) ? plan.mindset.slice(0, 6) : [],
  };
  await dbRun(
    `INSERT OR REPLACE INTO race_plans (user_id, race_date, race_name, plan_json, created_at) VALUES (?, ?, ?, ?, datetime('now'))`,
    [userId, season.raceDate, season.raceName, JSON.stringify(clean)]
  );
  return getRacePlan(userId, season.raceDate);
}

async function postCoachMessage(userId, user, text, pushTitle) {
  await dbRun(`INSERT INTO chat_history (user_id, role, content, mood, timestamp) VALUES (?, 'coach', ?, 'motivated', datetime('now'))`, [userId, text]);
  sendSSEEvent(userId, "unread_message", { message: text, mood: "motivated" });
  await sendPushToUser(userId, {
    title: pushTitle || resolveCoachName(user || {}),
    body: text.length > 180 ? text.slice(0, 177) + "..." : text,
    data: { url: "/(tabs)/coach", type: "coach" },
    badge: 1,
  }).catch(() => {});
}

async function claimMoment(userId, raceDate, kind) {
  try {
    await dbRun(`INSERT INTO race_moments (user_id, race_date, kind) VALUES (?, ?, ?)`, [userId, raceDate, kind]);
    return true;
  } catch (_) {
    return false; // already sent
  }
}

/**
 * Daily: offers the race plan in the first taper week, and asks for a debrief the
 * day after a race. Static, translated messages, so no AI consent is needed.
 */
async function runDailyRaceMomentsJob() {
  const today = seasonPlan.todayStr();
  const thisMonday = seasonPlan.mondayOf(today);
  const metas = await dbAll(`SELECT m.user_id, m.race_name, m.race_date, u.language, u.coach_tone, u.coach_name FROM season_meta m JOIN users u ON u.id = m.user_id WHERE u.deleted_at IS NULL`);
  for (const m of metas) {
    try {
      const lang = i18n.normalizeLang(m.language);
      // 1. Taper offer: the current week is the first taper week (or race week, for 1-week tapers).
      const w = await dbGet(`SELECT phase FROM season_weeks WHERE user_id = ? AND week_start = ?`, [m.user_id, thisMonday]);
      const prev = await dbGet(`SELECT phase FROM season_weeks WHERE user_id = ? AND week_start = ?`, [m.user_id, seasonPlan.addDays(thisMonday, -7)]);
      const taperBegins = w && (w.phase === "taper" || w.phase === "race") && (!prev || (prev.phase !== "taper" && prev.phase !== "race"));
      if (taperBegins && m.race_date >= today && !(await getRacePlan(m.user_id, m.race_date)) && (await claimMoment(m.user_id, m.race_date, "taper_offer"))) {
        const days = Math.round((new Date(m.race_date + "T12:00:00Z") - new Date(today + "T12:00:00Z")) / 86400000);
        await postCoachMessage(m.user_id, m, i18n.t(lang, "season.taperOffer", { race: m.race_name, days }), i18n.t(lang, "season.taperPushTitle"));
      }
    } catch (e) {
      console.warn(`[RaceMoments] user ${m.user_id}:`, e.message);
    }
  }

  // 2. Debrief the day after a race. Read from the goals themselves: once the race
  // is past, the season plan for it is cleared.
  const yesterday = seasonPlan.addDays(today, -1);
  const races = await dbAll(
    `SELECT DISTINCT ms.user_id, ms.name, u.language, u.coach_tone, u.coach_name FROM milestones ms JOIN users u ON u.id = ms.user_id
     WHERE substr(ms.date, 1, 10) = ? AND COALESCE(ms.goal_type, 'race') = 'race' AND u.deleted_at IS NULL`,
    [yesterday]
  );
  for (const r of races) {
    try {
      if (await claimMoment(r.user_id, yesterday, "debrief")) {
        const lang = i18n.normalizeLang(r.language);
        await postCoachMessage(r.user_id, r, i18n.t(lang, "season.debrief", { race: r.name }), i18n.t(lang, "season.debriefPushTitle"));
      }
    } catch (e) {
      console.warn(`[RaceMoments] debrief user ${r.user_id}:`, e.message);
    }
  }
}

module.exports = { getRacePlan, createRacePlan, runDailyRaceMomentsJob };
