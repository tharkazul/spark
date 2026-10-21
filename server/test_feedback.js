// Chat feedback: stored, emailed to rutger@rooka.io with attachments, validated.
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const express = require("express");

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rooka-feedback-"));
process.env.DB_PATH = path.join(tmpDir, "test.db");
process.env.SMTP_USER = "test@rooka.io";
process.env.SMTP_PASS = "x";

// Build real emails, but keep them in memory instead of sending.
const nodemailer = require("nodemailer");
const sent = [];
nodemailer.createTransport = () => ({
  sendMail: async (opts) => {
    sent.push(opts);
    return { messageId: "test" };
  },
});

const authPath = require.resolve("./services/auth");
require.cache[authPath] = {
  id: authPath,
  filename: authPath,
  loaded: true,
  exports: { authenticateToken: (req, res, next) => ((req.user = { id: 1 }), next()) },
};

const db = require("./services/db");
const dbAll = (sql, params = []) => new Promise((resolve, reject) => db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows))));

console.log("💬 Running feedback tests...\n");

(async () => {
  // Let db.js finish creating its tables.
  await new Promise((resolve) => db.serialize(resolve));
  await new Promise((resolve, reject) =>
    db.run(`INSERT INTO users (id, username, email, language) VALUES (1, 'sanne', 'sanne@example.com', 'nl')`, (err) => (err ? reject(err) : resolve())),
  );

  const app = express();
  app.use(express.json({ limit: "50mb" }));
  app.use("/", require("./routes/feedback"));
  const server = app.listen(0);
  const post = (body) =>
    fetch(`http://127.0.0.1:${server.address().port}/api/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(async (r) => ({ status: r.status, body: await r.json() }));

  const png = "data:image/png;base64," + Buffer.from("fake-png").toString("base64");
  const ok = await post({ message: "Feedback: the <b>plan</b> tab is slow", imagesBase64: [png], platform: "ios", osVersion: "19.0", appVersion: "1.1.0" });
  assert.strictEqual(ok.status, 200);
  assert.strictEqual(sent.length, 1, "one email sent");
  const mail = sent[0];
  assert.strictEqual(mail.to, "rutger@rooka.io");
  assert.strictEqual(mail.replyTo, "sanne@example.com", "reply goes to the athlete");
  assert.ok(mail.subject.includes("sanne"));
  assert.ok(mail.html.includes("&lt;b&gt;plan&lt;/b&gt;"), "message is escaped in HTML");
  assert.ok(mail.text.includes("ios · OS 19.0 · v1.1.0"));
  assert.strictEqual(mail.attachments.length, 1);
  assert.strictEqual(fs.readFileSync(mail.attachments[0].path, "utf8"), "fake-png", "attachment is the uploaded image");
  const [row] = await dbAll(`SELECT * FROM feedback`);
  assert.strictEqual(row.emailed, 1);
  assert.strictEqual(JSON.parse(row.image_paths).length, 1);
  console.log("✅ Feedback is stored and emailed with its image");

  assert.strictEqual((await post({ message: "  " })).status, 400);
  assert.strictEqual((await post({ message: "hi", imagesBase64: ["data:text/html;base64,PGI+"] })).status, 400);
  assert.strictEqual((await post({ message: "hi", imagesBase64: Array(6).fill(png) })).status, 400);
  assert.strictEqual(sent.length, 1, "nothing emailed for rejected feedback");
  console.log("✅ Empty feedback, non-images and too many images are refused");

  nodemailer.createTransport = () => ({ sendMail: async () => { throw new Error("SMTP down"); } });
  const down = await post({ message: "feedback while SMTP is down" });
  assert.strictEqual(down.status, 200, "athlete still gets a thank-you");
  const rows = await dbAll(`SELECT emailed FROM feedback ORDER BY id`);
  assert.deepStrictEqual(rows.map((r) => r.emailed), [1, 0], "kept, marked as not emailed");
  console.log("✅ Feedback is kept when the email fails");

  server.close();
  for (const a of mail.attachments) fs.rmSync(a.path, { force: true });
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log("\n🎉 All feedback tests passed!");
  process.exit(0);
})().catch((e) => {
  console.error("❌", e);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  process.exit(1);
});
