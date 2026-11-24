// Discount codes only promise what the stores honour (2026-11-24): a free-access
// code grants rooka+ through RevenueCat, a store-offer code points the app at a
// RevenueCat offering, no code changes a server-side price, and the admin page
// counts per code who redeemed it and who then subscribed.
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const express = require("express");

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rooka-discounts-"));
process.env.DB_PATH = path.join(tmpDir, "test.db");
process.env.JWT_SECRET = "test";
process.env.REVENUECAT_SECRET_KEY = "sk_test";
process.env.REVENUECAT_WEBHOOK_SECRET = "hook_secret";

// The test picks the athlete per request through a header.
const authPath = require.resolve("./services/auth");
require.cache[authPath] = {
  id: authPath,
  filename: authPath,
  loaded: true,
  exports: {
    authenticateToken: (req, res, next) => {
      req.user = JSON.parse(req.headers["x-test-user"] || "{}");
      next();
    },
  },
};

// RevenueCat: subscribers' entitlements come from this map; grants are recorded
// and, unless `failGrants` is set, show up as an active entitlement.
const realFetch = global.fetch;
const revenuecatSubscribers = {};
const grants = [];
let failGrants = false;
global.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.startsWith("https://api.revenuecat.com/")) {
    const id = decodeURIComponent(u.split("/subscribers/")[1].split("/")[0]);
    if (u.endsWith("/entitlements/rooka/promotional")) {
      if (failGrants) return new Response("{}", { status: 500 });
      const body = JSON.parse(opts.body);
      grants.push({ id, endTimeMs: body.end_time_ms, auth: opts.headers.Authorization });
      revenuecatSubscribers[id] = { rooka: { expires_date: new Date(body.end_time_ms).toISOString() } };
    }
    return new Response(JSON.stringify({ subscriber: { entitlements: revenuecatSubscribers[id] || {} } }), { status: 200 });
  }
  return realFetch(url, opts);
};

const db = require("./services/db");
const pricing = require("./services/pricing");
const { expireEndedFreeAccess } = require("./services/freeAccess");

const dbAll = (sql, params = []) => new Promise((resolve, reject) => db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows))));
const dbRun = (sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, (err) => (err ? reject(err) : resolve())));
const tierOf = async (id) => (await dbAll(`SELECT subscription_tier FROM users WHERE id = ?`, [id]))[0].subscription_tier;

console.log("🏷️  Running discount code tests...\n");

