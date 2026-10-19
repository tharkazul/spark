/**
 * Road to race day: the season plan, the goal check, the race plan, achievements
 * and exercise cues. All computed on the server; the app only displays them.
 */
const express = require("express");
const router = express.Router();
const db = require("../services/db");
const { authenticateToken } = require("../services/auth");
const { userLimits } = require("../services/rateLimit");
const { requireAiConsent, hasAiConsent } = require("../services/aiConsent");
const { generateWithFallback } = require("../services/ai");
const i18n = require("../services/i18n");
const seasonPlan = require("../services/seasonPlan");
const goalStatus = require("../services/goalStatus");
const racePlan = require("../services/racePlan");
const { getAchievements } = require("../services/achievements");

db.run(`CREATE TABLE IF NOT EXISTS exercise_cues (
  name_key TEXT NOT NULL,
  lang TEXT NOT NULL,
  cues_json TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (name_key, lang)
)`);

router.get("/api/season", authenticateToken, userLimits.heavyRead, async (req, res) => {
  try {
    const season = await seasonPlan.getSeason(req.user.id);
    const [raceStatus, bodyStatus, plan] = await Promise.all([
      season ? goalStatus.getRaceStatus(req.user.id, season) : null,
      goalStatus.getBodyStatus(req.user.id),
      season ? racePlan.getRacePlan(req.user.id, season.raceDate) : null,
    ]);
    res.json({ season, raceStatus, bodyStatus, racePlan: plan });
  } catch (e) {
    console.error("[Season] GET /api/season failed:", e);
    res.status(500).json({ error: "Could not load your season plan." });
  }
});

router.post("/api/season/race-plan", authenticateToken, userLimits.racePlan, requireAiConsent, async (req, res) => {
  try {
    const plan = await racePlan.createRacePlan(req.user.id);
    res.json({ success: true, racePlan: plan });
  } catch (e) {
    if (e.code === "NO_RACE") return res.status(400).json({ error: "Add a race goal with a date first.", code: e.code });
    console.error("[Season] race plan failed:", e);
    res.status(500).json({ error: "Could not create your race plan. Please try again.", code: e.code });
  }
});

router.get("/api/achievements", authenticateToken, userLimits.heavyRead, async (req, res) => {
  try {
    res.json({ achievements: await getAchievements(req.user.id) });
  } catch (e) {
    console.error("[Achievements] failed:", e);
    res.status(500).json({ error: "Could not load achievements." });
  }
});

/**
 * Three short form cues for an exercise, in the athlete's language. Cues are not
 * personal, so they're generated once per exercise and language and shared.
 */
router.get("/api/exercises/cues", authenticateToken, userLimits.exerciseCues, async (req, res) => {
  const name = String(req.query.name || "").trim().slice(0, 80);
  if (!name) return res.status(400).json({ error: "Exercise name is required." });
  const lang = i18n.normalizeLang(req.headers["x-app-language"] || req.query.lang || "en");
  const key = name.toLowerCase().replace(/\s+/g, " ");

  const cached = await new Promise((resolve) =>
    db.get(`SELECT cues_json FROM exercise_cues WHERE name_key = ? AND lang = ?`, [key, lang], (err, row) => resolve(err ? null : row))
  );
  if (cached) {
    try {
      return res.json({ cues: JSON.parse(cached.cues_json), cached: true });
    } catch (_) {}
  }
  if (!(await hasAiConsent(req.user.id))) return res.json({ cues: null, code: "AI_CONSENT_REQUIRED" });

  try {
    const raw = await generateWithFallback(
      `Exercise: "${name}"`,
      `You write form cues for amateur athletes. ${i18n.languageDirective(lang)}
Return ONLY JSON: {"setup": "one short sentence on the starting position", "cues": ["3 short cues, max 12 words each"], "mistake": "the most common mistake, one short sentence"}.
If the name is not a real exercise, return {"setup": "", "cues": [], "mistake": ""}.`,
      null,
      null,
      req.user.id,
      "common",
      true,
      { language: lang }
    );
    const parsed = typeof raw === "string" ? JSON.parse(raw.replace(/^```json\s*|```$/g, "").trim()) : raw;
    const cues = {
      setup: String(parsed.setup || ""),
      cues: Array.isArray(parsed.cues) ? parsed.cues.slice(0, 4).map(String) : [],
      mistake: String(parsed.mistake || ""),
    };
    if (cues.cues.length > 0) {
      db.run(`INSERT OR REPLACE INTO exercise_cues (name_key, lang, cues_json) VALUES (?, ?, ?)`, [key, lang, JSON.stringify(cues)]);
    }
    res.json({ cues });
  } catch (e) {
    console.warn("[ExerciseCues] failed:", e.message);
    res.json({ cues: null });
  }
});

module.exports = router;
