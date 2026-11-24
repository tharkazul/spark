const express = require("express");
const router = express.Router();
const db = require("../services/db");
const { authenticateToken } = require("../services/auth");
const pricing = require("../services/pricing");
const revenuecat = require("../services/revenuecat");
const { upgradeToRookaPlus } = require("../services/subscriptionTier");

/**
 * Athlete-facing discount code endpoints.
 *
 * A code never changes a price on its own: Apple and Google charge the athlete.
 * A free-access code is honoured here by granting rooka+ through RevenueCat; a
 * store-offer code points the app at a RevenueCat offering whose store
 * products carry the discount, and the app shows that offering's store
 * prices. See services/pricing.js.
 *
 * /validate is a preview with no side effects, so typing a one-time code does
 * not burn it before the athlete has decided.
 */

const get = (sql, params = []) =>
  new Promise((resolve, reject) => db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row))));
const run = (sql, params = []) =>
  new Promise((resolve, reject) =>
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ changes: this.changes });
    }),
  );

// App builds that can open a store offer's paywall list this in X-App-Caps
// (src/constants/features.ts). Older builds would take the code and then sell
// the athlete the full-price products, so they are told to update instead.
const STORE_OFFER_CAP = "store-offer-codes";

function supportsStoreOffers(req) {
  return String(req.headers["x-app-caps"] || "")
    .split(",")
    .map((c) => c.trim().toLowerCase())
    .includes(STORE_OFFER_CAP);
}

/** Everything about this athlete and this code that decides whether they may take it. */
async function athleteFacts(userId, codeId, req) {
  const row = await get(
    `SELECT
        (SELECT subscription_tier FROM users WHERE id = ?) AS tier,
        (SELECT COUNT(*) FROM discount_redemptions WHERE code_id = ?) AS total,
        (SELECT COUNT(*) FROM discount_redemptions WHERE code_id = ? AND user_id = ?) AS mine,
        (SELECT COUNT(*) FROM discount_redemptions WHERE user_id = ? AND granted_until IS NOT NULL) AS free_grants`,
    [userId, codeId, codeId, userId, userId],
  );
  return {
    redemptionCount: row ? row.total : 0,
    alreadyRedeemedByUser: !!(row && row.mine),
    athlete: {
      tier: (row && row.tier) || "free",
      hadFreeAccess: !!(row && row.free_grants),
      supportsOffers: supportsStoreOffers(req),
    },
  };
}

async function checkCode(rawCode, userId, req) {
  const row = await get(`SELECT * FROM discount_codes WHERE code = ?`, [pricing.normalizeCode(rawCode)]);
  if (!row) return { ok: false, reason: "not_found" };

  const facts = await athleteFacts(userId, row.id, req);
  const availability = pricing.evaluateCodeAvailability(row, facts);
  if (!availability.ok) return { ok: false, reason: availability.reason, row };

  const eligibility = pricing.evaluateAthleteEligibility(row, facts.athlete);
  if (!eligibility.ok) return { ok: false, reason: eligibility.reason, row };

  return { ok: true, row };
}

/**
 * The athlete's currently held code, or null. A free period that has ended is
 * reported with expired: true, and kept so the account screen can say when it
 * ended instead of silently dropping it.
 */
async function loadHeldDiscount(userId) {
  const row = await get(
    `SELECT ud.expires_at, ud.applied_at, c.*
       FROM user_discounts ud
       JOIN discount_codes c ON c.id = ud.code_id
      WHERE ud.user_id = ?`,
    [userId],
  );
  if (!row) return null;

  const expired = !!(row.expires_at && new Date(row.expires_at) < new Date());
  let active;
  if (pricing.isRetiredType(row.discount_type)) {
    active = false;
  } else if (row.discount_type === "free_access") {
    // Already granted at RevenueCat: switching the code off later does not take
    // a running free period back.
    active = !expired;
  } else {
    // A store offer switched off or past its window stops being shown, so
    // deactivating a leaked code also works for athletes already holding it.
    active = pricing.evaluateCodeAvailability(row, { redemptionCount: 0, alreadyRedeemedByUser: true }).ok;
  }
  return { row, expired, active };
}

function serializeHeld(held) {
  if (!held) return null;
  return {
    ...pricing.publicCode(held.row, held.row.expires_at),
    appliedAt: held.row.applied_at || null,
    expired: held.expired,
    active: held.active,
  };
}

async function holdCode(userId, codeId, expiresAt) {
  await run(
    `INSERT INTO user_discounts (user_id, code_id, applied_at, expires_at)
     VALUES (?, ?, CURRENT_TIMESTAMP, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       code_id = excluded.code_id,
       applied_at = CURRENT_TIMESTAMP,
       expires_at = excluded.expires_at`,
    [userId, codeId, expiresAt],
  );
}

/**
 * Starts the free period: ledger, then RevenueCat, then the athlete's code and
 * tier. The ledger row goes first (marked with the grant) so the usage cap and
 * the one-free-period rule already count it; if RevenueCat refuses, it is
 * taken back so a failed grant costs the athlete nothing.
 */
