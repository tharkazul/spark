// Server-side check of a RevenueCat entitlement. The app's own claim that a
// purchase went through is never trusted on its own: the subscriber record is
// fetched from RevenueCat's REST API with the project's secret key.

const API_BASE = "https://api.revenuecat.com/v1";
const ROOKA_ENTITLEMENT = "rooka";

function isConfigured() {
  return Boolean(process.env.REVENUECAT_SECRET_KEY);
}

// An entitlement is active while its expires_date lies in the future. A null
// expires_date is how RevenueCat reports a lifetime (non-expiring) entitlement.
function entitlementIsActive(entitlement, now = Date.now()) {
  if (!entitlement) return false;
  if (entitlement.expires_date === null) return true;
  const expires = Date.parse(entitlement.expires_date);
  return Number.isFinite(expires) && expires > now;
}

// Resolves true only when RevenueCat confirms an active `rooka` entitlement for
// this athlete (app_user_id is the users.id the app passes to Purchases.logIn).
// Throws when the key is missing or RevenueCat cannot be reached.
async function hasActiveRookaEntitlement(userId) {
  const key = process.env.REVENUECAT_SECRET_KEY;
  if (!key) throw new Error("REVENUECAT_SECRET_KEY is not set");

  const res = await fetch(`${API_BASE}/subscribers/${encodeURIComponent(String(userId))}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`RevenueCat responded ${res.status}`);

  const body = await res.json();
  return entitlementIsActive(body?.subscriber?.entitlements?.[ROOKA_ENTITLEMENT]);
}

// Gives the athlete the `rooka` entitlement until endTimeMs without any store
// purchase (RevenueCat "promotional" grant). Used for free-access discount
// codes; the app sees it in CustomerInfo like any subscription. Throws when the
// key is missing or RevenueCat refuses.
async function grantPromotionalRooka(userId, endTimeMs) {
  const key = process.env.REVENUECAT_SECRET_KEY;
  if (!key) throw new Error("REVENUECAT_SECRET_KEY is not set");
  if (!Number.isFinite(endTimeMs) || endTimeMs <= Date.now()) {
    throw new Error("Promotional end time must lie in the future");
  }

  const url = `${API_BASE}/subscribers/${encodeURIComponent(String(userId))}/entitlements/${ROOKA_ENTITLEMENT}/promotional`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ end_time_ms: Math.floor(endTimeMs) }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`RevenueCat responded ${res.status}`);

  const body = await res.json().catch(() => null);
  return entitlementIsActive(body?.subscriber?.entitlements?.[ROOKA_ENTITLEMENT]);
}

module.exports = {
  isConfigured,
  entitlementIsActive,
  hasActiveRookaEntitlement,
  grantPromotionalRooka,
  ROOKA_ENTITLEMENT,
};
