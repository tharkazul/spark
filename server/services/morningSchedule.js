const db = require("./db");

/**
 * When each athlete gets the morning message.
 *
 * Every athlete has a latest time (users.morning_message_time, 08:30 unless they chose
 * another in Profile > Coach). It goes out earlier, from 07:00, as soon as their watch says
 * the night is over: Garmin sends the sleep with its end time when the watch syncs
 * (biometrics.sleep_end_at, garminIngest.js). Opening the app in the morning also sends it
 * straight away (POST /api/chat/checkin). Apple Health only syncs when the app is open, so
 * for those athletes it's the app opening or the latest time.
 *
 * All times are Amsterdam time, like the rest of the server's schedule.
 */

const DEFAULT_TIME = "08:30";
const EARLIEST_TIME = "06:30";
const LATEST_TIME = "11:00";
/** Before this, a watch wake-up doesn't send it (an athlete up at 05:00 still gets it at 07:00). */
const WAKE_UP_FROM = "07:00";
/** A sleep that ended longer ago than this isn't last night's (a day with only an old night). */
const WAKE_UP_MAX_AGE_SEC = 18 * 3600;

const toMinutes = (hm) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));

/** "08:30" for a valid choice (quarter hours between 06:30 and 11:00), null otherwise. */
function normalizeMorningTime(value) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? "").trim());
  if (!m) return null;
  const hm = `${m[1].padStart(2, "0")}:${m[2]}`;
  const mins = toMinutes(hm);
  if (Number(m[2]) % 15 !== 0 || mins < toMinutes(EARLIEST_TIME) || mins > toMinutes(LATEST_TIME)) return null;
  return hm;
}

/** The athlete's latest time, falling back to 08:30. */
const latestTimeFor = (stored) => normalizeMorningTime(stored) || DEFAULT_TIME;

/** From this time on the morning message may go out: 07:00, or earlier if the athlete chose earlier. */
const earliestTimeFor = (stored) => {
  const latest = latestTimeFor(stored);
  return toMinutes(latest) < toMinutes(WAKE_UP_FROM) ? latest : WAKE_UP_FROM;
};

/**
 * Whether the scheduled job should send now, and why.
 * nowHM is Amsterdam "HH:MM", nowSec Unix seconds, sleepEndAt Unix seconds or null.
 */
function morningMessageDue({ nowHM, nowSec, storedTime, sleepEndAt }) {
  const now = toMinutes(nowHM);
  if (now < toMinutes(earliestTimeFor(storedTime))) return { due: false, reason: "too_early" };
  if (now >= toMinutes(latestTimeFor(storedTime))) return { due: true, reason: "latest_time" };
  const end = Number(sleepEndAt);
  if (Number.isFinite(end) && end > 0 && end <= nowSec && nowSec - end <= WAKE_UP_MAX_AGE_SEC) {
    return { due: true, reason: "woke_up" };
  }
  return { due: false, reason: "asleep_or_unknown" };
}

const amsterdamParts = (date) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Amsterdam",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hm: `${parts.hour}:${parts.minute}` };
};

const dbAll = (sql, params) => new Promise((resolve, reject) => db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || []))));

/**
 * Athletes who may still get today's morning message: onboarded, AI allowed, and nothing
 * from the coach (after 04:00) or from them yet today, the same rule sendMorningMessageForUser uses.
 */
function candidates(day) {
  return dbAll(
    `SELECT u.id, u.morning_message_time, b.sleep_end_at
       FROM users u
       LEFT JOIN biometrics b ON b.user_id = u.id AND b.date = ?
      WHERE u.deleted_at IS NULL AND u.onboarding_completed = 1 AND u.ai_consent = 1
        AND NOT EXISTS (
          SELECT 1 FROM chat_history c
           WHERE c.user_id = u.id AND date(c.timestamp, 'localtime') = ?
             AND (c.role = 'user' OR (c.role = 'coach' AND time(c.timestamp, 'localtime') >= '04:00:00'))
        )`,
    [day, day],
  );
}

let running = false;

/**
 * The every-5-minutes job (server.js). Sends to everyone who is due; one at a time, because
 * each is an AI call. A run that's still busy makes the next one skip.
 */
async function sendDueMorningMessages({ now = new Date(), send } = {}) {
  if (running) return { skipped: true, reason: "previous run still busy" };
  running = true;
  const sendFor = send || require("./utils").sendMorningMessageForUser;
  const { day, hm } = amsterdamParts(now);
  const nowSec = Math.floor(now.getTime() / 1000);
  const sent = [];
  try {
    for (const row of await candidates(day)) {
      const { due, reason } = morningMessageDue({ nowHM: hm, nowSec, storedTime: row.morning_message_time, sleepEndAt: row.sleep_end_at });
      if (!due) continue;
      try {
        const result = await sendFor(row.id);
        if (result && result.success) {
          sent.push({ userId: row.id, reason });
          console.log(`🌞 Morning message sent to user ${row.id} (${reason === "woke_up" ? "watch says awake" : `latest time ${latestTimeFor(row.morning_message_time)}`})`);
        }
      } catch (e) {
        console.error(`Failed to send morning message to user ${row.id}:`, e);
      }
    }
  } finally {
    running = false;
  }
  return { sent };
}

module.exports = {
  DEFAULT_TIME,
  EARLIEST_TIME,
  LATEST_TIME,
  normalizeMorningTime,
  latestTimeFor,
  earliestTimeFor,
  morningMessageDue,
  sendDueMorningMessages,
  amsterdamParts,
};
