/**
 * Weather for the athlete's home town (Profile -> Preferences -> Home town).
 * The apps never call a weather service themselves; they get it from here.
 */
const express = require("express");
const router = express.Router();
const { authenticateToken } = require("../services/auth");
const weather = require("../services/weather");

router.get("/api/weather", authenticateToken, async (req, res) => {
  try {
    const { home, forecast } = await weather.getForecastForUser(req.user.id);
    if (!home || !forecast) return res.json({ home, days: [], current: null, attribution: null });
    res.json({
      home: { name: home.name },
      current: forecast.current,
      days: forecast.days,
      attribution: await weather.getAttribution(forecast.provider),
    });
  } catch (e) {
    console.error("[Weather] route failed:", e);
    res.status(500).json({ error: "Weather unavailable." });
  }
});

router.get("/api/places/search", authenticateToken, async (req, res) => {
  try {
    res.json({ results: await weather.searchPlaces(req.query.q, String(req.query.lang || "en").slice(0, 5)) });
  } catch (e) {
    console.error("[Weather] place search failed:", e.message);
    res.status(502).json({ error: "Search is unavailable right now." });
  }
});

router.put("/api/user/home-town", authenticateToken, async (req, res) => {
  try {
    const place = req.body && req.body.place ? req.body.place : null;
    const home = await weather.setHomeTown(req.user.id, place);
    res.json({ success: true, homeTown: home ? { name: home.name } : null });
  } catch (e) {
    res.status(400).json({ error: e.message || "Could not save your home town." });
  }
});

module.exports = router;
