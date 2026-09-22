const jwt = require("jsonwebtoken");
const db = require("./db");

// In-memory cache to throttle last_active_at updates (at most once every 5 minutes per user)
const lastActiveMap = new Map();

function trackUserActivity(userId) {
  if (!userId) return;
  const now = Date.now();
  const lastUpdate = lastActiveMap.get(userId) || 0;
  if (now - lastUpdate > 5 * 60 * 1000) {
    lastActiveMap.set(userId, now);
    db.run(
      `UPDATE users SET last_active_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [userId],
      (err) => {
        if (err) console.error("Error updating last_active_at:", err.message);
      }
    );
  }
}

/**
 * Verifies the bearer token AND re-checks the account behind it on every request.
 *
 * A signed JWT on its own is not proof that the session is still valid: the
 * account may have been deleted (hard or soft) since the token was issued.
 * Previously expiry was ignored and the user row was never looked at, so a
 * deleted account kept full access until its token was manually removed.
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  let token = authHeader && authHeader.split(" ")[1];
  if (!token && req.query.token) token = req.query.token;

  if (token == null || token === "null" || token === "undefined")
    return res.status(401).json({ error: "No token provided", code: "NO_TOKEN" });

  jwt.verify(token, process.env.JWT_SECRET, (err, payload) => {
    if (err) {
      console.error("JWT Verification failed:", err.message);
      const expired = err.name === "TokenExpiredError";
      return res.status(401).json({
        error: expired ? "Session expired" : "Invalid token",
        code: expired ? "TOKEN_EXPIRED" : "TOKEN_INVALID",
      });
    }

    db.get(
      `SELECT id, username, subscription_tier, role, deleted_at FROM users WHERE id = ?`,
      [payload.id],
      (dbErr, user) => {
        if (dbErr) {
          console.error("Auth user lookup failed:", dbErr.message);
          return res.status(500).json({ error: "Authentication lookup failed" });
        }
        if (!user) {
          return res
            .status(401)
            .json({ error: "Account no longer exists", code: "ACCOUNT_DELETED" });
        }
        if (user.deleted_at) {
          return res
            .status(401)
            .json({ error: "Account has been deleted", code: "ACCOUNT_DELETED" });
        }

        // Record activity timestamp for active user safeguards
        trackUserActivity(user.id);

        // Trust the database for identity, not the (possibly stale) token payload.
        req.user = {
          id: user.id,
          username: user.username,
          subscription_tier: user.subscription_tier || "free",
          role: user.role || "user",
        };
        next();
      },
    );
  });
}

module.exports = { authenticateToken, trackUserActivity };
