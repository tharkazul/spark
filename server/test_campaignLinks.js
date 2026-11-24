// rooka.io/get/<campaign>: one link for posters and QR codes that sends each phone to
// its own store with the campaign attached, and counts clicks without storing who clicked.
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const express = require("express");

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rooka-campaigns-"));
process.env.DB_PATH = path.join(tmpDir, "test.db");
process.env.APP_STORE_PROVIDER_TOKEN = "123456";

// The test picks the user per request through a header.
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

const db = require("./services/db");
const campaigns = require("./routes/campaigns");
const { normalizeCampaign, platformFor, storeUrl } = campaigns._test;

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
const ANDROID = "Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15";
const WHATSAPP = "WhatsApp/2.24.21.80 A";

const allClicks = () =>
  new Promise((resolve, reject) =>
    // Inserts run in parallel, so compare them in a fixed order.
    db.all(`SELECT campaign, platform FROM campaign_clicks ORDER BY campaign, platform`, [], (err, rows) => (err ? reject(err) : resolve(rows))),
  );
const settle = () => new Promise((r) => setTimeout(r, 150));

console.log("🔗 Running campaign link tests...\n");

(async () => {
  // Helpers
  assert.strictEqual(normalizeCampaign("Club-Rotterdam"), "club-rotterdam");
  assert.strictEqual(normalizeCampaign("club rotterdam"), "direct", "spaces are refused");
  assert.strictEqual(normalizeCampaign("<script>"), "direct");
  assert.strictEqual(normalizeCampaign(""), "direct");
  assert.strictEqual(normalizeCampaign("a".repeat(41)), "direct", "at most 40 characters");
  assert.strictEqual(platformFor(IPHONE), "ios");
  assert.strictEqual(platformFor(ANDROID), "android");
  assert.strictEqual(platformFor(MAC), "other");
  assert.strictEqual(platformFor(undefined), "other");
  console.log("✅ Campaign names and platforms are recognised");

  const app = express();
  app.use("/", campaigns);
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = (p, ua, headers = {}) => fetch(base + p, { redirect: "manual", headers: { "user-agent": ua, ...headers } });

  // iPhone: App Store campaign link with the provider token
  let res = await get("/get/club-rotterdam", IPHONE);
  assert.strictEqual(res.status, 302);
  assert.strictEqual(
    res.headers.get("location"),
    "https://apps.apple.com/app/apple-store/id6805854962?pt=123456&ct=club-rotterdam&mt=8",
  );
  assert.strictEqual(res.headers.get("cache-control"), "no-store", "a cache must not hand the iPhone answer to Android");
  console.log("✅ iPhones go to the App Store with the campaign");

  // Android: Play link with the UTM referrer
  res = await get("/get/club-rotterdam", ANDROID);
  const play = new URL(res.headers.get("location"));
  assert.strictEqual(play.origin + play.pathname, "https://play.google.com/store/apps/details");
  assert.strictEqual(play.searchParams.get("id"), "io.rooka.app");
  const referrer = new URLSearchParams(play.searchParams.get("referrer"));
  assert.strictEqual(referrer.get("utm_campaign"), "club-rotterdam");
  assert.strictEqual(referrer.get("utm_source"), "club-rotterdam");
  console.log("✅ Android phones go to Google Play with the campaign");

  // Desktop: the website's download section
  res = await get("/get/club-rotterdam", MAC);
  assert.strictEqual(res.headers.get("location"), "/#get");
  res = await get("/get", MAC);
  assert.strictEqual(res.headers.get("location"), "/#get");
  console.log("✅ Computers land on the website's download section");

  // Without a provider token the App Store link still works, just without attribution
  delete process.env.APP_STORE_PROVIDER_TOKEN;
  assert.strictEqual(storeUrl("ios", "x"), "https://apps.apple.com/app/id6805854962");
  process.env.APP_STORE_PROVIDER_TOKEN = "123456";

  // A WhatsApp link preview is redirected but not counted
  res = await get("/get/club-rotterdam", WHATSAPP);
  assert.strictEqual(res.status, 302);
  await settle();
  assert.deepStrictEqual(await allClicks(), [
    { campaign: "club-rotterdam", platform: "android" },
    { campaign: "club-rotterdam", platform: "ios" },
    { campaign: "club-rotterdam", platform: "other" },
    { campaign: "direct", platform: "other" },
  ]);
  console.log("✅ Clicks are counted per campaign and platform; link previews are not");

  // Counts are for admins only
  res = await get("/api/admin/campaign-clicks", MAC, { "x-test-user": JSON.stringify({ id: 2, role: "user" }) });
  assert.strictEqual(res.status, 403, "a normal account cannot read the counts");
  res = await get("/api/admin/campaign-clicks?days=30", MAC, { "x-test-user": JSON.stringify({ id: 1, role: "admin" }) });
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.days, 30);
  const ios = body.rows.find((r) => r.campaign === "club-rotterdam" && r.platform === "ios");
  assert.strictEqual(ios.clicks, 1);
  console.log("✅ Only admins can read the click counts");

  server.close();
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
  console.log("\n🎉 All campaign link tests passed!");
  process.exit(0);
})().catch((e) => {
  console.error("❌ Campaign link test failed:", e);
  process.exit(1);
});
