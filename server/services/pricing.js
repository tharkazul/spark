/**
 * Subscription pricing and discount-code evaluation.
 *
 * This module is the single authority for what an athlete pays. The client
 * deliberately does NOT recompute discounted prices — it renders the numbers
 * produced here (see POST /api/discounts/validate) — so the onboarding paywall,
 * the account screen and the admin list can never drift apart the way two
 * copies of the same arithmetic always eventually do.
 */

const BASE_PRICING = {
  currency: "€",
  monthly: 6.99,
  yearly: 69.99,
};

/**
 * What the code does to the price. Orthogonal to how long it lasts
 * (duration_months) and to how many athletes may use it (redemption_type).
 */
const DISCOUNT_TYPES = [
  "percent", // X% off both plans
  "fixed_yearly", // yearly plan costs exactly N, monthly untouched
  "fixed_monthly", // monthly plan costs exactly N, yearly untouched
  "fixed_both", // both plans pinned to their own fixed price
];

const REDEMPTION_TYPES = [
  "one_time", // exactly one athlete may ever redeem it
  "limited", // up to max_redemptions athletes
  "unlimited", // no cap
];

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

/**
 * Codes are stored already normalised, so lookups are a plain UNIQUE match and
 * "summer2026", " SUMMER2026 " and "Summer 2026" are all the same code.
 */
