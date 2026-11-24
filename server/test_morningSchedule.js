// Morning message timing: from 07:00 once the watch says the athlete is up, otherwise at their
// own latest time (08:30 by default, 06:30-11:00 allowed), never twice, never without AI consent.
// Uses a throwaway database. That a Garmin sleep push stores the end of the night is in test_garmin_ingest.js.
const path = require("path");
const os = require("os");
process.env.TZ = "UTC"; // like the server: nothing may lean on SQLite's 'localtime' being Amsterdam
process.env.DB_PATH = path.join(os.tmpdir(), `rooka_morning_test_${process.pid}.db`);

const assert = require("assert");
const db = require("./services/db");
const ms = require("./services/morningSchedule");

const dbRun = (q, p = []) => new Promise((resolve, reject) => db.run(q, p, (err) => (err ? reject(err) : resolve())));
const ok = (label) => console.log(`✅ ${label}`);

// 23 November 2026 is winter time: Amsterdam = UTC+1.
const at = (hm) => new Date(`2026-11-23T${hm}:00+01:00`);
const sec = (hm) => Math.floor(at(hm).getTime() / 1000);

(async () => {
  await new Promise((r) => setTimeout(r, 300)); // let db.js finish its migrations

  // --- The setting -------------------------------------------------------------
  assert.strictEqual(ms.normalizeMorningTime("8:30"), "08:30");
  assert.strictEqual(ms.normalizeMorningTime("06:30"), "06:30");
  assert.strictEqual(ms.normalizeMorningTime("11:00"), "11:00");
  assert.strictEqual(ms.normalizeMorningTime("06:15"), null, "before 06:30");
  assert.strictEqual(ms.normalizeMorningTime("11:15"), null, "after 11:00");
  assert.strictEqual(ms.normalizeMorningTime("08:20"), null, "not a quarter hour");
  assert.strictEqual(ms.normalizeMorningTime("late"), null);
  assert.strictEqual(ms.latestTimeFor(null), "08:30");
  assert.strictEqual(ms.earliestTimeFor("08:30"), "07:00");
  assert.strictEqual(ms.earliestTimeFor("06:45"), "06:45", "an earlier choice moves the start earlier");
  ok("Quarter hours from 06:30 to 11:00, 08:30 when unset");

  // --- When it's due ---------------------------------------------------------------
  const due = (hm, storedTime, sleepEndAt) => ms.morningMessageDue({ nowHM: hm, nowSec: sec(hm), storedTime, sleepEndAt });
  assert.deepStrictEqual(due("07:40", null, sec("07:10")), { due: true, reason: "woke_up" });
  assert.deepStrictEqual(due("07:40", null, null), { due: false, reason: "asleep_or_unknown" });
  assert.deepStrictEqual(due("08:30", null, null), { due: true, reason: "latest_time" });
  assert.deepStrictEqual(due("06:50", null, sec("05:30")), { due: false, reason: "too_early" }, "up at 05:30: waits for 07:00");
  assert.deepStrictEqual(due("07:00", null, sec("05:30")), { due: true, reason: "woke_up" });
  assert.deepStrictEqual(due("09:00", "10:00", null), { due: false, reason: "asleep_or_unknown" }, "chose 10:00");
  assert.deepStrictEqual(due("09:00", "10:00", sec("08:50")), { due: true, reason: "woke_up" });
  assert.deepStrictEqual(due("06:30", "06:30", null), { due: true, reason: "latest_time" });
  assert.deepStrictEqual(due("07:40", null, sec("07:10") - 20 * 3600), { due: false, reason: "asleep_or_unknown" }, "an old night doesn't count");
  assert.deepStrictEqual(due("07:40", null, sec("08:10")), { due: false, reason: "asleep_or_unknown" }, "an end in the future doesn't count");
  ok("Watch wake-up from 07:00, otherwise the latest time");

  // 04:00 Amsterdam in the UTC the chat is stored in, summer and winter.
  assert.strictEqual(ms.morningStartUtc("2026-11-23"), "2026-11-23 03:00:00");
  assert.strictEqual(ms.morningStartUtc("2026-07-01"), "2026-07-01 02:00:00");
  ok("The coach day starts at 04:00 Amsterdam time");

  // --- The job ---------------------------------------------------------------------
  const users = [
    // id, morning time, ai consent, sleep end
    [1, null, 1, sec("07:10")], // Garmin, up at 07:10
    [2, null, 1, null], // no watch data
    [3, "10:00", 1, sec("07:20")], // late choice but already up
    [4, null, 1, sec("07:05")], // already had a coach message
    [5, null, 0, sec("07:05")], // AI not allowed
    [6, "06:30", 1, null], // early bird without a watch
    [7, null, 1, null], // Apple Watch, got a friend's Spark at 07:26
  ];
  for (const [id, time, consent] of users) {
    await dbRun(
      `INSERT INTO users (id, username, email, onboarding_completed, ai_consent, morning_message_time) VALUES (?, ?, ?, 1, ?, ?)`,
      [id, `u${id}`, `u${id}@example.test`, consent, time || "08:30"],
    );
  }
  for (const [id, , , end] of users) {
    if (end) await dbRun(`INSERT INTO biometrics (user_id, date, sleep_minutes, sleep_end_at, from_garmin) VALUES (?, '2026-11-23', 420, ?, 1)`, [id, end]);
  }
  // Stored in UTC like CURRENT_TIMESTAMP: 06:15 UTC is 07:15 in Amsterdam.
  const MORNING = JSON.stringify({ type: "morning_message" });
  await dbRun(`INSERT INTO chat_history (user_id, role, content, payload_json, timestamp) VALUES (4, 'coach', 'Good morning', ?, '2026-11-23 06:15:00')`, [MORNING]);
  // A Spark's coach note is not the morning message (Quinten, 24 Nov 2026), and last night's chat doesn't count.
  await dbRun(`INSERT INTO chat_history (user_id, role, content, mood, timestamp) VALUES (7, 'coach', 'Rutger saw your session', 'hype', '2026-11-23 06:26:00')`);
  await dbRun(`INSERT INTO chat_history (user_id, role, content, timestamp) VALUES (7, 'user', 'night', '2026-11-22 23:30:00')`);

  const sentTo = [];
  const send = async (userId) => {
    sentTo.push(userId);
    await dbRun(`INSERT INTO chat_history (user_id, role, content, payload_json, timestamp) VALUES (?, 'coach', 'Good morning', ?, ?)`, [
      userId,
      MORNING,
      "2026-11-23 06:45:00",
    ]);
    return { success: true };
  };

  let r = await ms.sendDueMorningMessages({ now: at("06:45"), send });
  assert.deepStrictEqual(r.sent, [{ userId: 6, reason: "latest_time" }]);
  r = await ms.sendDueMorningMessages({ now: at("07:40"), send });
  assert.deepStrictEqual(r.sent.map((x) => [x.userId, x.reason]), [[1, "woke_up"], [3, "woke_up"]]);
  r = await ms.sendDueMorningMessages({ now: at("08:00"), send });
  assert.deepStrictEqual(r.sent, [], "nobody new: user 2 sleeps on, the rest already have it");
  r = await ms.sendDueMorningMessages({ now: at("08:30"), send });
  assert.deepStrictEqual(r.sent.map((x) => x.userId), [2, 7], "a Spark earlier this morning doesn't cancel it");
  r = await ms.sendDueMorningMessages({ now: at("09:00"), send });
  assert.deepStrictEqual(r.sent, []);
  assert.deepStrictEqual(sentTo, [6, 1, 3, 2, 7], "each athlete once; not the one who already had a message, not without AI consent");
  ok("The job sends each athlete once, at the right moment");

  console.log("All morning schedule checks passed.");
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
