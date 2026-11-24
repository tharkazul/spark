// Smart store link for posters, QR codes and posts: rooka.io/get/<campaign>.
// One link sends iPhones to the App Store and Android phones to Google Play, each
// with the campaign attached so the stores' own analytics show which club, creator
// or post brought the install. Anything else lands on the website's download section.
const express = require("express");
const router = express.Router();
const db = require("../services/db");
const { authenticateToken } = require("../services/auth");

const APP_STORE_ID = "6805854962";
const PLAY_PACKAGE = "io.rooka.app";
const CAMPAIGN_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
// Link previews (WhatsApp, Slack, social cards) fetch the URL too; they are not people.
const BOT_RE = /bot|crawl|spider|preview|facebookexternalhit|whatsapp|slack|telegram|discord|linkedin|twitter|embedly|skype|curl|wget|python-requests|headless/i;

// Only the campaign, the platform and the time are kept: no IP, no user agent.
const logSetupError = (err) => {
  if (err) console.error("[Campaigns] Creating the clicks table failed:", err.message);
};
db.serialize(() => {
  db.run(
    `CREATE TABLE IF NOT EXISTS campaign_clicks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign TEXT NOT NULL,
      platform TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    logSetupError,
  );
  db.run(`CREATE INDEX IF NOT EXISTS idx_campaign_clicks_campaign ON campaign_clicks (campaign, created_at)`, logSetupError);
});

function normalizeCampaign(raw) {
  const campaign = String(raw || "").toLowerCase().trim();
  return CAMPAIGN_RE.test(campaign) ? campaign : "direct";
}

function platformFor(userAgent) {
  const ua = String(userAgent || "");
  if (/android/i.test(ua)) return "android";
  // iPadOS 13+ reports itself as a Mac; those visitors get the website, which links the App Store.
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  return "other";
}

function storeUrl(platform, campaign) {
  if (platform === "ios") {
    // Apple only attributes campaign links that carry the account's provider token.
    const pt = (process.env.APP_STORE_PROVIDER_TOKEN || "").trim();
    return pt
      ? `https://apps.apple.com/app/apple-store/id${APP_STORE_ID}?pt=${encodeURIComponent(pt)}&ct=${campaign}&mt=8`
      : `https://apps.apple.com/app/id${APP_STORE_ID}`;
  }
  if (platform === "android") {
    const referrer = `utm_source=${campaign}&utm_medium=smartlink&utm_campaign=${campaign}`;
    return `https://play.google.com/store/apps/details?id=${PLAY_PACKAGE}&referrer=${encodeURIComponent(referrer)}`;
  }
  return "/#get";
}

router.get(["/get", "/get/:campaign"], (req, res) => {
  const campaign = normalizeCampaign(req.params.campaign);
  const userAgent = req.get("user-agent");
  const platform = platformFor(userAgent);

  if (!BOT_RE.test(userAgent || "")) {
    db.run(`INSERT INTO campaign_clicks (campaign, platform) VALUES (?, ?)`, [campaign, platform], (err) => {
      if (err) console.error("[Campaigns] Recording a click failed:", err.message);
    });
  }

  // The answer depends on the phone, so nothing in between may cache it.
  res.set("Cache-Control", "no-store");
  res.set("Vary", "User-Agent");
  res.redirect(302, storeUrl(platform, campaign));
});

// Clicks per campaign and platform, for the admin page. Installs themselves are in
// App Store Connect (Campaigns) and Play Console (Traffic sources).
router.get("/api/admin/campaign-clicks", authenticateToken, (req, res) => {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ error: "Unauthorized: Admin access required" });
  }
  const days = Math.min(Math.max(parseInt(req.query.days, 10) || 90, 1), 3650);
  db.all(
    `SELECT campaign, platform, COUNT(*) AS clicks, MAX(created_at) AS last_click
       FROM campaign_clicks
      WHERE created_at >= datetime('now', ?)
      GROUP BY campaign, platform
      ORDER BY campaign, platform`,
    [`-${days} days`],
    (err, rows) => {
      if (err) {
        console.error("[Campaigns] Reading clicks failed:", err.message);
        return res.status(500).json({ error: "Failed to load campaign clicks" });
      }
      res.json({ days, rows: rows || [] });
    },
  );
});

module.exports = router;
module.exports._test = { normalizeCampaign, platformFor, storeUrl };
