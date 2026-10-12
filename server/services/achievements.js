/**
 * Achievements: recognition for what the athlete did since joining rooka. They replace the
 * weekly quests, which asked for extra sessions the plan hadn't planned. Nothing
 * here ever suggests a session; it only looks back at logged activities.
 *
 * Earned dates are derived from the activity history every time, so there is no
 * state to drift; the app keeps track of which ones the athlete has already seen.
 */
const db = require("./db");
const { dedupeActivities } = require("./seasonPlan");

const dbAll = (sql, params = []) => new Promise((resolve) => db.all(sql, params, (err, rows) => resolve(err || !rows ? [] : rows)));

const RUN_TYPES = new Set(["run", "virtualrun", "trailrun", "treadmill"]);
const RIDE_TYPES = new Set(["ride", "virtualride", "bike", "ebikeride", "gravelride", "mountainbikeride", "cycling"]);
const SWIM_TYPES = new Set(["swim", "openwaterswim", "poolswim"]);
const sportKey = (t) => String(t || "").toLowerCase().replace(/\s+/g, "");
const isRun = (a) => RUN_TYPES.has(sportKey(a.sport_type));
const isRide = (a) => RIDE_TYPES.has(sportKey(a.sport_type));
const isSwim = (a) => SWIM_TYPES.has(sportKey(a.sport_type));

// Order is the display order. `group` lets the app show them in sections.
const CATALOGUE = [
  { id: "first_session", group: "milestones", icon: "flag", test: (a) => true },
  { id: "run_5k", group: "run", icon: "run", test: (a) => isRun(a) && a.distance_km >= 5 },
  { id: "run_10k", group: "run", icon: "run", test: (a) => isRun(a) && a.distance_km >= 10 },
  { id: "run_half", group: "run", icon: "run", test: (a) => isRun(a) && a.distance_km >= 21.0975 },
  { id: "run_30k", group: "run", icon: "run", test: (a) => isRun(a) && a.distance_km >= 30 },
  { id: "run_marathon", group: "run", icon: "medal", test: (a) => isRun(a) && a.distance_km >= 42.195 },
  { id: "ride_50k", group: "ride", icon: "bike", test: (a) => isRide(a) && a.distance_km >= 50 },
  { id: "ride_100k", group: "ride", icon: "bike", test: (a) => isRide(a) && a.distance_km >= 100 },
  { id: "ride_3h", group: "ride", icon: "bike", test: (a) => isRide(a) && a.moving_time_min >= 180 },
  { id: "swim_1500", group: "swim", icon: "swim", test: (a) => isSwim(a) && a.distance_km >= 1.5 },
  { id: "swim_3800", group: "swim", icon: "swim", test: (a) => isSwim(a) && a.distance_km >= 3.8 },
];

const COUNT_MILESTONES = [10, 50, 100, 250];
const CONSISTENCY_WEEKS = [4, 12, 26];

function dayOf(a) {
  return String(a.start_date || "").slice(0, 10);
}

function weekKey(dateStr) {
  const d = new Date(dateStr + "T12:00:00Z");
  const dow = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
  return d.toISOString().slice(0, 10);
}

/** Bike then run within 30 minutes of the ride ending, the same day. */
function findBrick(acts) {
  const sorted = acts.filter((a) => isRun(a) || isRide(a)).sort((x, y) => String(x.start_date).localeCompare(String(y.start_date)));
  for (let i = 0; i < sorted.length - 1; i++) {
    const ride = sorted[i];
    if (!isRide(ride)) continue;
    const rideEnd = new Date(ride.start_date).getTime() + (ride.moving_time_min || 0) * 60000;
    for (let j = i + 1; j < sorted.length; j++) {
      const run = sorted[j];
      if (dayOf(run) !== dayOf(ride)) break;
      if (!isRun(run)) continue;
      const gap = (new Date(run.start_date).getTime() - rideEnd) / 60000;
      if (gap >= -5 && gap <= 30) return dayOf(run);
    }
  }
  return null;
}

async function getAchievements(userId) {
  // Only training done since the athlete started with rooka counts, the same rule
  // as rooka points (users.rooka_start_date); imported history doesn't earn badges.
  const acts = dedupeActivities(await dbAll(
    `SELECT a.sport_type, a.distance_km, a.moving_time_min, a.start_date FROM activities a
     JOIN users u ON u.id = a.user_id
     WHERE a.user_id = ? AND (a.is_hidden IS NULL OR a.is_hidden = 0) AND a.start_date IS NOT NULL
       AND (u.rooka_start_date IS NULL OR substr(a.start_date, 1, 10) >= substr(u.rooka_start_date, 1, 10))
     ORDER BY a.start_date ASC`,
    [userId]
  ));
  const out = [];

  for (const item of CATALOGUE) {
    const first = acts.find(item.test);
    out.push({ id: item.id, group: item.group, icon: item.icon, earnedAt: first ? dayOf(first) : null });
  }

  const brick = findBrick(acts);
  out.push({ id: "first_brick", group: "milestones", icon: "swap", earnedAt: brick });

  for (const n of COUNT_MILESTONES) {
    out.push({ id: `sessions_${n}`, group: "milestones", icon: "counter", earnedAt: acts.length >= n ? dayOf(acts[n - 1]) : null, target: n, progress: Math.min(acts.length, n) });
  }

  // Consistency: consecutive weeks with at least 3 sessions.
  const perWeek = new Map();
  for (const a of acts) {
    const k = weekKey(dayOf(a));
    perWeek.set(k, (perWeek.get(k) || 0) + 1);
  }
  const weeks = [...perWeek.keys()].sort();
  let streak = 0;
  let best = 0;
  let prev = null;
  const earned = {};
  for (const k of weeks) {
    const consecutive = prev && (new Date(k + "T12:00:00Z") - new Date(prev + "T12:00:00Z")) / 86400000 === 7;
    if (perWeek.get(k) >= 3) {
      streak = consecutive && streak > 0 ? streak + 1 : 1;
      best = Math.max(best, streak);
      for (const n of CONSISTENCY_WEEKS) if (streak >= n && !earned[n]) earned[n] = k;
    } else {
      streak = 0;
    }
    prev = k;
  }
  for (const n of CONSISTENCY_WEEKS) {
    out.push({ id: `consistency_${n}w`, group: "milestones", icon: "calendar", earnedAt: earned[n] ? weekKey(earned[n]) : null, target: n, progress: Math.min(best, n) });
  }

  return out;
}

module.exports = { getAchievements, CATALOGUE };
