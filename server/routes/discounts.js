const express = require("express");
const router = express.Router();
const db = require("../services/db");
const { authenticateToken } = require("../services/auth");
const pricing = require("../services/pricing");

/**
 * Athlete-facing discount code endpoints.
 *
 * Every price the client shows comes from here — /validate is what the
 * onboarding paywall calls on each keystroke to live-update its two price
 * boxes, and it deliberately has no side effects, so typing a one-time code
 * does not burn it before the athlete has decided.
 */

function findCodeByCode(code, cb) {
  db.get(
    `SELECT * FROM discount_codes WHERE code = ?`,
    [pricing.normalizeCode(code)],
    cb,
  );
}

function redemptionStats(codeId, userId, cb) {
  db.get(
    `SELECT
        (SELECT COUNT(*) FROM discount_redemptions WHERE code_id = ?) AS total,
        (SELECT COUNT(*) FROM discount_redemptions WHERE code_id = ? AND user_id = ?) AS mine`,
    [codeId, codeId, userId],
    (err, row) => {
      if (err) return cb(err);
      cb(null, {
        redemptionCount: row ? row.total : 0,
        alreadyRedeemedByUser: !!(row && row.mine),
      });
    },
  );
}

/**
 * The athlete's currently held discount, or null. An entry whose window has
 * closed is reported with expired: true and priced at list price — the row is
 * kept so the UI can explain why the price went back up instead of silently
 * dropping it.
 */
function loadActiveDiscount(userId, cb) {
  db.get(
    `SELECT ud.expires_at, ud.applied_at, c.*
       FROM user_discounts ud
       JOIN discount_codes c ON c.id = ud.code_id
      WHERE ud.user_id = ?`,
    [userId],
    (err, row) => {
      if (err) return cb(err);
      if (!row) return cb(null, null);
      const expired = !!(row.expires_at && new Date(row.expires_at) < new Date());
      // A code switched off or run out of validity after it was applied stops
      // discounting too, otherwise deactivating a leaked code would do nothing
      // for the athletes already on it.
      const stillValid =
        !expired &&
        pricing.evaluateCodeAvailability(row, {
          redemptionCount: 0,
          alreadyRedeemedByUser: true,
        }).ok;
      cb(null, { row, expired, stillValid });
    },
  );
}

function respondWithPricing(res, active, extra = {}) {
  const effective = active && active.stillValid ? active.row : null;
  res.json({
    pricing: pricing.computePricing(effective),
    discount: active
      ? {
          ...pricing.publicCode(active.row, active.row.expires_at),
          appliedAt: active.row.applied_at || null,
          expired: active.expired,
          active: active.stillValid,
        }
      : null,
    ...extra,
  });
}

// GET /api/discounts/pricing — list price, no auth needed to render a paywall.
router.get("/api/discounts/pricing", (req, res) => {
  res.json({ pricing: pricing.computePricing(null), discount: null });
});

// GET /api/discounts/mine — the athlete's current code and resulting prices.
router.get("/api/discounts/mine", authenticateToken, (req, res) => {
  loadActiveDiscount(req.user.id, (err, active) => {
    if (err) {
      console.error("Failed to load user discount:", err.message);
      return res.status(500).json({ error: "Failed to load discount" });
    }
    respondWithPricing(res, active);
  });
});

