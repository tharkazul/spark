const { rateLimit, ipKeyGenerator } = require("express-rate-limit");

const MINUTE = 60 * 1000;

// The username/email an auth request is about, so one account can't be hammered
// from many IPs.
function identifierOf(req) {
  const body = req.body || {};
  return String(body.email || body.username || "").trim().toLowerCase();
}

function limiter({ windowMs, limit, by, error, skip }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator:
      by === "identifier"
        ? (req) => `id:${identifierOf(req)}`
        : (req) => ipKeyGenerator(req.ip),
    skip: by === "identifier" ? (req) => !identifierOf(req) : skip,
    handler: (req, res, next, options) =>
      res.status(options.statusCode).json({ error, code: "RATE_LIMITED" }),
  });
}

const tooManyAttempts = "Too many attempts. Please wait a few minutes and try again.";

// Two limiters per sensitive auth route: per IP and per account identifier.
const authLimits = {
  login: [
    limiter({ windowMs: 15 * MINUTE, limit: 30, by: "ip", error: tooManyAttempts }),
    limiter({ windowMs: 15 * MINUTE, limit: 10, by: "identifier", error: tooManyAttempts }),
  ],
  register: [
    limiter({ windowMs: 60 * MINUTE, limit: 10, by: "ip", error: tooManyAttempts }),
    limiter({ windowMs: 60 * MINUTE, limit: 5, by: "identifier", error: tooManyAttempts }),
  ],
  forgotPassword: [
    limiter({ windowMs: 60 * MINUTE, limit: 10, by: "ip", error: tooManyAttempts }),
    limiter({ windowMs: 60 * MINUTE, limit: 5, by: "identifier", error: tooManyAttempts }),
  ],
  resetPassword: [
    limiter({ windowMs: 15 * MINUTE, limit: 20, by: "ip", error: tooManyAttempts }),
    limiter({ windowMs: 15 * MINUTE, limit: 10, by: "identifier", error: tooManyAttempts }),
  ],
};

// Catch-all for /api. Generous, since a gym or office can share one IP.
// RevenueCat webhooks are exempt (authenticated by secret, retried on 429).
const apiLimit = limiter({
  windowMs: 5 * MINUTE,
  limit: 1000,
  by: "ip",
  error: "Too many requests. Please slow down and try again shortly.",
  skip: (req) => req.originalUrl.startsWith("/api/webhooks/"),
});

module.exports = { authLimits, apiLimit };
