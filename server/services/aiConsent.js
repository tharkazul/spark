const db = require("./db");

// Apple Guideline 5.1.2(i): nothing about an athlete may reach the AI provider
// (Gemini) until they have explicitly agreed to it. users.ai_consent is NULL
// until they answer, 1 when they accept and 0 when they decline. Every AI
// entry point — HTTP routes and background jobs alike — must check this.

const AI_CONSENT_REQUIRED = "AI_CONSENT_REQUIRED";
const CONSENT_PAYLOAD = JSON.stringify({ type: "ai_consent" });

class AiConsentRequiredError extends Error {
  constructor(userId) {
    super(`AI consent missing for user ${userId}`);
    this.code = AI_CONSENT_REQUIRED;
  }
}

function getAiConsent(userId) {
  return new Promise((resolve) => {
    if (userId === null || userId === undefined) return resolve(null);
    db.get(`SELECT ai_consent FROM users WHERE id = ?`, [userId], (err, row) => {
      if (err || !row || row.ai_consent === null || row.ai_consent === undefined) return resolve(null);
      resolve(row.ai_consent === 1);
    });
  });
}

async function hasAiConsent(userId) {
  return (await getAiConsent(userId)) === true;
}

async function assertAiConsent(userId) {
  if (!(await hasAiConsent(userId))) throw new AiConsentRequiredError(userId);
}

// Express middleware for routes whose whole purpose is an AI call.
async function requireAiConsent(req, res, next) {
  if (await hasAiConsent(req.user && req.user.id)) return next();
  res.status(403).json({ error: "AI features are turned off for this account.", code: AI_CONSENT_REQUIRED });
}

// Puts the consent question in the coach chat when the athlete hasn't
// answered yet and it isn't already there. Called before the welcome message
// in onboarding, and when the chat loads for athletes who joined earlier.
//
// The check and the insert are one statement on purpose: the app loads the
// chat history several times at once on launch, and a separate SELECT then
// INSERT let each of those requests add its own card.
function ensureConsentPrompt(userId) {
  return new Promise((resolve) => {
    db.run(
      `INSERT INTO chat_history (user_id, role, content, mood, payload_json)
       SELECT u.id, 'coach', '', 'support', ?
         FROM users u
        WHERE u.id = ?
          AND u.ai_consent IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM chat_history c
             WHERE c.user_id = u.id AND c.role = 'coach' AND c.payload_json = ?
          )`,
      [CONSENT_PAYLOAD, userId, CONSENT_PAYLOAD],
      function (err) {
        resolve(!err && this.changes > 0);
      },
    );
  });
}

function setAiConsent(userId, accepted) {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE users SET ai_consent = ?, ai_consent_at = datetime('now') WHERE id = ?`,
      [accepted ? 1 : 0, userId],
      (err) => (err ? reject(err) : resolve()),
    );
  });
}

module.exports = {
  AI_CONSENT_REQUIRED,
  AiConsentRequiredError,
  getAiConsent,
  hasAiConsent,
  assertAiConsent,
  requireAiConsent,
  ensureConsentPrompt,
  setAiConsent,
};