(async () => {
  // --- 1. The rules on their own ---------------------------------------------
  const from = new Date("2026-11-24T10:00:00Z");
  assert.strictEqual(pricing.computeExpiry({ discount_type: "free_access", duration_days: 14 }, from), "2026-12-08T10:00:00.000Z");
  assert.strictEqual(pricing.computeExpiry({ discount_type: "free_access", duration_months: 1 }, from), "2026-12-24T10:00:00.000Z");
  assert.strictEqual(pricing.computeExpiry({ discount_type: "store_offer", duration_months: 3 }, from), null, "store offers have no end of their own");

  const ok = (input) => pricing.validateCodeDefinition({ code: "CLUB", ...input });
  assert.ok(!ok({ discountType: "free_access", durationMonths: 1 }).errors);
  assert.ok(!ok({ discountType: "free_access", durationDays: 14 }).errors);
  assert.ok(ok({ discountType: "free_access" }).errors, "free access needs a length");
  assert.ok(ok({ discountType: "free_access", durationMonths: 1, durationDays: 3 }).errors, "not both units");
  assert.ok(ok({ discountType: "free_access", durationMonths: 1.5 }).errors, "whole months only");
  assert.ok(ok({ discountType: "store_offer" }).errors, "store offers need an offering");
  assert.ok(ok({ discountType: "store_offer", offeringId: "club 20" }).errors, "offering ids have no spaces");
  assert.ok(ok({ discountType: "percent", percentOff: 20 }).errors, "retired types cannot be created");
  const offer = ok({ discountType: "store_offer", offeringId: "club20_3m", durationMonths: 3 }).value;
  assert.strictEqual(offer.durationMonths, null, "a store offer keeps no length");
  assert.strictEqual(offer.offeringId, "club20_3m");

  const list = pricing.computePricing();
  assert.strictEqual(list.monthly.final, 6.99);
  assert.strictEqual(list.yearly.final, 69.99);
  assert.strictEqual(list.monthly.discounted || list.yearly.discounted, false);
  assert.deepStrictEqual(
    pricing.evaluateCodeAvailability({ discount_type: "percent", active: 1, redemption_type: "unlimited" }),
    { ok: false, reason: "retired" },
  );
  console.log("  ✓ lengths, offerings and retired types are checked");

  // --- 2. The endpoints --------------------------------------------------------
  await new Promise((resolve) => db.serialize(resolve));
  await new Promise((resolve) => setTimeout(resolve, 200));

  const app = express();
  app.use(express.json());
  app.use("/", require("./routes/discounts"));
  app.use("/", require("./routes/admin"));
  app.use("/api/webhooks", require("./routes/webhooks"));
  const server = app.listen(0);
  const NEW_APP = { "x-app-caps": "health-connect,home-town,store-offer-codes" };
  const call = (method, url, user, body, headers = NEW_APP) =>
    realFetch(`http://127.0.0.1:${server.address().port}${url}`, {
      method,
      headers: { "Content-Type": "application/json", "x-test-user": JSON.stringify(user || {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    }).then(async (r) => ({ status: r.status, body: await r.json() }));

  const admin = { id: 1, username: "boss", role: "admin" };
  await dbRun(`INSERT INTO users (id, username, role, subscription_tier) VALUES (1, 'boss', 'admin', 'admin')`);
  for (const id of [11, 12, 13, 14, 15]) {
    await dbRun(`INSERT INTO users (id, username, subscription_tier, daily_token_limit) VALUES (?, ?, 'free', 5000)`, [id, `athlete${id}`]);
  }
  await new Promise((resolve) => setTimeout(resolve, 200)); // webhook table columns

  let r = await call("POST", "/api/admin/discounts", admin, { code: "club-rotterdam", discountType: "free_access", durationMonths: 1 });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  const freeId = r.body.code.id;
  r = await call("POST", "/api/admin/discounts", admin, { code: "runfluencer", discountType: "store_offer", offeringId: "club20_3m" });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  const offerId = r.body.code.id;
  r = await call("POST", "/api/admin/discounts", admin, { code: "pct", discountType: "percent", percentOff: 50 });
  assert.strictEqual(r.status, 400, "the admin cannot create a server-priced code");
  await dbRun(`INSERT INTO discount_codes (code, discount_type, percent_off, redemption_type, active) VALUES ('OLDPCT', 'percent', 50, 'unlimited', 1)`);
  console.log("  ✓ the admin creates free-access and store-offer codes, not price codes");

  // Free access: preview, apply, RevenueCat grant, tier.
  r = await call("POST", "/api/discounts/validate", { id: 11 }, { code: "Club-Rotterdam" });
  assert.strictEqual(r.body.valid, true);
  assert.strictEqual(r.body.code.discountType, "free_access");
  assert.strictEqual(r.body.code.durationMonths, 1);
  assert.strictEqual(r.body.pricing.monthly.final, 6.99, "older builds only ever see list price");
  assert.strictEqual(grants.length, 0, "validate grants nothing");

  r = await call("POST", "/api/discounts/apply", { id: 11 }, { code: "CLUB-ROTTERDAM" });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.strictEqual(grants.length, 1);
  assert.strictEqual(grants[0].id, "11");
  assert.strictEqual(grants[0].auth, "Bearer sk_test");
  assert.strictEqual(new Date(grants[0].endTimeMs).toISOString(), r.body.code.expiresAt, "RevenueCat and the account agree on the end");
  const days = (grants[0].endTimeMs - Date.now()) / 86400000;
  assert.ok(days > 27 && days < 32, `about a month free, got ${days}`);
  assert.strictEqual(await tierOf(11), "rooka_plus");

  r = await call("GET", "/api/discounts/mine", { id: 11 });
  assert.strictEqual(r.body.discount.code, "CLUB-ROTTERDAM");
  assert.strictEqual(r.body.discount.active, true);
  assert.strictEqual(r.body.discount.expired, false);
  r = await call("DELETE", "/api/discounts/mine", { id: 11 });
  assert.strictEqual(r.status, 409, "a running free period cannot be removed");
  r = await call("POST", "/api/discounts/validate", { id: 11 }, { code: "RUNFLUENCER" });
  assert.strictEqual(r.body.reason, "already_subscribed");
  console.log("  ✓ a free-access code grants rooka+ through RevenueCat and moves the athlete to rooka_plus");

  // A RevenueCat failure costs the athlete nothing.
  failGrants = true;
  r = await call("POST", "/api/discounts/apply", { id: 12 }, { code: "CLUB-ROTTERDAM" });
  assert.strictEqual(r.status, 502);
  assert.strictEqual(await tierOf(12), "free");
  assert.strictEqual((await dbAll(`SELECT COUNT(*) AS n FROM discount_redemptions WHERE user_id = 12`))[0].n, 0, "ledger rolled back");
  assert.strictEqual((await dbAll(`SELECT COUNT(*) AS n FROM user_discounts WHERE user_id = 12`))[0].n, 0);
  failGrants = false;
  console.log("  ✓ a failed RevenueCat grant leaves no redemption behind");

  // Store offer: old builds are told to update; new builds get the offering.
  r = await call("POST", "/api/discounts/validate", { id: 13 }, { code: "RUNFLUENCER" }, {});
  assert.strictEqual(r.body.valid, false);
  assert.strictEqual(r.body.reason, "update_required");
  r = await call("POST", "/api/discounts/apply", { id: 13 }, { code: "RUNFLUENCER" }, {});
  assert.strictEqual(r.status, 409);
  r = await call("POST", "/api/discounts/apply", { id: 13 }, { code: "RUNFLUENCER" });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.code.offeringId, "club20_3m");
  assert.strictEqual(r.body.code.expiresAt, null);
  assert.strictEqual(await tierOf(13), "free", "a store offer grants nothing by itself");
  r = await call("GET", "/api/discounts/mine", { id: 13 });
  assert.strictEqual(r.body.discount.active, true);
  assert.strictEqual(r.body.discount.offeringId, "club20_3m");
  assert.strictEqual(r.body.pricing.yearly.final, 69.99);
  await call("POST", "/api/discounts/apply", { id: 14 }, { code: "RUNFLUENCER" });
  console.log("  ✓ a store-offer code hands new builds its offering and asks old builds to update");

  // Retired codes do nothing.
  r = await call("POST", "/api/discounts/validate", { id: 15 }, { code: "OLDPCT" });
  assert.strictEqual(r.body.reason, "retired");
  console.log("  ✓ codes of a retired price type are refused");

  // --- 3. Tracking -------------------------------------------------------------
  const hook = (event) =>
    realFetch(`http://127.0.0.1:${server.address().port}/api/webhooks/revenuecat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "hook_secret" },
      body: JSON.stringify({ event }),
    }).then((res) => res.json());
  await dbRun(`UPDATE discount_redemptions SET first_redeemed_at = datetime('now', '-1 minute')`);
  await hook({ id: "e1", type: "INITIAL_PURCHASE", app_user_id: "13", store: "APP_STORE", environment: "PRODUCTION", presented_offering_id: "club20_3m", product_id: "yearly_club20" });
  await hook({ id: "e2", type: "INITIAL_PURCHASE", app_user_id: "14", store: "APP_STORE", environment: "SANDBOX", presented_offering_id: "club20_3m" });
  await hook({ id: "e3", type: "NON_RENEWING_PURCHASE", app_user_id: "11", store: "PROMOTIONAL", environment: "PRODUCTION" });
  await hook({ id: "e4", type: "INITIAL_PURCHASE", app_user_id: "1", store: "APP_STORE", environment: "PRODUCTION" });
  await new Promise((resolve) => setTimeout(resolve, 100));
  const stored = (await dbAll(`SELECT * FROM revenuecat_events WHERE event_id = 'e1'`))[0];
  assert.strictEqual(stored.presented_offering_id, "club20_3m");
  assert.strictEqual(stored.environment, "PRODUCTION");
  assert.strictEqual(await tierOf(13), "rooka_plus", "a purchase upgrades");
  assert.strictEqual(await tierOf(1), "admin", "a purchase never demotes an admin to rooka_plus");

  r = await call("GET", "/api/admin/discounts", admin);
  const byCode = Object.fromEntries(r.body.codes.map((c) => [c.code, c]));
  assert.strictEqual(byCode["CLUB-ROTTERDAM"].redemptionCount, 1);
  assert.strictEqual(byCode["CLUB-ROTTERDAM"].activeHolders, 1);
  assert.strictEqual(byCode["CLUB-ROTTERDAM"].subscribedCount, 0, "a free-access grant is not a subscription");
  assert.strictEqual(byCode["RUNFLUENCER"].redemptionCount, 2);
  assert.strictEqual(byCode["RUNFLUENCER"].subscribedCount, 1, "sandbox purchases are not counted");
  assert.strictEqual(byCode["RUNFLUENCER"].offeringId, "club20_3m");
  assert.strictEqual(byCode["OLDPCT"].retired, true);
  assert.strictEqual(byCode["CLUB-ROTTERDAM"].retired, false);
  console.log("  ✓ the admin list counts redemptions, holders and production subscriptions per code");

  // Switching a store offer off stops it for its holders; a running free period stays.
  r = await call("PATCH", `/api/admin/discounts/${offerId}/active`, admin, { active: false });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.code.active, false);
  r = await call("GET", "/api/discounts/mine", { id: 14 });
  assert.strictEqual(r.body.discount.active, false);
  await call("PATCH", `/api/admin/discounts/${freeId}/active`, admin, { active: false });
  r = await call("GET", "/api/discounts/mine", { id: 11 });
  assert.strictEqual(r.body.discount.active, true, "the free period already granted keeps running");
  r = await call("PATCH", `/api/admin/discounts/999/active`, admin, { active: true });
  assert.strictEqual(r.status, 404);
  console.log("  ✓ switching codes off: offers stop, granted free periods run on");

  // --- 4. The end of a free period --------------------------------------------
  await call("PATCH", `/api/admin/discounts/${freeId}/active`, admin, { active: true });
  await dbRun(`INSERT INTO users (id, username, subscription_tier) VALUES (16, 'athlete16', 'free')`);
  r = await call("POST", "/api/discounts/apply", { id: 16 }, { code: "CLUB-ROTTERDAM" });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(await tierOf(16), "rooka_plus");

  const past = new Date(Date.now() - 3600000).toISOString();
  await dbRun(`UPDATE discount_redemptions SET granted_until = ? WHERE user_id IN (11, 16)`, [past]);
  await dbRun(`UPDATE user_discounts SET expires_at = ? WHERE user_id IN (11, 16)`, [past]);
  revenuecatSubscribers["11"] = {}; // the promotional lapsed, nothing else
  revenuecatSubscribers["16"] = { rooka: { expires_date: new Date(Date.now() + 30 * 86400000).toISOString() } }; // subscribed meanwhile

  assert.strictEqual(await expireEndedFreeAccess(), 1);
  assert.strictEqual(await tierOf(11), "free", "back to free when nothing else gives rooka+");
  assert.strictEqual(await tierOf(16), "rooka_plus", "a subscriber keeps rooka+");
  const open = await dbAll(`SELECT COUNT(*) AS n FROM discount_redemptions WHERE granted_until IS NOT NULL AND grant_closed_at IS NULL`);
  assert.strictEqual(open[0].n, 0, "both grants are settled");
  assert.strictEqual(await expireEndedFreeAccess(), 0, "settled grants are not checked again");

  r = await call("GET", "/api/discounts/mine", { id: 11 });
  assert.strictEqual(r.body.discount.expired, true);
  assert.strictEqual(r.body.discount.active, false);
  r = await call("POST", "/api/discounts/validate", { id: 11 }, { code: "CLUB-ROTTERDAM" });
  assert.strictEqual(r.body.reason, "free_access_used", "one free period per athlete");
  r = await call("DELETE", "/api/discounts/mine", { id: 11 });
  assert.strictEqual(r.status, 200, "an ended free period can be removed");
  console.log("  ✓ ended free periods go back to free unless the athlete subscribed, once per athlete");

  server.close();
  console.log("\n✅ Discount code tests passed");
  process.exit(0);
})().catch((err) => {
  console.error("❌ Discount code tests failed:", err);
  process.exit(1);
});
