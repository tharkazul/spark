// Per-user limits: counted per account, not per IP, and independent per athlete.
const assert = require("assert");
const express = require("express");
const { userLimits } = require("./services/rateLimit");

console.log("🚦 Running per-user rate limit tests...\n");

(async () => {
  const app = express();
  app.set("trust proxy", "loopback");
  app.use((req, res, next) => {
    req.user = { id: Number(req.headers["x-test-user"]) };
    next();
  });
  app.get("/heavy", userLimits.heavyRead, (req, res) => res.json({ ok: true }));
  const server = app.listen(0);
  const url = `http://127.0.0.1:${server.address().port}/heavy`;
  const hit = (user) => fetch(url, { headers: { "x-test-user": String(user) } }).then((r) => r.status);

  const first = [];
  for (let i = 0; i < 60; i++) first.push(await hit(1));
  assert.ok(first.every((s) => s === 200), "60 requests a minute are fine");
  assert.strictEqual(await hit(1), 429, "the 61st within the minute is refused");
  assert.strictEqual(await hit(2), 200, "another athlete on the same IP is not affected");
  console.log("✅ Heavy reads are limited per athlete, not per IP");

  server.close();
  console.log("\n🎉 All rate limit tests passed!");
  process.exit(0);
})().catch((e) => {
  console.error("❌", e);
  process.exit(1);
});
