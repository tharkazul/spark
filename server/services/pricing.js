/**
 * Subscription list price and discount-code rules.
 *
 * The server never computes a discounted price. Apple and Google charge the
 * athlete, per country and in their own currency, so a number worked out here
 * could only ever be a promise the store does not keep. What a code does is
 * one of two things the server can actually honour:
 *
 *   free_access  – N days or months of rooka+ with nothing to pay, granted
 *                  server-side through RevenueCat (see routes/discounts.js).
 *   store_offer  – the athlete is shown a different RevenueCat offering whose
 *                  App Store / Google Play products carry the discount. The app
 *                  shows the store's own prices for it, which is what the store
 *                  then charges.
 *
 * This module stays the authority on WHO gets a deal: whether a code exists,
 * is switched on, is inside its window and has uses left, and when a free
 * period ends.
 */

// List price, as set in App Store Connect and Play Console for the euro
// storefronts. Only for the admin page's summary line; the app shows the
// store's localized price.
const BASE_PRICING = {
  currency: "€",
  monthly: 6.99,
  yearly: 69.99,
};

/** What a code does. */
const DISCOUNT_TYPES = [
  "free_access", // N days or months of rooka+, nothing to pay
  "store_offer", // a RevenueCat offering with discounted store products
];

/**
 * Types from before codes were tied to what the stores charge. They priced
 * the paywall on the server, which Apple and Google never saw, so a code of
 * one of these types no longer does anything and cannot be created again.
 */
const RETIRED_DISCOUNT_TYPES = ["percent", "fixed_yearly", "fixed_monthly", "fixed_both"];

const REDEMPTION_TYPES = [
  "one_time", // exactly one athlete may ever redeem it
  "limited", // up to max_redemptions athletes
  "unlimited", // no cap
];

// RevenueCat offering identifiers: letters, digits and . _ - only.
const OFFERING_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

const MAX_FREE_MONTHS = 24;
const MAX_FREE_DAYS = 365;

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
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

