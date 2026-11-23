const db = require("./db");

/**
 * When an athlete moves, adds or removes a race close by, the rest of this week is planned
 * again. The Sunday job writes the week with the race on its day (and the taper around it),
 * so without this the old race day stayed in the calendar until next Sunday.
 *
 * Saving goals touches milestones in two requests (POST /api/milestones and the profile
 * update), and athletes often fiddle with a date. So the goals as they were before the first
 * save are remembered, and 30 seconds after the last save they're compared with what's
 * stored now. Moving a race and back changes nothing and plans nothing.
 *
 * Days up to and including today stay as they are; only the days after are replanned.
 */

const DELAY_MS = 30 * 1000;

const dbAll = (sql, params) => new Promise((resolve, reject) => db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || []))));

const isRace = (g) => (g.goal_type || "race") === "race" && /^\d{4}-\d{2}-\d{2}/.test(String(g.date || ""));
const day = (d) => String(d).slice(0, 10);

const addDays = (dateStr, n) => {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Amsterdam date, "YYYY-MM-DD". */
const amsterdamToday = (now = new Date()) => now.toLocaleDateString("en-CA", { timeZone: "Europe/Amsterdam" });

/** Sunday of the week (Mon-Sun) that holds dateStr. */
const sundayOf = (dateStr) => {
  const dow = new Date(`${dateStr}T12:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(dateStr, dow === 0 ? 0 : 7 - dow);
};

/**
 * What changed between two lists of goals, for races only: [{ name, from, to }], with from
 * or to null for a race that was added or removed. A race is the same race when its name is.
 */
function raceChanges(before, after) {
  const key = (g) => String(g.name || "").trim().toLowerCase();
  const was = new Map(before.filter(isRace).map((g) => [key(g), day(g.date)]));
  const now = new Map(after.filter(isRace).map((g) => [key(g), day(g.date)]));
  const names = new Map([...before, ...after].filter(isRace).map((g) => [key(g), String(g.name || "").trim()]));
  const changes = [];
  for (const [k, name] of names) {
    const from = was.get(k) || null;
    const to = now.get(k) || null;
    if (from !== to) changes.push({ name, from, to });
  }
  return changes;
}

/**
 * Whether a change touches this week's remaining days or next week (whose taper this week's
 * sessions lead into): any date after today and on or before next Sunday.
 */
function affectsThisWeek(changes, today) {
  const last = addDays(sundayOf(today), 7);
  return changes.some((c) => [c.from, c.to].some((d) => d && d > today && d <= last));
}

/** The line the planner gets, in the athlete's words. */
function describeChanges(changes) {
  return changes
    .map((c) =>
      c.from && c.to
        ? `my race "${c.name}" moved from ${c.from} to ${c.to}`
        : c.to
          ? `I added the race "${c.name}" on ${c.to}`
          : `I removed the race "${c.name}" on ${c.from}`,
    )
    .join("; ");
}

const FALLBACK_NOTES = {
  en: "I've re-planned the rest of your week around your new race date. Have a look at your calendar.",
  nl: "Ik heb de rest van je week opnieuw gepland rond je nieuwe wedstrijddatum. Kijk even in je agenda.",
  de: "Ich habe den Rest deiner Woche rund um dein neues Wettkampfdatum neu geplant. Schau mal in deinen Kalender.",
  es: "He vuelto a planificar el resto de tu semana en torno a la nueva fecha de tu carrera. Échale un vistazo a tu calendario.",
  fr: "J'ai replanifié le reste de ta semaine autour de la nouvelle date de ta course. Jette un œil à ton calendrier.",
};

/**
 * Plans the days after today again for the current week. Returns what the planner returned,
 * or { skipped } when nothing is left this week.
 */
async function replanRestOfWeek(userId, changes, { now = new Date() } = {}) {
  const workoutPlanning = require("./workoutPlanning");
  const today = amsterdamToday(now);
  const { dates } = workoutPlanning.getCurrentWeekMonToSun(now);
  if (today >= dates[6]) return { skipped: true, reason: "nothing left of this week; Sunday's job plans the next" };
  await require("./seasonPlan").ensureSeasonFresh(userId).catch((e) => console.warn(`[RaceMove] season refresh failed for ${userId}:`, e.message));
  const remaining = dates.filter((d) => d > today);
  const replanNote =
    `CHANGE SINCE THIS WEEK WAS PLANNED: ${changes.length ? describeChanges(changes) : "my race dates changed (the current dates are in my goals above)"}. ` +
    `The days up to and including today (${today}) are kept; output ONLY ${remaining.join(", ")}. ` +
    `Put the race on its new date, with the right sessions around it (openers and rest before, recovery after), and nothing race-like on the old date. ` +
    `Start your summary by saying in one sentence that you re-planned the rest of the week for the new race date.`;
  return workoutPlanning.generateWeeklyPlanForUser(userId, dates, {
    keepThrough: today,
    replanNote,
    fallbackNote: (lang) => FALLBACK_NOTES[lang] || FALLBACK_NOTES.en,
    notify: false,
    retryDelayMs: 5000,
  });
}

const pending = new Map(); // userId -> { baseline: goals before the first save, timer }
const running = new Set();

async function check(userId, baseline, { now = new Date() } = {}) {
  if (running.has(userId)) {
    // Still planning after an earlier change: look again when that's done.
    const timer = setTimeout(() => run(userId), DELAY_MS);
    timer.unref?.();
    pending.set(userId, { baseline, timer });
    return { skipped: true, reason: "replan already running" };
  }
  const current = await dbAll(`SELECT name, date, goal_type FROM milestones WHERE user_id = ?`, [userId]);
  const changes = raceChanges(baseline, current);
  if (!changes.length || !affectsThisWeek(changes, amsterdamToday(now))) return { skipped: true, reason: "no race change near this week" };
  running.add(userId);
  try {
    console.log(`[RaceMove] user ${userId}: ${describeChanges(changes)}; re-planning the rest of the week`);
    const result = await replanRestOfWeek(userId, changes, { now });
    if (result && result.skipped) console.warn(`[RaceMove] replan for user ${userId} skipped: ${result.reason}`);
    return result;
  } finally {
    running.delete(userId);
  }
}

function run(userId) {
  const entry = pending.get(userId);
  if (!entry) return;
  pending.delete(userId);
  check(userId, entry.baseline).catch((err) => console.error(`[RaceMove] replan for user ${userId} failed:`, err));
}

/**
 * Call (and await) right before a route rewrites the athlete's goals. The first call in a
 * burst remembers the goals as they are; every call pushes the check 30 seconds out.
 */
async function goalsAboutToChange(userId) {
  let entry = pending.get(userId);
  if (!entry) {
    const baseline = await dbAll(`SELECT name, date, goal_type FROM milestones WHERE user_id = ?`, [userId]).catch(() => null);
    if (!baseline) return;
    entry = pending.get(userId) || { baseline };
  }
  clearTimeout(entry.timer);
  entry.timer = setTimeout(() => run(userId), DELAY_MS);
  entry.timer.unref?.();
  pending.set(userId, entry);
}

module.exports = {
  goalsAboutToChange,
  replanRestOfWeek,
  // exported for tests
  raceChanges,
  affectsThisWeek,
  describeChanges,
  sundayOf,
  _check: check,
};
