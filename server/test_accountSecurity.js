// Security re-audit (2026-10-29): rooka+ only when RevenueCat confirms it, safe
// usernames on /register, and account deletion that leaves nothing behind.
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const express = require("express");

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rooka-account-security-"));
process.env.DB_PATH = path.join(tmpDir, "test.db");
process.env.JWT_SECRET = "test";
delete process.env.REVENUECAT_SECRET_KEY;

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

// RevenueCat answers from this map; every other request goes out for real (to the test server).
const realFetch = global.fetch;
const revenuecatSubscribers = {};
const revenuecatCalls = [];
global.fetch = async (url, opts) => {
  if (String(url).startsWith("https://api.revenuecat.com/")) {
    revenuecatCalls.push({ url: String(url), auth: opts?.headers?.Authorization });
    const id = decodeURIComponent(String(url).split("/subscribers/")[1]);
    const entitlements = revenuecatSubscribers[id] || {};
    return new Response(JSON.stringify({ subscriber: { entitlements } }), { status: 200 });
  }
  return realFetch(url, opts);
};

const db = require("./services/db");
// Load every module that creates a user-owned table, so deletion is checked against all of them.
require("./services/seasonPlan");
require("./services/athleteFacts");
require("./services/coachingTopics");
require("./services/racePlan");
require("./services/liveSessionWorker");
require("./routes/webhooks");

const dbAll = (sql, params = []) => new Promise((resolve, reject) => db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows))));
const dbRun = (sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, (err) => (err ? reject(err) : resolve())));

console.log("🔐 Running account security tests...\n");

