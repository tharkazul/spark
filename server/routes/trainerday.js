/**
 * TrainerDay routes: OAuth connect / callback / disconnect and sending planned
 * bike workouts to the TrainerDay calendar. Logic lives in services/trainerday.js.
 *
 * Connect flow: the app asks /api/trainerday/connect for the authorize URL (with
 * a signed state naming the user), opens it in an auth session, TrainerDay sends
 * the browser to TRAINERDAY_REDIRECT_URI (/trainerdayredirect), which exchanges
 * the code here on the server and deep-links back into the app with the result.
 */
const express = require("express");
const router = express.Router();
const { authenticateToken } = require("../services/auth");
const trainerday = require("../services/trainerday");

const notConfigured = { error: "TrainerDay integration is not configured on the server." };

router.get("/api/trainerday/connect", authenticateToken, (req, res) => {
  if (!trainerday.isConfigured()) return res.status(503).json(notConfigured);
  res.json({ url: trainerday.authorizeUrl(req.user.id) });
});

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function redirectPage(status) {
  const query = `?status=${encodeURIComponent(status)}`;
  const ok = status === "connected";
  return `<!DOCTYPE html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>TrainerDay - rooka</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0d1117; color: #f0f6fc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; }
      .card { background: #161b22; border: 1px solid #30363d; border-radius: 16px; padding: 32px; max-width: 360px; }
      h2 { margin-top: 0; }
      p { color: #8b949e; font-size: 14px; }
    </style>
    <script>
      window.location.href = "rookanative://trainerdayredirect${escapeHtml(query)}";
      setTimeout(function() { window.location.href = "rooka://trainerdayredirect${escapeHtml(query)}"; }, 300);
    </script>
  </head>
  <body>
    <div class="card"><h2>TrainerDay ${ok ? "connected" : "not connected"}</h2><p>Returning to rooka...</p></div>
  </body>
</html>`;
}

/** TrainerDay sends the browser here after consent (TRAINERDAY_REDIRECT_URI). */
router.get("/trainerdayredirect", async (req, res) => {
  const { code, state, error } = req.query;
  if (error) return res.send(redirectPage(error === "access_denied" ? "denied" : "error"));

  const userId = trainerday.verifyState(state);
  if (!code || !userId || !trainerday.isConfigured()) return res.send(redirectPage("error"));

  try {
    await trainerday.exchangeCode(userId, String(code));
  } catch (err) {
    console.error("TrainerDay OAuth exchange error:", err.message);
    return res.send(redirectPage("error"));
  }
  res.send(redirectPage("connected"));

  // Fill the calendar with the upcoming bike sessions straight away.
  trainerday
    .syncTrainerDayCalendar(userId)
    .catch((e) => console.error("TrainerDay first sync failed:", e.message));
});

router.post("/api/user/disconnect/trainerday", authenticateToken, async (req, res) => {
  try {
    await trainerday.disconnect(req.user.id);
    res.json({ message: "TrainerDay disconnected successfully!" });
  } catch (err) {
    console.error("TrainerDay disconnect error:", err.message);
    res.status(500).json({ error: "Failed to disconnect TrainerDay." });
  }
});

/** body: { workouts?: Array } — explicit workouts (bike ones are sent), or nothing to sync the plan. */
router.post("/api/trainerday/send-workouts", authenticateToken, async (req, res) => {
  const selected = Array.isArray(req.body && req.body.workouts) ? req.body.workouts : null;
  const result = await trainerday.pushWorkoutsToTrainerDay(req.user.id, selected);
  if (result.body && result.body.skipped) {
    return res.status(400).json({ error: "Only bike workouts can be sent to TrainerDay." });
  }
  res.status(result.status).json(result.body);
});

module.exports = router;
