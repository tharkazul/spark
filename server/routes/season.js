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
  youtube_video_id TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (name_key, lang)
)`);
db.run(`ALTER TABLE exercise_cues ADD COLUMN youtube_video_id TEXT`, () => {});

async function findYoutubeVideoId(exerciseName) {
  try {
    const q = encodeURIComponent(`${exerciseName} exercise form tutorial`);
    const res = await fetch(`https://www.youtube.com/results?search_query=${q}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const matches = [...html.matchAll(/"videoId":"([a-zA-Z0-9_-]{11})"/g)].map((m) => m[1]);
    const unique = [...new Set(matches)].slice(0, 5);
    for (const id of unique) {
      try {
        const oembed = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`, {
          signal: AbortSignal.timeout(2500),
        });
        if (oembed.ok) return id;
      } catch (_) {}
    }
    return unique[0] || null;
  } catch (e) {
    console.warn("[ExerciseCues] youtube search failed:", e.message);
    return null;
  }
}

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
    db.get(`SELECT cues_json, youtube_video_id FROM exercise_cues WHERE name_key = ? AND lang = ?`, [key, lang], (err, row) => resolve(err ? null : row))
  );
  if (cached) {
    try {
      let youtubeVideoId = cached.youtube_video_id || null;
      if (!youtubeVideoId) {
        // Also check if another language already resolved the videoId for this exercise
        const anyVideoRow = await new Promise((resolve) =>
          db.get(`SELECT youtube_video_id FROM exercise_cues WHERE name_key = ? AND youtube_video_id IS NOT NULL LIMIT 1`, [key], (err, row) => resolve(err ? null : row))
        );
        youtubeVideoId = anyVideoRow?.youtube_video_id || (await findYoutubeVideoId(name));
        if (youtubeVideoId) {
          db.run(`UPDATE exercise_cues SET youtube_video_id = ? WHERE name_key = ?`, [youtubeVideoId, key]);
        }
      }
      return res.json({ cues: JSON.parse(cached.cues_json), youtubeVideoId, cached: true });
    } catch (_) {}
  }

  const existingVideoRow = await new Promise((resolve) =>
    db.get(`SELECT youtube_video_id FROM exercise_cues WHERE name_key = ? AND youtube_video_id IS NOT NULL LIMIT 1`, [key], (err, row) => resolve(err ? null : row))
  );
  const videoPromise = existingVideoRow?.youtube_video_id
    ? Promise.resolve(existingVideoRow.youtube_video_id)
    : findYoutubeVideoId(name);

  if (!(await hasAiConsent(req.user.id))) {
    const youtubeVideoId = await videoPromise;
    return res.json({ cues: null, youtubeVideoId, code: "AI_CONSENT_REQUIRED" });
  }

  try {
    const [raw, youtubeVideoId] = await Promise.all([
      generateWithFallback(
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
      ),
      videoPromise,
    ]);
    const parsed = typeof raw === "string" ? JSON.parse(raw.replace(/^```json\s*|```$/g, "").trim()) : raw;
    const cues = {
      setup: String(parsed.setup || ""),
      cues: Array.isArray(parsed.cues) ? parsed.cues.slice(0, 4).map(String) : [],
      mistake: String(parsed.mistake || ""),
    };
    if (cues.cues.length > 0) {
      db.run(
        `INSERT OR REPLACE INTO exercise_cues (name_key, lang, cues_json, youtube_video_id) VALUES (?, ?, ?, ?)`,
        [key, lang, JSON.stringify(cues), youtubeVideoId]
      );
    }
    res.json({ cues, youtubeVideoId });
  } catch (e) {
    console.warn("[ExerciseCues] failed:", e.message);
    const youtubeVideoId = await videoPromise.catch(() => null);
    res.json({ cues: null, youtubeVideoId });
  }
});

module.exports = router;
