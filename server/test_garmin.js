// Garmin official API: the PKCE connect flow end to end over HTTP, token refresh
// and renewal, disconnect, and the deregistration / permission webhooks.
// Throwaway database, fake Garmin.
const path = require("path");
const os = require("os");
const crypto = require("crypto");
process.env.DB_PATH = path.join(os.tmpdir(), `rooka_garmin_test_${process.pid}.db`);
process.env.ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef";
process.env.JWT_SECRET = "test-secret";
process.env.GARMIN_CLIENT_ID = "test-client";
process.env.GARMIN_CLIENT_SECRET = "test-secret-value";
process.env.GARMIN_AUTHORIZE_URL = "https://connect.garmin.test/oauth2Confirm";
process.env.GARMIN_TOKEN_URL = "https://diauth.garmin.test/oauth/token";
process.env.GARMIN_API_BASE = "https://apis.garmin.test";
delete process.env.GARMIN_WEBHOOK_TOKEN;
const assert = require("assert");
const express = require("express");
const jwt = require("jsonwebtoken");
const db = require("./services/db");
const { encrypt, decrypt } = require("./services/crypto");
const garmin = require("./services/garmin");

const run = (q, p = []) => new Promise((r, j) => db.run(q, p, (e) => (e ? j(e) : r())));
const get = (q, p = []) => new Promise((r) => db.get(q, p, (e, row) => r(row)));

console.log("⌚ Running Garmin tests...\n");

// ---------------------------------------------------------------------------
// Fake Garmin (token endpoint + partner gateway); localhost goes to the real server
// ---------------------------------------------------------------------------
const realFetch = global.fetch;
let calls = [];
let tokenReply = null; // object, or (form) => reply
let garminUserIdFor = (token) => `garmin-${token}`;
let permissionsReply = { permissions: ["ACTIVITY_EXPORT", "HEALTH_EXPORT", "WORKOUT_IMPORT"] };
let userIdStatus = 200;
const reply = (status, json) => ({
  status,
  ok: status >= 200 && status < 300,
  headers: { get: () => null },
  json: async () => json,
  text: async () => (json === undefined ? "" : JSON.stringify(json)),
});
global.fetch = async (url, opts = {}) => {
  if (String(url).startsWith("http://127.0.0.1")) return realFetch(url, opts);
  const u = new URL(url);
  const auth = opts.headers && opts.headers.Authorization;
  calls.push({ method: opts.method || "GET", host: u.host, path: u.pathname, body: opts.body, auth });
  if (u.host === "diauth.garmin.test") {
    await new Promise((r) => setTimeout(r, 20)); // lets parallel callers overlap
    const form = new URLSearchParams(opts.body);
    return typeof tokenReply === "function" ? tokenReply(form) : reply(200, tokenReply);
  }
  const bearer = String(auth || "").replace(/^Bearer /, "");
  if (u.pathname === "/partner-gateway/rest/user/id") {
    return userIdStatus === 200 ? reply(200, { userId: garminUserIdFor(bearer) }) : reply(userIdStatus, { error: "nope" });
  }
  if (u.pathname === "/partner-gateway/rest/user/permissions") return reply(200, permissionsReply);
  if (u.pathname === "/partner-gateway/rest/user/registration" && opts.method === "DELETE") return reply(204, undefined);
  return reply(404, { error: "no route" });
};

const tokens = (access, refresh, extra = {}) => ({
  access_token: access,
  refresh_token: refresh,
  expires_in: 86400,
  refresh_token_expires_in: 7775998,
  token_type: "bearer",
  ...extra,
});

