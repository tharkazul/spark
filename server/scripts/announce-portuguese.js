#!/usr/bin/env node
/**
 * announce-portuguese.js
 *
 * Tells one athlete that rooka is now in European Portuguese: a note in their coach chat
 * (English and Portuguese) and a push notification that opens it. No AI involved.
 * Run it only after the server deploy and the OTA with Portuguese are live.
 *
 * Usage (from server/):
 *   node scripts/announce-portuguese.js --user 42            # dry run: shows what would be sent
 *   node scripts/announce-portuguese.js --user "username"    # by username works too
 *   node scripts/announce-portuguese.js --user 42 --send     # sends it
 *
 * Sends once per athlete: a second run finds the earlier note and stops.
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), quiet: true });
const db = require("../services/db");
const { sendPushToUser } = require("../services/pushNotificationService");

const args = process.argv.slice(2);
const send = args.includes("--send");
const userArg = args[args.indexOf("--user") + 1];
const MARKER = { type: "language_announcement", lang: "pt" };

const CHAT = [
  "Good news: rooka now speaks Portuguese (Português de Portugal). You can switch under Profile → App & Coach Language, and I'll talk to you in Portuguese too.",
  "",
  "Novidade: o rooka já fala português de Portugal. Podes mudar em Perfil → Idioma da app e do coach, e eu passo também a falar contigo em português. 🇵🇹",
].join("\n");
const PUSH_TITLE = "rooka now speaks Portuguese 🇵🇹";
const PUSH_BODY = "O rooka já fala português de Portugal. Toca para ver como mudar.";

const get = (sql, p) => new Promise((resolve, reject) => db.get(sql, p, (e, r) => (e ? reject(e) : resolve(r))));
const run = (sql, p) => new Promise((resolve, reject) => db.run(sql, p, (e) => (e ? reject(e) : resolve())));

(async () => {
  if (!userArg || userArg.startsWith("--")) {
    console.log('Usage: node scripts/announce-portuguese.js --user <id or username> [--send]');
    process.exit(1);
  }
  await new Promise((r) => setTimeout(r, 300)); // let db.js finish opening

  const user = /^\d+$/.test(userArg)
    ? await get(`SELECT id, username, language, deleted_at FROM users WHERE id = ?`, [Number(userArg)])
    : await get(`SELECT id, username, language, deleted_at FROM users WHERE username = ?`, [userArg]);
  if (!user || user.deleted_at) {
    console.log(`No active athlete found for "${userArg}".`);
    process.exit(1);
  }
  const already = await get(
    `SELECT id, timestamp FROM chat_history WHERE user_id = ? AND role = 'coach' AND payload_json = ?`,
    [user.id, JSON.stringify(MARKER)],
  );
  const tokens = await get(`SELECT COUNT(*) AS n FROM push_tokens WHERE user_id = ?`, [user.id]);

  console.log(`Athlete: #${user.id} ${user.username} (app language now: ${user.language || "en"})`);
  console.log(`Push devices: ${tokens ? tokens.n : 0}`);
  if (already) {
    console.log(`Already announced on ${already.timestamp} (chat message #${already.id}). Nothing sent.`);
    process.exit(0);
  }
  if (user.language === "pt") console.log("Note: this athlete already uses Portuguese.");
  console.log(`\nCoach chat:\n${CHAT}\n\nPush: ${PUSH_TITLE} / ${PUSH_BODY}\n`);

  if (!send) {
    console.log("Dry run: nothing sent. Add --send to send it.");
    process.exit(0);
  }

  await run(`INSERT INTO chat_history (user_id, role, content, mood, payload_json) VALUES (?, 'coach', ?, 'hype', ?)`, [
    user.id,
    CHAT,
    JSON.stringify(MARKER),
  ]);
  const push = await sendPushToUser(user.id, {
    title: PUSH_TITLE,
    body: PUSH_BODY,
    data: { url: "/(tabs)/coach", type: "coach" },
  });
  console.log(`✅ Coach note saved. Push: ${push ? "sent" : "no push devices, the note waits in the chat"}.`);
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