function isRetiredType(type) {
  return !DISCOUNT_TYPES.includes(type);
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
  if (isRetiredType(row.discount_type)) return { ok: false, reason: "retired" };
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

/**
 * Whether this athlete may take this code, beyond the code itself being
 * usable. Kept apart from evaluateCodeAvailability because it depends on the
 * athlete, not the code.
 *
 *   athlete.tier             users.subscription_tier
 *   athlete.hadFreeAccess    true when any earlier code already gave them a
 *                            free period (one per athlete, ever, so codes
 *                            from different clubs cannot be chained)
 *   athlete.supportsOffers   the app build can show a store offer's paywall
 */
function evaluateAthleteEligibility(row, athlete = {}) {
  if (athlete.tier === "rooka_plus") return { ok: false, reason: "already_subscribed" };
  if (row.discount_type === "free_access" && athlete.hadFreeAccess) {
    return { ok: false, reason: "free_access_used" };
  }
  if (row.discount_type === "store_offer" && !athlete.supportsOffers) {
    return { ok: false, reason: "update_required" };
  }
  return { ok: true };
}

const AVAILABILITY_MESSAGES = {
  not_found: "That discount code does not exist.",
  inactive: "That discount code is no longer active.",
  retired: "That discount code is no longer active.",
  not_started: "That discount code is not active yet.",
  expired: "That discount code has expired.",
  exhausted: "That discount code has reached its usage limit.",
  already_subscribed: "You already have rooka+, so there is nothing for this code to do.",
  free_access_used: "You have already had a free rooka+ period.",
  update_required: "Update rooka to use this code.",
};

function availabilityMessage(reason) {
  return AVAILABILITY_MESSAGES[reason] || "That discount code cannot be used.";
}

/**
 * When a free period granted now ends. Store offers have no end of their own:
 * the store product decides how long its discount lasts, and the code's
 * redemption window decides how long the offer stays on show.
 */
function computeExpiry(row, from = new Date()) {
  if (!row || row.discount_type !== "free_access") return null;
  const months = Number(row.duration_months);
  const days = Number(row.duration_days);
  const end = new Date(from.getTime());
  if (Number.isFinite(months) && months > 0) {
    end.setMonth(end.getMonth() + Math.floor(months));
    return end.toISOString();
  }
  if (Number.isFinite(days) && days > 0) {
    end.setDate(end.getDate() + Math.floor(days));
    return end.toISOString();
  }
  return null;
}

/**
 * List price in the old paywall shape. Older app builds still render
 * `pricing` from the discount endpoints; sending list price there means they
 * can never again show a discount the store will not give.
 */
function computePricing() {
  const monthly = BASE_PRICING.monthly;
  const yearly = BASE_PRICING.yearly;
  return {
    currency: BASE_PRICING.currency,
    monthly: { original: monthly, final: monthly, discounted: false },
    yearly: {
      original: yearly,
      final: yearly,
      discounted: false,
      originalPerMonth: round2(yearly / 12),
      perMonth: round2(yearly / 12),
    },
    annualSavingsPercent: Math.max(0, Math.round((1 - yearly / (monthly * 12)) * 100)),
  };
}

/**
 * The client-facing shape of a code: enough to say "1 month of rooka+ free" or
 * open the right offering, without usage caps, who else holds it, or the
 * admin's internal description.
 */
function publicCode(row, expiresAt) {
  if (!row) return null;
  return {
    code: row.code,
    discountType: row.discount_type,
    durationMonths: row.duration_months != null ? Number(row.duration_months) : null,
    durationDays: row.duration_days != null ? Number(row.duration_days) : null,
    offeringId: row.discount_type === "store_offer" ? row.offering_id || null : null,
    expiresAt: expiresAt || null,
  };
}

/** Rejects a half-specified code before an athlete can redeem it. */
function validateCodeDefinition(input) {
  const errors = [];
  const code = normalizeCode(input.code);

  if (!code) errors.push("Code is required.");
  else if (!/^[A-Z0-9._-]{2,32}$/.test(code)) {
    errors.push("Code must be 2-32 characters, letters/numbers/._- only.");
  }

  const type = input.discountType;
  if (!DISCOUNT_TYPES.includes(type)) {
    errors.push("Type must be free access or store offer.");
  }

  const num = (v) => (v === "" || v == null ? null : Number(v));
  const durationMonths = num(input.durationMonths);
  const durationDays = num(input.durationDays);
  const offeringId = String(input.offeringId || "").trim();

  if (type === "free_access") {
    const hasMonths = durationMonths != null;
    const hasDays = durationDays != null;
    if (hasMonths === hasDays) {
      errors.push("Free access needs a length in days or in months.");
    } else if (hasMonths && !(Number.isInteger(durationMonths) && durationMonths >= 1 && durationMonths <= MAX_FREE_MONTHS)) {
      errors.push(`Free months must be a whole number from 1 to ${MAX_FREE_MONTHS}.`);
    } else if (hasDays && !(Number.isInteger(durationDays) && durationDays >= 1 && durationDays <= MAX_FREE_DAYS)) {
      errors.push(`Free days must be a whole number from 1 to ${MAX_FREE_DAYS}.`);
    }
  }
  if (type === "store_offer" && !OFFERING_ID_PATTERN.test(offeringId)) {
    errors.push("Store offers need the RevenueCat offering identifier (letters, numbers, . _ - only).");
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
      discountType: type,
      // Only the fields the chosen type uses are stored, so a type change can
      // never leave a stale length or offering behind to be picked up later.
      durationMonths: type === "free_access" ? durationMonths : null,
      durationDays: type === "free_access" ? durationDays : null,
      offeringId: type === "store_offer" ? offeringId : null,
      redemptionType,
      maxRedemptions: redemptionType === "limited" ? Math.floor(maxRedemptions) : null,
      validFrom: validFrom || null,
      validUntil: validUntil || null,
      active: input.active === undefined ? 1 : input.active ? 1 : 0,
    },
  };
}

module.exports = {
  BASE_PRICING,
  DISCOUNT_TYPES,
  RETIRED_DISCOUNT_TYPES,
  REDEMPTION_TYPES,
  normalizeCode,
  isRetiredType,
  redemptionCap,
  evaluateCodeAvailability,
  evaluateAthleteEligibility,
  availabilityMessage,
  computeExpiry,
  computePricing,
  publicCode,
  validateCodeDefinition,
  round2,
};