function normalizeCode(raw) {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

/**
 * The number of athletes a code may still be redeemed by, given its type.
 * Infinity for uncapped codes.
 */
function redemptionCap(row) {
  if (!row) return 0;
  switch (row.redemption_type) {
    case "one_time":
      return 1;
    case "limited":
      return Number.isFinite(Number(row.max_redemptions))
        ? Math.max(0, Math.floor(Number(row.max_redemptions)))
        : 0;
    case "unlimited":
    default:
      return Infinity;
  }
}

/**
 * Can this athlete redeem this code right now?
 *
 * `redemptionCount` is the number of DISTINCT athletes that have ever redeemed
 * it, and `alreadyRedeemedByUser` says whether this athlete is one of them —
 * re-applying a code you already hold must not burn a second slot, otherwise
 * removing your own code by accident would lock you out of it.
 */
function evaluateCodeAvailability(row, opts = {}) {
  const {
    redemptionCount = 0,
    alreadyRedeemedByUser = false,
    now = new Date(),
  } = opts;

  if (!row) return { ok: false, reason: "not_found" };
  if (!row.active) return { ok: false, reason: "inactive" };

  if (row.valid_from && now < new Date(row.valid_from)) {
    return { ok: false, reason: "not_started" };
  }
  if (row.valid_until && now > new Date(row.valid_until)) {
    return { ok: false, reason: "expired" };
  }

  if (!alreadyRedeemedByUser && redemptionCount >= redemptionCap(row)) {
    return { ok: false, reason: "exhausted" };
  }

  return { ok: true };
}

const AVAILABILITY_MESSAGES = {
  not_found: "That discount code does not exist.",
  inactive: "That discount code is no longer active.",
  not_started: "That discount code is not active yet.",
  expired: "That discount code has expired.",
  exhausted: "That discount code has reached its usage limit.",
};

function availabilityMessage(reason) {
  return AVAILABILITY_MESSAGES[reason] || "That discount code cannot be used.";
}

/**
 * When a discount applied now stops applying. NULL duration means it rides
 * along for as long as the subscription does.
 */
function computeExpiry(row, from = new Date()) {
  const months = Number(row && row.duration_months);
  if (!Number.isFinite(months) || months <= 0) return null;
  const end = new Date(from.getTime());
  end.setMonth(end.getMonth() + Math.floor(months));
  return end.toISOString();
}

/**
 * The paywall's two price boxes, discounted or not.
 *
 * Passing a falsy `code` yields list price, which is what the free/base state
 * renders — so there is exactly one code path behind both states.
 */
function computePricing(code) {
  let monthly = BASE_PRICING.monthly;
  let yearly = BASE_PRICING.yearly;

  if (code) {
    switch (code.discount_type) {
      case "percent": {
        const pct = clamp(Number(code.percent_off) || 0, 0, 100);
        monthly = BASE_PRICING.monthly * (1 - pct / 100);
        yearly = BASE_PRICING.yearly * (1 - pct / 100);
        break;
      }
      case "fixed_monthly":
        monthly = Math.max(0, Number(code.fixed_monthly_price) || 0);
        break;
      case "fixed_yearly":
        yearly = Math.max(0, Number(code.fixed_yearly_price) || 0);
        break;
      case "fixed_both":
        monthly = Math.max(0, Number(code.fixed_monthly_price) || 0);
        yearly = Math.max(0, Number(code.fixed_yearly_price) || 0);
        break;
      default:
        break;
    }
  }

  monthly = round2(monthly);
  yearly = round2(yearly);

  // The "SAVE x%" badge on the annual box is derived, not hardcoded, so it stays
  // truthful once a code moves one price and not the other.
  const yearlyVsMonthly = monthly > 0 ? 1 - yearly / (monthly * 12) : 0;

  return {
    currency: BASE_PRICING.currency,
    monthly: {
      original: BASE_PRICING.monthly,
      final: monthly,
      discounted: monthly !== BASE_PRICING.monthly,
    },
    yearly: {
      original: BASE_PRICING.yearly,
      final: yearly,
      discounted: yearly !== BASE_PRICING.yearly,
      originalPerMonth: round2(BASE_PRICING.yearly / 12),
      perMonth: round2(yearly / 12),
    },
    annualSavingsPercent: Math.max(0, Math.round(yearlyVsMonthly * 100)),
  };
}

/**
 * The client-facing shape of a code: enough to render "40% off for 3 months"
 * without exposing usage caps or who else holds it.
 */
function publicCode(row, expiresAt) {
  if (!row) return null;
  return {
    code: row.code,
    description: row.description || null,
    discountType: row.discount_type,
    percentOff: row.percent_off != null ? Number(row.percent_off) : null,
    fixedMonthlyPrice:
      row.fixed_monthly_price != null ? Number(row.fixed_monthly_price) : null,
    fixedYearlyPrice:
      row.fixed_yearly_price != null ? Number(row.fixed_yearly_price) : null,
    durationMonths:
      row.duration_months != null ? Number(row.duration_months) : null,
    expiresAt: expiresAt || null,
  };
}

/**
 * Rejects a half-specified code before it can reach the paywall and render a
 * price of €0 or NaN.
 */
function validateCodeDefinition(input) {
  const errors = [];
  const code = normalizeCode(input.code);

  if (!code) errors.push("Code is required.");
  else if (!/^[A-Z0-9._-]{2,32}$/.test(code)) {
    errors.push(
      "Code must be 2-32 characters, letters/numbers/._- only.",
    );
  }

  if (!DISCOUNT_TYPES.includes(input.discountType)) {
    errors.push(`Type must be one of: ${DISCOUNT_TYPES.join(", ")}.`);
  }

  const num = (v) => (v === "" || v == null ? null : Number(v));
  const percentOff = num(input.percentOff);
  const fixedMonthly = num(input.fixedMonthlyPrice);
  const fixedYearly = num(input.fixedYearlyPrice);

  if (input.discountType === "percent") {
    if (!Number.isFinite(percentOff) || percentOff <= 0 || percentOff > 100) {
      errors.push("Percent off must be between 0 and 100.");
    }
  }
  if (
    input.discountType === "fixed_monthly" ||
    input.discountType === "fixed_both"
  ) {
    if (!Number.isFinite(fixedMonthly) || fixedMonthly < 0) {
      errors.push("Fixed monthly price must be 0 or more.");
    }
  }
  if (
    input.discountType === "fixed_yearly" ||
    input.discountType === "fixed_both"
  ) {
    if (!Number.isFinite(fixedYearly) || fixedYearly < 0) {
      errors.push("Fixed yearly price must be 0 or more.");
    }
  }

  const redemptionType = input.redemptionType || "unlimited";
  if (!REDEMPTION_TYPES.includes(redemptionType)) {
    errors.push(`Usage must be one of: ${REDEMPTION_TYPES.join(", ")}.`);
  }
  const maxRedemptions = num(input.maxRedemptions);
  if (redemptionType === "limited") {
    if (!Number.isFinite(maxRedemptions) || maxRedemptions < 1) {
      errors.push("Limited-use codes need a max number of uses of 1 or more.");
    }
  }

  const durationMonths = num(input.durationMonths);
  if (
    durationMonths != null &&
    (!Number.isFinite(durationMonths) || durationMonths < 1)
  ) {
    errors.push("Duration in months must be 1 or more, or left empty.");
  }

  const isoOrNull = (v) => {
    if (!v) return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? undefined : d.toISOString();
  };
  const validFrom = isoOrNull(input.validFrom);
  const validUntil = isoOrNull(input.validUntil);
  if (validFrom === undefined) errors.push("Valid-from is not a valid date.");
  if (validUntil === undefined) errors.push("Valid-until is not a valid date.");
  if (validFrom && validUntil && new Date(validFrom) > new Date(validUntil)) {
    errors.push("Valid-from must be before valid-until.");
  }

  if (errors.length) return { errors };

  return {
    errors: null,
    value: {
      code,
      description: (input.description || "").trim() || null,
      discountType: input.discountType,
      // Only the fields the chosen type actually uses are stored, so a type
      // change can never leave a stale price behind to be picked up later.
      percentOff: input.discountType === "percent" ? percentOff : null,
      fixedMonthlyPrice:
        input.discountType === "fixed_monthly" ||
        input.discountType === "fixed_both"
          ? fixedMonthly
          : null,
      fixedYearlyPrice:
        input.discountType === "fixed_yearly" ||
        input.discountType === "fixed_both"
          ? fixedYearly
          : null,
      durationMonths: durationMonths != null ? Math.floor(durationMonths) : null,
      redemptionType,
      maxRedemptions:
        redemptionType === "limited" ? Math.floor(maxRedemptions) : null,
      validFrom: validFrom || null,
      validUntil: validUntil || null,
      active: input.active === undefined ? 1 : input.active ? 1 : 0,
    },
  };
}

module.exports = {
  BASE_PRICING,
  DISCOUNT_TYPES,
  REDEMPTION_TYPES,
  normalizeCode,
  redemptionCap,
  evaluateCodeAvailability,
  availabilityMessage,
  computeExpiry,
  computePricing,
  publicCode,
  validateCodeDefinition,
  round2,
};
