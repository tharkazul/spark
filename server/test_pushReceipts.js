// Push token self-cleaning: Expo tickets are kept, receipts are read 15 minutes
// later, and tokens reported as DeviceNotRegistered are deleted. Uses a throwaway
// database and a stubbed fetch, so nothing reaches Expo or real data.
const path = require("path");
const os = require("os");
process.env.DB_PATH = path.join(os.tmpdir(), `rooka_push_test_${process.pid}.db`);

const assert = require("assert");
const db = require("./services/db");
const push = require("./services/pushNotificationService");

const dbRun = (q, p = []) => new Promise((resolve, reject) => db.run(q, p, (err) => (err ? reject(err) : resolve())));
const dbAll = (q, p = []) => new Promise((resolve, reject) => db.all(q, p, (err, rows) => (err ? reject(err) : resolve(rows))));
const tokensOf = async (userId) => (await dbAll(`SELECT token FROM push_tokens WHERE user_id = ? ORDER BY token`, [userId])).map((r) => r.token);
const pending = async () => (await dbAll(`SELECT ticket_id, token FROM push_receipts_pending ORDER BY ticket_id`)).map((r) => r.ticket_id);

const tok = (name) => `ExponentPushToken[${name}]`;

// Stubbed Expo API: /send answers with `nextTickets`, /getReceipts with `nextReceipts`.
let nextTickets = [];
let nextReceipts = {};
let receiptsFail = false;
const calls = [];
global.fetch = async (url, opts) => {
  const body = JSON.parse(opts.body);
  calls.push({ url, body });
  if (url.endsWith("/push/send")) return { ok: true, json: async () => ({ data: nextTickets }) };
  if (url.endsWith("/push/getReceipts")) {
    if (receiptsFail) return { ok: false, status: 503, json: async () => ({}) };
    const data = {};
    for (const id of body.ids) if (nextReceipts[id]) data[id] = nextReceipts[id];
    return { ok: true, json: async () => ({ data }) };
  }
  throw new Error(`unexpected fetch ${url}`);
};

(async () => {
  console.log("📲 Running push receipt tests...\n");
  // Wait for db.js to finish creating its tables.
  for (let i = 0; i < 50; i++) {
    try { await dbAll(`SELECT 1 FROM push_receipts_pending`); break; } catch (_) { await new Promise((r) => setTimeout(r, 50)); }
  }
  await dbRun(`INSERT INTO users (id, username, password_hash) VALUES (1, 'athlete', 'x'), (2, 'other', 'x')`);
  for (const t of ["a", "b", "c"]) await dbRun(`INSERT INTO push_tokens (user_id, token) VALUES (1, ?)`, [tok(t)]);
  await dbRun(`INSERT INTO push_tokens (user_id, token) VALUES (2, ?)`, [tok("z")]);

  // 1. A ticket that is already DeviceNotRegistered deletes its token straight away; ok tickets are kept.
  nextTickets = [
    { status: "ok", id: "t-a" },
    { status: "ok", id: "t-b" },
    { status: "error", message: "not registered", details: { error: "DeviceNotRegistered", expoPushToken: tok("c") } },
  ];
  const sentAt = Date.now();
  await push.sendPushToUser(1, { title: "Hi", body: "Test" });
  assert.deepStrictEqual(await tokensOf(1), [tok("a"), tok("b")], "token c is gone after its error ticket");
  assert.deepStrictEqual(await pending(), ["t-a", "t-b"], "ok tickets wait for their receipt");
  console.log("✅ Error ticket removes its token, ok tickets are stored");

  // 2. Receipts are not asked for before 15 minutes have passed.
  calls.length = 0;
  let res = await push.processPushReceipts({ now: sentAt + 5 * 60 * 1000 });
  assert.strictEqual(calls.length, 0, "no getReceipts call for young tickets");
  assert.deepStrictEqual(await pending(), ["t-a", "t-b"]);
  console.log("✅ Young tickets are left alone");

  // 3. Expo down: tickets are kept for the next run.
  receiptsFail = true;
  await push.processPushReceipts({ now: sentAt + push.RECEIPT_DELAY_MS + 1000 });
  assert.deepStrictEqual(await pending(), ["t-a", "t-b"], "tickets survive a failed receipt request");
  receiptsFail = false;
  console.log("✅ A failed receipt request keeps the tickets");

  // 4. Receipt not ready yet: kept. Then: b is DeviceNotRegistered, a delivered.
  nextReceipts = { "t-a": { status: "ok" } };
  res = await push.processPushReceipts({ now: sentAt + push.RECEIPT_DELAY_MS + 1000 });
  assert.deepStrictEqual(await pending(), ["t-b"], "a missing receipt stays pending");
  nextReceipts = { "t-b": { status: "error", message: "gone", details: { error: "DeviceNotRegistered" } } };
  res = await push.processPushReceipts({ now: sentAt + push.RECEIPT_DELAY_MS + 60 * 1000 });
  assert.deepStrictEqual(res, { checked: 1, removed: 1, expired: 0 });
  assert.deepStrictEqual(await tokensOf(1), [tok("a")], "token b removed after its DeviceNotRegistered receipt");
  assert.deepStrictEqual(await tokensOf(2), [tok("z")], "other athletes' tokens are untouched");
  assert.deepStrictEqual(await pending(), [], "processed tickets are cleared");
  console.log("✅ DeviceNotRegistered receipt removes the token");

  // 5. Other receipt errors (rate limit, credentials) never delete a token.
  nextTickets = [{ status: "ok", id: "t-a2" }];
  await push.sendPushToUser(1, { title: "Hi", body: "Again" });
  nextReceipts = { "t-a2": { status: "error", message: "slow down", details: { error: "MessageRateExceeded" } } };
  await push.processPushReceipts({ now: Date.now() + push.RECEIPT_DELAY_MS + 1000 });
  assert.deepStrictEqual(await tokensOf(1), [tok("a")], "a rate-limit error keeps the token");
  assert.deepStrictEqual(await pending(), []);
  console.log("✅ Other receipt errors keep the token");

  // 6. A ticket Expo never answers is dropped after 24 hours.
  nextTickets = [{ status: "ok", id: "t-lost" }];
  await push.sendPushToUser(1, { title: "Hi", body: "Lost" });
  nextReceipts = {};
  res = await push.processPushReceipts({ now: Date.now() + 25 * 60 * 60 * 1000 });
  assert.strictEqual(res.expired, 1);
  assert.deepStrictEqual(await pending(), []);
  assert.deepStrictEqual(await tokensOf(1), [tok("a")], "expiry never deletes the token");
  console.log("✅ Unanswered tickets expire after 24 hours");

  console.log("\n🎉 All push receipt tests passed!");
  setTimeout(() => {
    try { require("fs").unlinkSync(process.env.DB_PATH); } catch (_) {}
    process.exit(0);
  }, 200);
})().catch((e) => {
  console.error("❌", e);
  try { require("fs").unlinkSync(process.env.DB_PATH); } catch (_) {}
  process.exit(1);
});
