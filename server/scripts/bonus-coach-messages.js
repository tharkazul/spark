#!/usr/bin/env node
/**
 * bonus-coach-messages.js
 *
 * Gives one free athlete extra coach messages for the rest of today (Amsterdam time) and tells
 * them so in their coach chat, with a gentle pointer to rooka+, plus a push that opens it.
 * At midnight the budget goes back to normal by itself. No AI involved.
 *
 * Usage (from server/):
 *   node scripts/bonus-coach-messages.js --user 37            # dry run: shows what would happen
 *   node scripts/bonus-coach-messages.js --user 37 --send     # gives the messages and sends the note
 *
 * Once per athlete per day: a second run finds today's note and stops.
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), quiet: true });
const db = require("../services/db");
const { sendPushToUser } = require("../services/pushNotificationService");
const { getAMSDateString, getEffectiveTokenLimit } = require("../services/utils");
const i18n = require("../services/i18n");

const BONUS_TOKENS = 50000;
const args = process.argv.slice(2);
const send = args.includes("--send");
const userArg = args[args.indexOf("--user") + 1];

const UPGRADE = "rooka://profile?subtab=account";
const TEXT = {
  en: (name) => ({
    chat: `Hi ${name}! I saw you've been busy getting your training into the calendar today 💪 I've unlocked extra coach messages for you for the rest of today, so keep them coming.\n\nIf rooka works for you: with rooka+ you get many more coach messages every day. [See rooka+](${UPGRADE})`,
    title: "Extra coach messages today 🎁",
    body: "I've unlocked extra coach messages for you for the rest of today.",
  }),
  es: (name) => ({
    chat: `¡Hola ${name}! He visto que hoy has estado a tope metiendo tus entrenamientos en el calendario 💪 Te he desbloqueado mensajes extra con el coach para el resto del día, así que sigue preguntándome lo que necesites.\n\nSi rooka te convence: con rooka+ tienes muchos más mensajes con el coach cada día. [Ver rooka+](${UPGRADE})`,
    title: "Mensajes extra con tu coach hoy 🎁",
    body: "Te he desbloqueado mensajes extra con el coach para el resto del día.",
  }),
  nl: (name) => ({
    chat: `Hoi ${name}! Ik zag dat je vandaag flink bezig was om je trainingen in de kalender te krijgen 💪 Ik heb voor de rest van vandaag extra coachberichten voor je vrijgemaakt, dus vraag maar raak.\n\nBevalt rooka je? Met rooka+ heb je elke dag veel meer coachberichten. [Bekijk rooka+](${UPGRADE})`,
    title: "Extra coachberichten vandaag 🎁",
    body: "Ik heb voor de rest van vandaag extra coachberichten voor je vrijgemaakt.",
  }),
  de: (name) => ({
    chat: `Hallo ${name}! Ich habe gesehen, dass du heute fleißig deine Trainings in den Kalender gebracht hast 💪 Ich habe dir für den Rest des Tages zusätzliche Coach-Nachrichten freigeschaltet, also frag ruhig weiter.\n\nWenn dir rooka gefällt: Mit rooka+ hast du jeden Tag viel mehr Coach-Nachrichten. [rooka+ ansehen](${UPGRADE})`,
    title: "Heute zusätzliche Coach-Nachrichten 🎁",
    body: "Ich habe dir für den Rest des Tages zusätzliche Coach-Nachrichten freigeschaltet.",
  }),
  fr: (name) => ({
    chat: `Salut ${name} ! J'ai vu que tu as bien bossé aujourd'hui pour mettre tes entraînements dans le calendrier 💪 Je t'ai débloqué des messages en plus avec le coach pour le reste de la journée, alors continue.\n\nSi rooka te plaît : avec rooka+, tu as beaucoup plus de messages avec le coach chaque jour. [Voir rooka+](${UPGRADE})`,
    title: "Des messages en plus avec ton coach aujourd'hui 🎁",
    body: "Je t'ai débloqué des messages en plus pour le reste de la journée.",
  }),
  pt: (name) => ({
    chat: `Olá ${name}! Vi que hoje estiveste a todo o gás a pôr os teus treinos no calendário 💪 Desbloqueei-te mensagens extra com o coach para o resto do dia, por isso continua a perguntar.\n\nSe gostares do rooka: com o rooka+ tens muito mais mensagens com o coach todos os dias. [Ver rooka+](${UPGRADE})`,
    title: "Mensagens extra com o teu coach hoje 🎁",
    body: "Desbloqueei-te mensagens extra com o coach para o resto do dia.",
  }),
};

const get = (sql, p) => new Promise((resolve, reject) => db.get(sql, p, (e, r) => (e ? reject(e) : resolve(r))));
const run = (sql, p) => new Promise((resolve, reject) => db.run(sql, p, (e) => (e ? reject(e) : resolve())));

(async () => {
  if (!userArg || userArg.startsWith("--")) {
    console.log("Usage: node scripts/bonus-coach-messages.js --user <id or username> [--send]");
    process.exit(1);
  }
  await new Promise((r) => setTimeout(r, 300)); // let db.js finish opening

  const cols = `id, username, language, subscription_tier, daily_token_usage, daily_token_limit, last_token_reset_date, rooka_start_date, created_at, deleted_at`;
  const user = /^\d+$/.test(userArg)
    ? await get(`SELECT ${cols} FROM users WHERE id = ?`, [Number(userArg)])
    : await get(`SELECT ${cols} FROM users WHERE username = ?`, [userArg]);
  if (!user || user.deleted_at) {
    console.log(`No active athlete found for "${userArg}".`);
    process.exit(1);
  }

  const today = getAMSDateString();
  const marker = JSON.stringify({ type: "bonus_messages", date: today });
  const already = await get(`SELECT id FROM chat_history WHERE user_id = ? AND role = 'coach' AND payload_json = ?`, [user.id, marker]);
  const usedToday = user.last_token_reset_date === today ? user.daily_token_usage || 0 : 0;
  const limitNow = getEffectiveTokenLimit(user);
  // Exactly 5000 or 50000 on a free account reads as an old default and is ignored (getEffectiveTokenLimit).
  const newLimit = usedToday + BONUS_TOKENS + (usedToday === 0 ? 1 : 0);
  const lang = i18n.normalizeLang(user.language);
  const firstName = String(user.username || "").trim().split(/\s+/)[0] || "";
  const text = (TEXT[lang] || TEXT.en)(firstName);

  console.log(`Athlete: #${user.id} ${user.username} (${user.subscription_tier || "free"}, language ${lang})`);
  console.log(`Today: used ${usedToday} of ${limitNow}. After this: ${newLimit} for the rest of today (${BONUS_TOKENS} more).`);
  if (already) {
    console.log(`Already done today (chat message #${already.id}). Nothing changed.`);
    process.exit(0);
  }
  if (user.subscription_tier && user.subscription_tier !== "free") console.log("Note: this athlete isn't on the free tier.");
  console.log(`\nCoach chat:\n${text.chat}\n\nPush: ${text.title} / ${text.body}\n`);

  if (!send) {
    console.log("Dry run: nothing changed. Add --send to do it.");
    process.exit(0);
  }

  // last_token_reset_date = today, so the chat doesn't reset the new limit on the next message.
  // The midnight reset puts the athlete back on their tier's budget.
  await run(
    `UPDATE users SET daily_token_limit = ?, daily_token_usage = ?, last_token_reset_date = ? WHERE id = ?`,
    [newLimit, usedToday, today, user.id],
  );
  await run(`INSERT INTO chat_history (user_id, role, content, mood, payload_json) VALUES (?, 'coach', ?, 'hype', ?)`, [
    user.id,
    text.chat,
    marker,
  ]);
  const push = await sendPushToUser(user.id, { title: text.title, body: text.body, data: { url: "/(tabs)/coach", type: "coach" } });
  console.log(`✅ ${BONUS_TOKENS} extra for today, coach note saved. Push: ${push ? "sent" : "no push devices, the note waits in the chat"}.`);
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