async function applyFreeAccess(res, row, userId) {
  if (!revenuecat.isConfigured()) {
    console.warn("[Discounts] REVENUECAT_SECRET_KEY is not set; cannot grant free access.");
    return res.status(503).json({ error: "Free access codes are not available right now.", reason: "unavailable" });
  }

  const endsAt = pricing.computeExpiry(row);
  if (!endsAt) {
    return res.status(409).json({ error: pricing.availabilityMessage("invalid"), reason: "invalid" });
  }

  const { changes } = await run(`INSERT OR IGNORE INTO discount_redemptions (code_id, user_id) VALUES (?, ?)`, [
    row.id,
    userId,
  ]);
  const insertedNow = changes > 0;
  await run(
    `UPDATE discount_redemptions SET granted_until = ?, grant_closed_at = NULL WHERE code_id = ? AND user_id = ?`,
    [endsAt, row.id, userId],
  );

  try {
    await revenuecat.grantPromotionalRooka(userId, Date.parse(endsAt));
  } catch (err) {
    console.error(`[Discounts] RevenueCat grant for user ${userId} failed:`, err.message);
    const undo = insertedNow
      ? run(`DELETE FROM discount_redemptions WHERE code_id = ? AND user_id = ?`, [row.id, userId])
      : run(`UPDATE discount_redemptions SET granted_until = NULL WHERE code_id = ? AND user_id = ?`, [row.id, userId]);
    await undo.catch((undoErr) => console.error("[Discounts] Undoing the ledger entry failed:", undoErr.message));
    return res.status(502).json({ error: "Could not start your free period. Please try again.", reason: "grant_failed" });
  }

  await holdCode(userId, row.id, endsAt);
  await upgradeToRookaPlus(userId);
  console.log(`[Discounts] User ${userId} redeemed ${row.code}: rooka+ free until ${endsAt}.`);
  res.json({ success: true, code: pricing.publicCode(row, endsAt), pricing: pricing.computePricing() });
}

// GET /api/discounts/pricing — list price, no auth needed.
router.get("/api/discounts/pricing", (req, res) => {
  res.json({ pricing: pricing.computePricing(), discount: null });
});

// GET /api/discounts/mine — the athlete's current code.
router.get("/api/discounts/mine", authenticateToken, async (req, res) => {
  try {
    const held = await loadHeldDiscount(req.user.id);
    res.json({ pricing: pricing.computePricing(), discount: serializeHeld(held) });
  } catch (err) {
    console.error("Failed to load user discount:", err.message);
    res.status(500).json({ error: "Failed to load discount" });
  }
});

// POST /api/discounts/validate { code } — preview, no side effects.
router.post("/api/discounts/validate", authenticateToken, async (req, res) => {
  const raw = pricing.normalizeCode(req.body && req.body.code);
  if (!raw) {
    return res.json({
      valid: false,
      reason: "empty",
      message: "Enter a discount code.",
      pricing: pricing.computePricing(),
    });
  }

  try {
    const check = await checkCode(raw, req.user.id, req);
    if (!check.ok) {
      return res.json({
        valid: false,
        reason: check.reason,
        message: pricing.availabilityMessage(check.reason),
        pricing: pricing.computePricing(),
      });
    }
    res.json({
      valid: true,
      code: pricing.publicCode(check.row, pricing.computeExpiry(check.row)),
      pricing: pricing.computePricing(),
    });
  } catch (err) {
    console.error("Discount validate failed:", err.message);
    res.status(500).json({ error: "Failed to check code" });
  }
});

// POST /api/discounts/apply { code } — attach the code to this athlete.
router.post("/api/discounts/apply", authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const raw = pricing.normalizeCode(req.body && req.body.code);
  if (!raw) return res.status(400).json({ error: "Missing code" });

  try {
    const check = await checkCode(raw, userId, req);
    if (!check.ok) {
      return res.status(check.reason === "not_found" ? 404 : 409).json({
        error: pricing.availabilityMessage(check.reason),
        reason: check.reason,
      });
    }

    const row = check.row;
    if (row.discount_type === "free_access") return await applyFreeAccess(res, row, userId);

    // Store offer: nothing is granted here. The athlete holds the code, and the
    // app shows its offering's paywall until they buy or remove it.
    await run(`INSERT OR IGNORE INTO discount_redemptions (code_id, user_id) VALUES (?, ?)`, [row.id, userId]);
    await holdCode(userId, row.id, null);
    res.json({ success: true, code: pricing.publicCode(row, null), pricing: pricing.computePricing() });
  } catch (err) {
    console.error("Discount apply failed:", err.message);
    if (!res.headersSent) res.status(500).json({ error: "Failed to apply code" });
  }
});

// DELETE /api/discounts/mine — drop the code.
router.delete("/api/discounts/mine", authenticateToken, async (req, res) => {
  try {
    const held = await loadHeldDiscount(req.user.id);
    if (held && held.row.discount_type === "free_access" && held.active) {
      return res.status(409).json({
        error: "Your free period is running and stays until it ends.",
        reason: "free_access_running",
      });
    }
    // The ledger entry stays: the redemption happened, and keeping it is what
    // lets the athlete re-apply the same code without burning another slot.
    const { changes } = await run(`DELETE FROM user_discounts WHERE user_id = ?`, [req.user.id]);
    res.json({ success: true, removed: changes > 0, pricing: pricing.computePricing(), discount: null });
  } catch (err) {
    console.error("Discount remove failed:", err.message);
    res.status(500).json({ error: "Failed to remove discount" });
  }
});

module.exports = router;
module.exports._test = { STORE_OFFER_CAP };
