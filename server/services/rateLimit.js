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

// Per signed-in athlete, for routes that are expensive to answer (a full
// recalculation) or cost money (an AI call). Keyed by account, so spreading
// requests over many IPs doesn't help. Mount after authenticateToken.
function userLimiter({ windowMs, limit, error }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: (req) => (req.user && req.user.id ? `user:${req.user.id}` : ipKeyGenerator(req.ip)),
    handler: (req, res, next, options) => res.status(options.statusCode).json({ error, code: "RATE_LIMITED" }),
  });
}

const slowDown = "Too many requests. Please slow down and try again shortly.";
const userLimits = {
  // Goal page, season, achievements: no athlete opens these 60 times a minute.
  heavyRead: userLimiter({ windowMs: MINUTE, limit: 60, error: slowDown }),
  // A new race plan is an AI call.
  racePlan: userLimiter({ windowMs: 60 * MINUTE, limit: 10, error: "You've asked for several race plans in a row. Please try again in an hour." }),
  // Cached cues are free, but every new exercise name is an AI call.
  exerciseCues: userLimiter({ windowMs: 60 * MINUTE, limit: 60, error: slowDown }),
  // Every feedback message is an email to rutger@rooka.io.
  feedback: userLimiter({ windowMs: 60 * MINUTE, limit: 10, error: "You've sent a lot of feedback this hour. Thank you! Please try again later." }),
};

module.exports = { authLimits, apiLimit, userLimits };