// POST /api/discounts/validate { code } — price preview, no side effects.
router.post("/api/discounts/validate", authenticateToken, (req, res) => {
  const raw = pricing.normalizeCode(req.body && req.body.code);
  if (!raw) {
    return res.json({
      valid: false,
      reason: "empty",
      message: "Enter a discount code.",
      pricing: pricing.computePricing(null),
    });
  }

  findCodeByCode(raw, (err, row) => {
    if (err) {
      console.error("Discount validate lookup failed:", err.message);
      return res.status(500).json({ error: "Failed to check code" });
    }
    if (!row) {
      return res.json({
        valid: false,
        reason: "not_found",
        message: pricing.availabilityMessage("not_found"),
        pricing: pricing.computePricing(null),
      });
    }

    redemptionStats(row.id, req.user.id, (statsErr, stats) => {
      if (statsErr) {
        console.error("Discount validate stats failed:", statsErr.message);
        return res.status(500).json({ error: "Failed to check code" });
      }

      const availability = pricing.evaluateCodeAvailability(row, stats);
      if (!availability.ok) {
        return res.json({
          valid: false,
          reason: availability.reason,
          message: pricing.availabilityMessage(availability.reason),
          pricing: pricing.computePricing(null),
        });
      }

      res.json({
        valid: true,
        code: pricing.publicCode(row, pricing.computeExpiry(row)),
        pricing: pricing.computePricing(row),
      });
    });
  });
});

// POST /api/discounts/apply { code } — attach the code to this athlete.
router.post("/api/discounts/apply", authenticateToken, (req, res) => {
  const userId = req.user.id;
  const raw = pricing.normalizeCode(req.body && req.body.code);
  if (!raw) return res.status(400).json({ error: "Missing code" });

  findCodeByCode(raw, (err, row) => {
    if (err) {
      console.error("Discount apply lookup failed:", err.message);
      return res.status(500).json({ error: "Failed to apply code" });
    }
    if (!row) {
      return res.status(404).json({
        error: pricing.availabilityMessage("not_found"),
        reason: "not_found",
      });
    }

    redemptionStats(row.id, userId, (statsErr, stats) => {
      if (statsErr) {
        console.error("Discount apply stats failed:", statsErr.message);
        return res.status(500).json({ error: "Failed to apply code" });
      }

      const availability = pricing.evaluateCodeAvailability(row, stats);
      if (!availability.ok) {
        return res.status(409).json({
          error: pricing.availabilityMessage(availability.reason),
          reason: availability.reason,
        });
      }

      const expiresAt = pricing.computeExpiry(row);

      // Ledger first: it is the thing usage caps are counted from, so a failure
      // between the two writes must not hand out an uncounted redemption.
      db.run(
        `INSERT OR IGNORE INTO discount_redemptions (code_id, user_id) VALUES (?, ?)`,
        [row.id, userId],
        (ledgerErr) => {
          if (ledgerErr) {
            console.error("Discount ledger write failed:", ledgerErr.message);
            return res.status(500).json({ error: "Failed to apply code" });
          }
          db.run(
            `INSERT INTO user_discounts (user_id, code_id, applied_at, expires_at)
             VALUES (?, ?, CURRENT_TIMESTAMP, ?)
             ON CONFLICT(user_id) DO UPDATE SET
               code_id = excluded.code_id,
               applied_at = CURRENT_TIMESTAMP,
               expires_at = excluded.expires_at`,
            [userId, row.id, expiresAt],
            (applyErr) => {
              if (applyErr) {
                console.error("Discount apply failed:", applyErr.message);
                return res.status(500).json({ error: "Failed to apply code" });
              }
              res.json({
                success: true,
                code: pricing.publicCode(row, expiresAt),
                pricing: pricing.computePricing(row),
              });
            },
          );
        },
      );
    });
  });
});

// DELETE /api/discounts/mine — drop the code, back to list price.
router.delete("/api/discounts/mine", authenticateToken, (req, res) => {
  // The ledger entry stays: the redemption happened, and keeping it is what
  // lets the athlete re-apply the same code without burning another slot.
  db.run(
    `DELETE FROM user_discounts WHERE user_id = ?`,
    [req.user.id],
    function (err) {
      if (err) {
        console.error("Discount remove failed:", err.message);
        return res.status(500).json({ error: "Failed to remove discount" });
      }
      res.json({
        success: true,
        removed: this.changes > 0,
        pricing: pricing.computePricing(null),
        discount: null,
      });
    },
  );
});

module.exports = router;