(async () => {
  await new Promise((resolve) => db.serialize(resolve));
  await new Promise((resolve) => setTimeout(resolve, 200));

  const app = express();
  app.use(express.json());
  app.use("/api/auth", require("./routes/auth"));
  app.use("/", require("./routes/settings"));
  app.use("/", require("./routes/admin"));
  const server = app.listen(0);
  const call = (method, url, user, body) =>
    realFetch(`http://127.0.0.1:${server.address().port}${url}`, {
      method,
      headers: { "Content-Type": "application/json", "x-test-user": JSON.stringify(user || {}) },
      body: body ? JSON.stringify(body) : undefined,
    }).then(async (r) => ({ status: r.status, body: await r.json() }));
  const tierOf = async (id) => (await dbAll(`SELECT subscription_tier FROM users WHERE id = ?`, [id]))[0].subscription_tier;

  // --- 1. sync-subscription ---------------------------------------------------
  await dbRun(`INSERT INTO users (id, username, subscription_tier) VALUES (101, 'freebie', 'free')`);
  await dbRun(`INSERT INTO users (id, username, subscription_tier) VALUES (102, 'payer', 'free')`);
  await dbRun(`INSERT INTO users (id, username, subscription_tier) VALUES (103, 'lapsed', 'free')`);
  const claim = { hasActiveEntitlement: true, entitlementId: "rooka" };

  let r = await call("POST", "/api/user/sync-subscription", { id: 101 }, claim);
  assert.deepStrictEqual(r.body, { success: true, tier: "free" }, "no key: claim is ignored");
  assert.strictEqual(await tierOf(101), "free");
  assert.strictEqual(revenuecatCalls.length, 0, "no key: RevenueCat is not called");
  console.log("  ✓ without REVENUECAT_SECRET_KEY nobody is upgraded");

  process.env.REVENUECAT_SECRET_KEY = "sk_test";
  r = await call("POST", "/api/user/sync-subscription", { id: 101 }, claim);
  assert.deepStrictEqual(r.body, { success: true, tier: "free" }, "unconfirmed claim is ignored");
  assert.strictEqual(await tierOf(101), "free");
  assert.strictEqual(revenuecatCalls[0].url, "https://api.revenuecat.com/v1/subscribers/101");
  assert.strictEqual(revenuecatCalls[0].auth, "Bearer sk_test");
  console.log("  ✓ a claim RevenueCat does not confirm leaves the athlete on free");

  revenuecatSubscribers["103"] = { rooka: { expires_date: new Date(Date.now() - 60000).toISOString() } };
  r = await call("POST", "/api/user/sync-subscription", { id: 103 }, claim);
  assert.strictEqual(r.body.tier, "free", "expired entitlement does not upgrade");
  console.log("  ✓ an expired entitlement does not upgrade");

  revenuecatSubscribers["102"] = { rooka: { expires_date: new Date(Date.now() + 86400000).toISOString() } };
  r = await call("POST", "/api/user/sync-subscription", { id: 102 }, claim);
  assert.deepStrictEqual(r.body, { success: true, tier: "rooka_plus" });
  assert.strictEqual(await tierOf(102), "rooka_plus");
  console.log("  ✓ a confirmed entitlement upgrades to rooka_plus");

  // --- 2. /register username validation --------------------------------------
  r = await call("POST", "/api/auth/register", null, { username: "<img src=x onerror=alert(1)>", password: "pw123456" });
  assert.strictEqual(r.status, 400, "HTML in a username is refused");
  r = await call("POST", "/api/auth/register", null, { username: "o'brien", password: "pw123456" });
  assert.strictEqual(r.status, 400, "quotes are refused");
  r = await call("POST", "/api/auth/register", null, { username: "ab", password: "pw123456" });
  assert.strictEqual(r.status, 400, "too short");
  r = await call("POST", "/api/auth/register", null, { username: "x".repeat(41), password: "pw123456" });
  assert.strictEqual(r.status, 400, "too long");
  r = await call("POST", "/api/auth/register", null, { username: "  Jürgen Müller  ", password: "pw123456" });
  assert.strictEqual(r.status, 201, "unicode letters and spaces are fine");
  r = await call("POST", "/api/auth/register", null, { username: "sanne.de-vries+run@example.com", password: "pw123456" });
  assert.strictEqual(r.status, 201, "an email address works as a username");
  console.log("  ✓ /register refuses markup characters and keeps email usernames");

  // --- 3. account deletion ----------------------------------------------------
  await dbRun(`INSERT INTO users (id, username, role) VALUES (201, 'boss', 'admin')`);
  const tables = (await dbAll(`SELECT name FROM sqlite_master WHERE type = 'table'`)).map((t) => t.name);
  const userTables = [];
  for (const table of tables) {
    if ((await dbAll(`PRAGMA table_info(${table})`)).some((c) => c.name === "user_id")) userTables.push(table);
  }

  // Put a row for the athlete in every table that has a user_id column, a friend
  // link, a RevenueCat event and one file in every upload folder.
  const seedAthlete = async (id, username) => {
    await dbRun(`INSERT INTO users (id, username) VALUES (?, ?)`, [id, username]);
    for (const table of userTables) {
      const cols = await dbAll(`PRAGMA table_info(${table})`);
      const names = [];
      const values = [];
      const rowidPk = cols.filter((c) => c.pk).length === 1 && cols.find((c) => c.pk && /^INTEGER$/i.test(c.type));
      for (const c of cols) {
        if (c.name === "user_id") {
          names.push(c.name);
          values.push(id);
        } else if ((c.notnull || c.pk) && c.dflt_value == null && c !== rowidPk) {
          names.push(c.name);
          values.push(/INT|REAL|NUM/i.test(c.type) ? 1 : `x_${c.name}_${id}`);
        }
      }
      await dbRun(`INSERT INTO ${table} (${names.join(",")}) VALUES (${names.map(() => "?").join(",")})`, values);
    }
    await dbRun(`INSERT INTO connections (user_id, friend_id) VALUES (1, ?)`, [id]);
    await dbRun(`INSERT INTO revenuecat_events (event_id, type, app_user_id) VALUES (?, 'RENEWAL', ?)`, [`evt_${id}`, String(id)]);

    const uploads = [
      "../public/uploads/profiles/profile_%_1.jpg",
      "../public/uploads/coaches/coach_%_neutral_1.jpg",
      "../public/uploads/milestones/milestone_%_3_1.png",
      "../secure_uploads/physique/physique_%_abc.jpg",
      "../secure_uploads/chat_images/img_%_abc.png",
      "secure_uploads/chat_images/img_%_def.png",
      "../secure_uploads/feedback/fb_%_abc.png",
    ].map((p) => path.join(__dirname, "routes", p.replace("%", id)));
    // Another athlete whose id starts with the same digits must keep their file.
    const bystander = path.join(__dirname, "public/uploads/profiles", `profile_${id}0_1.jpg`);
    for (const file of [...uploads, bystander]) {
      let topMissing = null;
      for (let dir = path.dirname(file); !fs.existsSync(dir); dir = path.dirname(dir)) topMissing = dir;
      if (topMissing) {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        createdDirs.push(topMissing);
      }
      fs.writeFileSync(file, "x");
      createdFiles.push(file);
    }
    return { uploads, bystander };
  };

  const assertErased = async (id, { uploads, bystander }) => {
    await new Promise((resolve) => setTimeout(resolve, 100));
    for (const table of userTables) {
      const left = await dbAll(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id = ?`, [id]);
      assert.strictEqual(left[0].n, 0, `${table} still has rows for the deleted athlete`);
    }
    assert.strictEqual((await dbAll(`SELECT COUNT(*) AS n FROM users WHERE id = ?`, [id]))[0].n, 0);
    assert.strictEqual((await dbAll(`SELECT COUNT(*) AS n FROM connections WHERE friend_id = ?`, [id]))[0].n, 0);
    assert.strictEqual((await dbAll(`SELECT COUNT(*) AS n FROM revenuecat_events WHERE app_user_id = ?`, [String(id)]))[0].n, 0);
    assert.strictEqual((await dbAll(`SELECT COUNT(*) AS n FROM revenuecat_events WHERE event_id = ?`, [`evt_${id}`]))[0].n, 1, "event id kept for dedup");
    for (const file of uploads) assert.ok(!fs.existsSync(file), `${file} survived deletion`);
    assert.ok(fs.existsSync(bystander), "another athlete's file was removed");
  };

  const createdFiles = [];
  const createdDirs = [];
  try {
    // The athlete deletes their own account.
    const leaver = 987650 + Math.floor(Math.random() * 9);
    const leaverFiles = await seedAthlete(leaver, "leaver");

    r = await call("DELETE", "/api/user/account", { id: 201, role: "admin" });
    assert.strictEqual(r.status, 403, "admins cannot delete themselves here");

    r = await call("DELETE", "/api/user/account", { id: leaver, role: "user" });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    await assertErased(leaver, leaverFiles);
    console.log(`  ✓ self-deletion clears all ${userTables.length} user_id tables, connections and the RevenueCat link`);
    console.log("  ✓ self-deletion removes the athlete's uploads and nobody else's");

    // An admin deletes an athlete from admin.html.
    const removed = 876540 + Math.floor(Math.random() * 9);
    const removedFiles = await seedAthlete(removed, "removed athlete");

    r = await call("DELETE", `/api/admin/delete-user/${encodeURIComponent("removed athlete")}`, { id: removed, role: "user", username: "removed athlete" });
    assert.strictEqual(r.status, 403, "only admins reach the admin delete");
    assert.strictEqual((await dbAll(`SELECT COUNT(*) AS n FROM users WHERE id = ?`, [removed]))[0].n, 1);

    r = await call("DELETE", "/api/admin/delete-user/nobody-by-that-name", { id: 201, role: "admin", username: "boss" });
    assert.strictEqual(r.status, 404);

    r = await call("DELETE", `/api/admin/delete-user/${encodeURIComponent("removed athlete")}`, { id: 201, role: "admin", username: "boss" });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    await assertErased(removed, removedFiles);
    const audit = await dbAll(`SELECT admin_username, action, target_username FROM audit_logs WHERE target_username = 'removed athlete'`);
    assert.deepStrictEqual(audit, [{ admin_username: "boss", action: "delete_user", target_username: "removed athlete" }]);
    console.log("  ✓ admin delete erases the same rows and files, and leaves an audit_logs entry");
  } finally {
    for (const file of createdFiles) fs.rmSync(file, { force: true });
    for (const dir of createdDirs.reverse()) fs.rmSync(dir, { recursive: true, force: true });
  }

  server.close();
  console.log("\n✅ Account security tests passed.");
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