(async () => {
  await new Promise((r) => setTimeout(r, 2000)); // db.js migrations
  await run(
    `INSERT INTO users (id, username, password_hash, garmin_username, garmin_password) VALUES
       (1, 'runner', 'x', 'old@garmin', ?), (2, 'other', 'x', NULL, NULL), (3, 'third', 'x', NULL, NULL)`,
    [encrypt("hunter2")],
  );

  const app = express();
  app.use(express.json());
  app.use("/", require("./routes/garmin"));
  const server = await new Promise((r) => {
    const s = app.listen(0, "127.0.0.1", () => r(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const authHeader = (id) => ({ Authorization: `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET)}` });

  // -------------------------------------------------------------------------
  // 1. PKCE
  // -------------------------------------------------------------------------
  const { verifier, challenge } = garmin.pkcePair();
  assert.ok(verifier.length >= 43 && verifier.length <= 128, "verifier length is 43-128");
  assert.match(verifier, /^[A-Za-z0-9\-._~]+$/, "verifier uses only unreserved characters");
  assert.strictEqual(challenge, crypto.createHash("sha256").update(verifier).digest("base64url"));
  console.log("✅ PKCE verifier and S256 challenge");

  // -------------------------------------------------------------------------
  // 2. Connect flow over HTTP: /api/garmin/connect -> Garmin -> /garminredirect
  // -------------------------------------------------------------------------
  let res = await realFetch(`${base}/api/garmin/connect`, { headers: authHeader(1) });
  assert.strictEqual(res.status, 200);
  const { url } = await res.json();
  const authorize = new URL(url);
  assert.strictEqual(`${authorize.origin}${authorize.pathname}`, process.env.GARMIN_AUTHORIZE_URL);
  const q = authorize.searchParams;
  assert.strictEqual(q.get("client_id"), "test-client");
  assert.strictEqual(q.get("response_type"), "code");
  assert.strictEqual(q.get("code_challenge_method"), "S256");
  assert.strictEqual(q.get("redirect_uri"), "https://api.rooka.io/garminredirect");
  assert.ok(q.get("state") && q.get("code_challenge"));
  assert.strictEqual(url.includes("secret"), false, "the client secret never leaves the server");
  const pendingRow = await get(`SELECT * FROM garmin_oauth_pending WHERE state = ?`, [q.get("state")]);
  assert.ok(pendingRow && pendingRow.user_id === 1);
  assert.notStrictEqual(pendingRow.code_verifier.length, 64, "the stored verifier is encrypted");
  console.log("✅ The connect URL carries the challenge and a state; the verifier waits encrypted on the server");

  calls = [];
  tokenReply = (form) => {
    assert.strictEqual(form.get("grant_type"), "authorization_code");
    assert.strictEqual(form.get("code"), "the-code");
    assert.strictEqual(form.get("client_secret"), "test-secret-value");
    assert.strictEqual(form.get("redirect_uri"), "https://api.rooka.io/garminredirect");
    const sent = crypto.createHash("sha256").update(form.get("code_verifier")).digest("base64url");
    assert.strictEqual(sent, q.get("code_challenge"), "the verifier matches the challenge Garmin saw");
    return reply(200, tokens("access-1", "refresh-1"));
  };
  const firstSyncs = [];
  require("./services/garminTraining").syncGarminCalendar = async (uid) => firstSyncs.push(uid);
  res = await realFetch(`${base}/garminredirect?code=the-code&state=${encodeURIComponent(q.get("state"))}`);
  let page = await res.text();
  assert.ok(page.includes("garminredirect?status=connected"), "deep-links back as connected");
  assert.deepStrictEqual(firstSyncs, [1], "the Garmin calendar is filled right after connecting");
  let row = await get(`SELECT * FROM garmin_tokens WHERE user_id = 1`);
  assert.strictEqual(row.garmin_user_id, "garmin-access-1");
  assert.strictEqual(decrypt(row.access_token), "access-1");
  assert.notStrictEqual(row.access_token, "access-1", "tokens are stored encrypted");
  assert.strictEqual(decrypt(row.refresh_token), "refresh-1");
  assert.deepStrictEqual(JSON.parse(row.permissions), ["ACTIVITY_EXPORT", "HEALTH_EXPORT", "WORKOUT_IMPORT"]);
  assert.ok(row.refresh_expires_at > Math.floor(Date.now() / 1000) + 89 * 86400);
  assert.strictEqual(await get(`SELECT * FROM garmin_oauth_pending WHERE state = ?`, [q.get("state")]), undefined, "state is single use");
  const legacy = await get(`SELECT garmin_username, garmin_password FROM users WHERE id = 1`);
  assert.deepStrictEqual({ ...legacy }, { garmin_username: null, garmin_password: null }, "the stored Garmin password is deleted");
  assert.deepStrictEqual(await garmin.connectionStatus(1), {
    connected: true,
    permissions: ["ACTIVITY_EXPORT", "HEALTH_EXPORT", "WORKOUT_IMPORT"],
  });
  console.log("✅ The callback swaps the code with the verifier, stores the tokens and deletes the old Garmin login");

  res = await realFetch(`${base}/garminredirect?code=the-code&state=${encodeURIComponent(q.get("state"))}`);
  assert.ok((await res.text()).includes("status=error"), "a replayed state is refused");
  res = await realFetch(`${base}/garminredirect?code=x&state=made-up`);
  assert.ok((await res.text()).includes("status=error"), "an unknown state is refused");
  console.log("✅ Replayed and unknown states are refused");

  // Declined on Garmin's page: the pending connect is cleaned up too.
  const declinedUrl = new URL(await garmin.authorizeUrl(2));
  res = await realFetch(`${base}/garminredirect?error=access_denied&state=${encodeURIComponent(declinedUrl.searchParams.get("state"))}`);
  assert.ok((await res.text()).includes("status=denied"));
  assert.strictEqual((await get(`SELECT COUNT(*) AS n FROM garmin_oauth_pending WHERE user_id = 2`)).n, 0);
  console.log("✅ Declining on Garmin's page reports denied and drops the pending connect");

  // An expired state.
  const oldUrl = new URL(await garmin.authorizeUrl(2, Date.now() - 16 * 60 * 1000));
  assert.strictEqual(await garmin.takePending(oldUrl.searchParams.get("state")), null);
  console.log("✅ A state older than 15 minutes is refused");

  // Garmin won't say who the user is: no half connection on either side.
  userIdStatus = 500;
  calls = [];
  tokenReply = tokens("access-x", "refresh-x");
  await assert.rejects(garmin.exchangeCode(2, "c", "v"), /user id/);
  assert.strictEqual(await get(`SELECT * FROM garmin_tokens WHERE user_id = 2`), undefined);
  assert.ok(calls.some((c) => c.method === "DELETE" && c.path === "/partner-gateway/rest/user/registration"), "the registration is undone at Garmin");
  userIdStatus = 200;
  console.log("✅ Without a Garmin user id nothing is kept, and the registration is undone");

  // The same Garmin account connected from another rooka account moves there.
  garminUserIdFor = () => "garmin-access-1";
  tokenReply = tokens("access-2", "refresh-2");
  await garmin.exchangeCode(2, "c", "v");
  assert.strictEqual(await get(`SELECT * FROM garmin_tokens WHERE user_id = 1`), undefined);
  assert.strictEqual((await get(`SELECT garmin_user_id FROM garmin_tokens WHERE user_id = 2`)).garmin_user_id, "garmin-access-1");
  console.log("✅ One Garmin account feeds one rooka account: a second connect moves it");
  garminUserIdFor = (token) => `garmin-${token}`;

  // -------------------------------------------------------------------------
  // 3. Tokens: fresh, refreshed once for parallel callers, rotated, renewed
  // -------------------------------------------------------------------------
  const nowSec = Math.floor(Date.now() / 1000);
  calls = [];
  assert.strictEqual(await garmin.getValidAccessToken(2), "access-2");
  assert.strictEqual(calls.length, 0, "a fresh token needs no call");

  await run(`UPDATE garmin_tokens SET expires_at = ? WHERE user_id = 2`, [nowSec + 300]);
  let refreshForms = [];
  tokenReply = (form) => {
    refreshForms.push(form);
    return reply(200, tokens("access-3", "refresh-3"));
  };
  const [a, b] = await Promise.all([garmin.getValidAccessToken(2), garmin.getValidAccessToken(2)]);
  assert.deepStrictEqual([a, b], ["access-3", "access-3"]);
  assert.strictEqual(refreshForms.length, 1, "parallel callers share one refresh");
  assert.strictEqual(refreshForms[0].get("grant_type"), "refresh_token");
  assert.strictEqual(refreshForms[0].get("refresh_token"), "refresh-2");
  assert.strictEqual(decrypt((await get(`SELECT refresh_token FROM garmin_tokens WHERE user_id = 2`)).refresh_token), "refresh-3");
  console.log("✅ Within 10 minutes of expiry the token is refreshed once and the new refresh token kept");

  // Daily renewal: only connections whose refresh token runs out within 30 days.
  await run(`INSERT INTO garmin_tokens (user_id, garmin_user_id, access_token, refresh_token, expires_at, refresh_expires_at)
             VALUES (3, 'garmin-third', ?, ?, ?, ?)`, [encrypt("access-t"), encrypt("refresh-t"), nowSec + 80000, nowSec + 10 * 86400]);
  refreshForms = [];
  tokenReply = (form) => {
    refreshForms.push(form);
    return reply(200, tokens("access-t2", "refresh-t2"));
  };
  const renewal = await garmin.refreshExpiringConnections();
  assert.deepStrictEqual(renewal, { checked: 1, renewed: 1 });
  assert.strictEqual(refreshForms[0].get("refresh_token"), "refresh-t");
  assert.ok((await get(`SELECT refresh_expires_at FROM garmin_tokens WHERE user_id = 3`)).refresh_expires_at > nowSec + 89 * 86400);
  console.log("✅ The daily job renews refresh tokens that run out within 30 days, and only those");

  // A server error is not a disconnect; invalid_grant is.
  await run(`UPDATE garmin_tokens SET expires_at = ? WHERE user_id = 3`, [nowSec]);
  tokenReply = () => reply(503, { error: "temporarily_unavailable" });
  await assert.rejects(garmin.getValidAccessToken(3), /temporarily_unavailable/);
  assert.ok(await get(`SELECT 1 FROM garmin_tokens WHERE user_id = 3`), "kept after a 503");
  tokenReply = () => reply(400, { error: "invalid_grant" });
  assert.strictEqual(await garmin.getValidAccessToken(3), null);
  assert.strictEqual(await get(`SELECT 1 FROM garmin_tokens WHERE user_id = 3`), undefined, "forgotten after invalid_grant");
  console.log("✅ invalid_grant forgets the connection; a 503 doesn't");

  // -------------------------------------------------------------------------
  // 4. Webhooks
  // -------------------------------------------------------------------------
  const hook = (token, kind, body) =>
    realFetch(`${base}/api/webhooks/garmin/${token}/${kind}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  const settle = () => new Promise((r) => setTimeout(r, 50)); // processing runs after the 200

  assert.strictEqual((await hook("anything", "deregistration", {})).status, 503, "refused while no token is configured");
  process.env.GARMIN_WEBHOOK_TOKEN = "hook-secret";
  assert.strictEqual((await hook("wrong", "deregistration", {})).status, 401);
  assert.strictEqual((await hook("hook-secret", "nonsense", {})).status, 404);

  assert.strictEqual(
    (await hook("hook-secret", "permissions", {
      userPermissionsChange: [{ userId: "garmin-access-1", permissions: ["ACTIVITY_EXPORT"], changeTimeInSeconds: 1 }],
    })).status,
    200,
  );
  await settle();
  assert.deepStrictEqual((await garmin.connectionStatus(2)).permissions, ["ACTIVITY_EXPORT"]);
  console.log("✅ Permission changes are stored");

  assert.strictEqual((await hook("hook-secret", "deregistration", { deregistrations: [{ userId: "garmin-access-1" }] })).status, 200);
  await settle();
  assert.deepStrictEqual(await garmin.connectionStatus(2), { connected: false, permissions: null });
  console.log("✅ A deregistration from Garmin disconnects the athlete; wrong or missing tokens are refused");

  // -------------------------------------------------------------------------
  // 5. Disconnect from rooka
  // -------------------------------------------------------------------------
  tokenReply = tokens("access-9", "refresh-9");
  await garmin.exchangeCode(1, "c", "v");
  calls = [];
  await garmin.disconnect(1);
  const del = calls.find((c) => c.method === "DELETE" && c.path === "/partner-gateway/rest/user/registration");
  assert.ok(del, "Garmin is told to delete the registration");
  assert.strictEqual(del.auth, "Bearer access-9");
  assert.strictEqual(await get(`SELECT 1 FROM garmin_tokens WHERE user_id = 1`), undefined);
  await garmin.disconnect(1); // not connected: nothing to do, no throw
  console.log("✅ Disconnect deregisters at Garmin and deletes the tokens");

  server.close();
  console.log("\n🎉 All Garmin tests passed!");
  setTimeout(() => {
    try { require("fs").unlinkSync(process.env.DB_PATH); } catch (_) {}
    process.exit(0);
  }, 200);
})().catch((e) => {
  console.error("❌", e);
  try { require("fs").unlinkSync(process.env.DB_PATH); } catch (_) {}
  process.exit(1);
});
