/**
 * Ball and racket sports: the athlete's own club sessions and matches (hockey, football,
 * tennis, padel, ...). rooka doesn't prescribe them, the game sets the intensity, and plans
 * only know Run, Bike, Swim and Strength, so they're planned (and usually recorded) as a run.
 *
 * Tester feedback, 26 Nov 2026: a football match was planned as "Rustdag en voetbal" (a rest
 * day) and the post-workout review called matches and tennis training too hard.
 *
 * Same patterns as the app's detectSubSport (src/utils/disciplineConfig.ts); keep them in step.
 */

// Order matters: padel before tennis ("paddle tennis"), tennis before volleyball ("volley drills").
const PATTERNS = [
  ["padel", /padel|pádel|pickleball|paddle ?tennis/],
  ["tennis", /tennis|ténis|tênis|tenis|squash|badminton/],
  ["hockey", /hockey|hóquei/],
  ["football", /soccer|football|voetbal|futebol|fu(ss|ß)ball|futsal|f[uú]tbol/],
  ["basketball", /basket|basquet/],
  ["volleyball", /volley|v[oó]lei|voleibol/],
  ["golf", /\bgolf/],
  ["rugby", /rugby|r[uú]gbi/],
];
const TABLE_TENNIS = /table ?tennis|tafeltennis|tischtennis|ping ?pong|t[eéê]nis de mesa/;

/** The club sport a text names ("Voetbalwedstrijd" -> "football"), or null. */
function detectClubSport(text) {
  const s = String(text || "").toLowerCase();
  if (!s || TABLE_TENNIS.test(s)) return null;
  for (const [sport, re] of PATTERNS) if (re.test(s)) return sport;
  return null;
}

/** The club sport a plan entry stands for, from its title or details. */
function planClubSport(entry) {
  if (!entry) return null;
  return detectClubSport(entry.description) || detectClubSport(entry.details);
}

/**
 * The sport to store for a plan entry. A "rest day and football" entry is a match day, not a
 * rest day: it's stored as a run (what the watch records) so the app shows the match and the
 * synced activity finds it. Everything else keeps its sport.
 */
function planEntrySport(sport, description) {
  if (String(sport || "").toLowerCase() === "rest" && detectClubSport(description)) return "Run";
  return sport;
}

function sportMatches(planSport, activitySport) {
  const p = String(planSport || "").toLowerCase();
  const a = String(activitySport || "").toLowerCase();
  return Boolean(p && a) && (p === a || p.includes(a.slice(0, 5)));
}

/**
 * The plan entry a finished activity belongs to, and whether it was a club session.
 * - An activity that names a club sport ("Tennis", "Voetbal Heren 3") belongs to the entry
 *   for that sport, whatever sport the entry has (Run, or Rest from older plans).
 * - Otherwise the entry with the same sport, preferring a rooka session over a club session
 *   when the day has both; a run on a day with only the club session is that session.
 * @returns {{ plan: object|null, clubSport: string|null }}
 */
function pickPlanForActivity(entries, { rookaSport, rawSport, name }) {
  const rows = Array.isArray(entries) ? entries : [];
  const fromActivity = detectClubSport(rawSport) || detectClubSport(name);
  if (fromActivity) {
    const plan = rows.find((r) => planClubSport(r) === fromActivity) || null;
    return { plan, clubSport: fromActivity };
  }
  const sameSport = rows.filter((r) => String(r.sport || "").toLowerCase() !== "rest" && sportMatches(r.sport, rookaSport));
  const plan = sameSport.find((r) => !planClubSport(r)) || sameSport[0] || null;
  return { plan, clubSport: plan ? planClubSport(plan) : null };
}

module.exports = { detectClubSport, planClubSport, planEntrySport, pickPlanForActivity };
