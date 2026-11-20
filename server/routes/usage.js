// Usage analytics: the app's event batches in, the admin charts out.
// See services/usageAnalytics.js and docs/usage-analytics-plan.md.
const express = require("express");
const jwt = require("jsonwebtoken");
const router = express.Router();
const usage = require("../services/usageAnalytics");
const { authenticateToken } = require("../services/auth");

// Events also arrive before login (the login screen, sign-up), so a missing or expired
// token isn't an error here: the batch is just stored without an account.
function optionalUserId(req) {
  const token = (req.headers.authorization || "").split(" ")[1];
  if (!token || token === "null" || token === "undefined") return null;
  try {
    return jwt.verify(token, process.env.JWT_SECRET)?.id || null;
  } catch {
    return null;
  }
}

router.post("/api/usage-events", async (req, res) => {
  try {
    const stored = await usage.recordEvents(optionalUserId(req), req.body);
    res.json({ success: true, stored });
  } catch (err) {
    console.error("[Usage] Storing events failed:", err.message);
    // The app drops the batch either way; usage statistics must never get in its way.
    res.status(200).json({ success: false });
  }
});

const adminOnly = (req, res, next) =>
  req.user?.role === "admin" ? next() : res.status(403).json({ error: "Unauthorized: Admin access required" });

const rangeDays = (value) => Math.max(7, Math.min(730, Number(value) || 90));

router.get("/api/admin/analytics/overview", authenticateToken, adminOnly, async (req, res) => {
  try {
    res.json(await usage.overview({ days: rangeDays(req.query.days) }));
  } catch (err) {
    console.error("[Usage] Overview failed:", err);
    res.status(500).json({ error: "Could not load usage statistics" });
  }
});

router.get("/api/admin/analytics/event", authenticateToken, adminOnly, async (req, res) => {
  try {
    const series = await usage.eventSeries({ name: String(req.query.name || ""), dim: String(req.query.dim || ""), days: rangeDays(req.query.days) });
    if (!series) return res.status(404).json({ error: "Unknown event" });
    res.json(series);
  } catch (err) {
    console.error("[Usage] Event series failed:", err);
    res.status(500).json({ error: "Could not load the event" });
  }
});

// Recomputes the summaries now instead of waiting for the hourly job.
router.post("/api/admin/analytics/refresh", authenticateToken, adminOnly, async (req, res) => {
  try {
    res.json(await usage.runRollup({ days: 2 }));
  } catch (err) {
    console.error("[Usage] Refresh failed:", err);
    res.status(500).json({ error: "Could not refresh" });
  }
});

module.exports = router;
