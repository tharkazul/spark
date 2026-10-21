/**
 * Live coaching during a workout.
 *
 * Athletes add their personal address (<code>@rookacoach.com) as a Garmin LiveTrack
 * contact with auto-start on. Cloudflare Email Routing hands each email to a worker
 * (docs/livetrack-email-worker.js), which posts the LiveTrack link here.
 */
const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const db = require("../services/db");
const { authenticateToken } = require("../services/auth");
const { startLiveSession } = require("../services/liveSessionWorker");

const INBOX_WORDS = require("../services/inboxWords");

const INBOX_DOMAIN = process.env.LIVETRACK_INBOX_DOMAIN || "rookacoach.com";
const INBOX_WORD_COUNT = 4;

function secretMatches(header, secret) {
  const a = Buffer.from(String(header || ""));
  const b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Words, not random letters, so athletes can read it out and type it without typos.
// Addresses made before the switch (10 random letters) keep working.
function newInboxCode() {
  return Array.from({ length: INBOX_WORD_COUNT }, () => INBOX_WORDS[crypto.randomInt(INBOX_WORDS.length)]).join("-");
}

/** The user's LiveTrack address, created on first use. */
function getInboxAddress(userId, attempt = 0) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT livetrack_inbox FROM users WHERE id = ?`, [userId], (err, row) => {
      if (err) return reject(err);
      if (!row) return resolve(null);
      if (row.livetrack_inbox) return resolve(`${row.livetrack_inbox}@${INBOX_DOMAIN}`);
      const code = newInboxCode();
      db.run(`UPDATE users SET livetrack_inbox = ? WHERE id = ? AND livetrack_inbox IS NULL`, [code, userId], (e) => {
        // Another athlete already has these four words (unique index): draw again.
        if (e && e.code === "SQLITE_CONSTRAINT" && attempt < 5) return resolve(getInboxAddress(userId, attempt + 1));
        e ? reject(e) : resolve(getInboxAddress(userId));
      });
    });
  });
}

router.get("/api/live-coach/address", authenticateToken, async (req, res) => {
  try {
    res.json({ address: await getInboxAddress(req.user.id) });
  } catch (err) {
    console.error("[LiveCoach] address failed:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// Called by the Cloudflare email worker: { to, from, url }.
router.post("/api/webhooks/livetrack", async (req, res) => {
  const secret = process.env.LIVETRACK_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[LiveCoach] LIVETRACK_WEBHOOK_SECRET is not set; rejecting request.");
    return res.status(503).json({ error: "Webhook not configured" });
  }
  if (!secretMatches(req.get("x-rooka-webhook-secret"), secret)) return res.status(401).json({ error: "Unauthorized" });

  const { to, url } = req.body || {};
  const code = String(to || "").split("@")[0].trim().toLowerCase();
  if (!code) return res.status(400).json({ error: "Missing recipient" });

  db.get(`SELECT id FROM users WHERE livetrack_inbox = ? AND deleted_at IS NULL`, [code], async (err, user) => {
    if (err) return res.status(500).json({ error: "Database error" });
    if (!user) return res.status(404).json({ error: "Unknown address" });
    try {
      const row = await startLiveSession({ userId: user.id, url, source: "email" });
      res.status(202).json({ id: row.id, status: row.status });
    } catch (e) {
      console.warn(`[LiveCoach] email session for user ${user.id} refused: ${e.message}`);
      res.status(e.status || 502).json({ error: e.message });
    }
  });
});

module.exports = router;
module.exports.getInboxAddress = getInboxAddress;
