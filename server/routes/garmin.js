/**
 * Garmin routes (official API): OAuth connect / callback, the connection webhooks
 * and the data pushes. Connection logic lives in services/garmin.js, the pushed
 * activities and health data in services/garminIngest.js; disconnect stays at
 * POST /api/user/disconnect/garmin in routes/integrations.js, which also clears the
 * pre-API login.
 *
 * Connect flow: the app asks /api/garmin/connect for the authorize URL, opens it in
 * an auth session, Garmin sends the browser to /garminredirect, which exchanges the
 * code here on the server and deep-links back into the app with the result.
 *
 * Webhooks: enter these in Garmin's API Tools (Endpoint Configuration), with
 * GARMIN_WEBHOOK_TOKEN from server/.env in place of <token>:
 *   Deregistrations:  https://api.rooka.io/api/webhooks/garmin/<token>/deregistration
 *   User Permissions: https://api.rooka.io/api/webhooks/garmin/<token>/permissions
 * Data, all as Push (not Ping):
 *   Activity - Activities:                https://api.rooka.io/api/webhooks/garmin/<token>/activities
 *   Activity - Activity Details:          https://api.rooka.io/api/webhooks/garmin/<token>/activity-details
 *   Activity - Manually Updated Activities: https://api.rooka.io/api/webhooks/garmin/<token>/manually-updated-activities
 *   Health - Dailies:                     https://api.rooka.io/api/webhooks/garmin/<token>/dailies
 *   Health - Sleeps:                      https://api.rooka.io/api/webhooks/garmin/<token>/sleeps
 *   Health - HRV:                         https://api.rooka.io/api/webhooks/garmin/<token>/hrv
 *   Health - Body Compositions:           https://api.rooka.io/api/webhooks/garmin/<token>/body-comps
 *   Health - User Metrics:                https://api.rooka.io/api/webhooks/garmin/<token>/user-metrics
 * Leave the other summary types (epochs, stress, activity files, ...) disabled: there
 * is no handler for them, and Garmin keeps retrying a push that gets no 200.
 */
const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const { authenticateToken } = require("../services/auth");
const garmin = require("../services/garmin");
const garminIngest = require("../services/garminIngest");

router.get("/api/garmin/connect", authenticateToken, async (req, res) => {
  if (!garmin.isConfigured()) return res.status(503).json({ error: "Garmin integration is not configured on the server." });
  try {
    res.json({ url: await garmin.authorizeUrl(req.user.id) });
  } catch (err) {
    console.error("Garmin connect URL error:", err.message);
    res.status(500).json({ error: "Could not start connecting Garmin." });
  }
});

function redirectPage(status) {
  const query = `?status=${encodeURIComponent(status)}`;
  const ok = status === "connected";
  return `<!DOCTYPE html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Garmin Connect - rooka</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0d1117; color: #f0f6fc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; }
      .card { background: #161b22; border: 1px solid #30363d; border-radius: 16px; padding: 32px; max-width: 360px; }
      h2 { margin-top: 0; }
      p { color: #8b949e; font-size: 14px; }
    </style>
    <script>
      window.location.href = "rookanative://garminredirect${query}";
      setTimeout(function() { window.location.href = "rooka://garminredirect${query}"; }, 300);
    </script>
  </head>
  <body>
    <div class="card"><h2>Garmin Connect ${ok ? "connected" : "not connected"}</h2><p>Returning to rooka...</p></div>
  </body>
</html>`;
}

/** Garmin sends the browser here after the consent page (the app's OAuth redirect URL). */
router.get("/garminredirect", async (req, res) => {
  const { code, state, error } = req.query;
  // Take the pending connect even on a refusal, so its verifier doesn't linger.
  const pending = await garmin.takePending(state).catch(() => null);
  if (error) return res.send(redirectPage(error === "access_denied" ? "denied" : "error"));
  if (!code || !pending || !garmin.isConfigured()) return res.send(redirectPage("error"));

  try {
    await garmin.exchangeCode(pending.userId, String(code), pending.verifier);
  } catch (err) {
    console.error("Garmin OAuth exchange error:", err.message);
    return res.send(redirectPage("error"));
  }
  res.send(redirectPage("connected"));
  // Fill the Garmin calendar now rather than at the next 15-minute run (does nothing
  // if the athlete didn't allow workout import).
  require("../services/garminTraining")
    .syncGarminCalendar(pending.userId)
    .catch((e) => console.error(`[Garmin] first calendar sync for user ${pending.userId} failed:`, e.message));
});

function tokenMatches(given) {
  const secret = process.env.GARMIN_WEBHOOK_TOKEN;
  const a = Buffer.from(String(given || ""));
  const b = Buffer.from(String(secret || ""));
  return !!secret && a.length === b.length && crypto.timingSafeEqual(a, b);
}

const WEBHOOKS = {
  deregistration: garmin.handleDeregistrations,
  permissions: garmin.handlePermissionChanges,
  ...garminIngest.handlers,
};

router.post("/api/webhooks/garmin/:token/:kind", async (req, res) => {
  if (!process.env.GARMIN_WEBHOOK_TOKEN) {
    console.error("[Garmin Webhook] GARMIN_WEBHOOK_TOKEN is not set; rejecting request.");
    return res.status(503).json({ error: "Webhook not configured" });
  }
  if (!tokenMatches(req.params.token)) return res.status(401).json({ error: "Unauthorized" });
  const handle = WEBHOOKS[req.params.kind];
  if (!handle) return res.status(404).json({ error: "Unknown webhook" });
  // Garmin requires the 200 before any processing (its push times out after 30 s).
  res.status(200).json({ ok: true });
  try {
    const count = await handle(req.body || {});
    console.log(`[Garmin Webhook] ${req.params.kind}: ${count} record(s) handled`);
  } catch (err) {
    console.error(`[Garmin Webhook] ${req.params.kind} failed:`, err.message);
  }
});

module.exports = router;
