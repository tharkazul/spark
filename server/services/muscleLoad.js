/**
 * Per-muscle training load — the server half of the model.
 *
 * These tables and constants MUST stay identical to `src/domain/muscleLoad.ts`,
 * the same contract `zones.js` has with `src/domain/rookaScore.ts`. The athlete
 * reads these numbers on the Progress tab and the coach reasons about them in
 * the same conversation; if the two drift, the coach argues with the screen.
 *
 * This replaces `analyzeMuscleImpact`, which asked the model to invent an impact
 * score per body part on every synced activity — one AI call per activity, and
 * therefore nothing at all once the daily quota is spent. Load is derivable from
 * data already in the row, so it is computed rather than asked for.
 */

const db = require("./db");

const MUSCLE_GROUPS = ["quads", "calves", "hamstrings", "glutes", "core", "upper"];

/** Human labels, matching the Progress card's rows. */
const MUSCLE_LABELS = {
  quads: "Quadriceps",
  calves: "Calves & Achilles",
  hamstrings: "Hamstrings",
  glutes: "Glutes & Hip Flexors",
  core: "Core & Abdominals",
  upper: "Upper Body & Shoulders",
};

const SPORT_MUSCLE_SHARES = {
  run: { quads: 0.55, calves: 0.85, hamstrings: 0.5, glutes: 0.35, core: 0.3, upper: 0.05 },
  bike: { quads: 0.9, calves: 0.25, hamstrings: 0.45, glutes: 0.6, core: 0.2, upper: 0.05 },
  swim: { quads: 0.2, calves: 0.15, hamstrings: 0.25, glutes: 0.25, core: 0.6, upper: 0.9 },
  strength: { quads: 0.6, calves: 0.3, hamstrings: 0.55, glutes: 0.65, core: 0.6, upper: 0.8 },
  other: { quads: 0.3, calves: 0.25, hamstrings: 0.3, glutes: 0.3, core: 0.3, upper: 0.3 },
};

const SPORT_LOAD_WEIGHT = {
  run: 1.0,
  bike: 1.0,
  swim: 1.0,
  strength: 2.2,
  other: 1.0,
};

const DAILY_RETENTION = 0.78;
const WINDOW_DAYS = 7;
const REFERENCE_LOAD = 220;

function sportKeyFor(activity) {
  const raw = `${activity.sport_type || ""} ${activity.name || ""}`.toLowerCase();
  if (raw.includes("run") || raw.includes("treadmill")) return "run";
  if (raw.includes("ride") || raw.includes("bike") || raw.includes("cycl")) return "bike";
  if (raw.includes("swim")) return "swim";
  if (
    raw.includes("strength") ||
    raw.includes("weight") ||
    raw.includes("gym") ||
    raw.includes("crossfit") ||
    raw.includes("hyrox")
  ) {
    return "strength";
  }
  return "other";
}

function loadOf(activity) {
  const scored = Number(activity.rooka_score);
  if (Number.isFinite(scored) && scored > 0) return scored;
  const mins = Number(activity.moving_time_min);
  if (Number.isFinite(mins) && mins > 0) return mins * 1.2;
  return 0;
}

function ageInDays(startDate, now) {
  if (!startDate) return 0;
  const started = new Date(String(startDate).replace(" ", "T"));
  if (isNaN(started.getTime())) return 0;
  const days = (now.getTime() - started.getTime()) / (24 * 60 * 60 * 1000);
  return days < 0 ? 0 : days;
}

function decayedMuscleLoad(activities, now = new Date()) {
  const totals = {};
  for (const m of MUSCLE_GROUPS) totals[m] = 0;

  for (const activity of activities || []) {
    const age = ageInDays(activity.start_date, now);
    if (age > WINDOW_DAYS) continue;

    const load = loadOf(activity);
    if (load <= 0) continue;

    const sport = sportKeyFor(activity);
    const retained =
      load * (SPORT_LOAD_WEIGHT[sport] || 1) * Math.pow(DAILY_RETENTION, age);
    const shares = SPORT_MUSCLE_SHARES[sport];

    for (const m of MUSCLE_GROUPS) {
      totals[m] += retained * (shares[m] || 0);
    }
  }

  return totals;
}

function saturate(load, reference = REFERENCE_LOAD) {
  if (load <= 0) return 0;
  return Math.min(99, Math.round(100 * (1 - Math.exp(-load / reference))));
}

function fatiguePercentages(activities, now = new Date()) {
  const loads = decayedMuscleLoad(activities, now);
  const out = {};
  for (const m of MUSCLE_GROUPS) out[m] = saturate(loads[m]);
  return out;
}

/** The band the Progress card would show for a reading. */
function bandFor(pct) {
  if (pct >= 65) return "HIGH";
  if (pct >= 35) return "MODERATE";
  return "FRESH";
}

/**
 * The MUSCLE STATUS block for a coach prompt, from rows the caller already has.
 *
 * Only groups at MODERATE or above are listed — a full six-row table of mostly
 * "FRESH" is prompt noise, and the interesting signal is what is loaded.
 */
function describeMuscleStatus(activities, now = new Date()) {
  const pct = fatiguePercentages(activities, now);
  const loaded = MUSCLE_GROUPS.filter((m) => pct[m] >= 35).sort((a, b) => pct[b] - pct[a]);

  if (loaded.length === 0) {
    return "All muscle groups fresh — no group above 35% of its 7-day load reference.";
  }

  return loaded
    .map((m) => `- ${MUSCLE_LABELS[m]}: ${pct[m]}% load (${bandFor(pct[m])})`)
    .join("\n                    ");
}

/** The activity columns `describeMuscleStatus` needs, for a caller's own query. */
const ACTIVITY_COLUMNS = "name, sport_type, start_date, rooka_score, moving_time_min";

/**
 * Muscle load for one athlete, straight from their activity rows.
 *
 * Reads only the last window plus a day of slack, so this stays a small query
 * however long an athlete's history is.
 */
function getMuscleLoadForUser(userId, now = new Date()) {
  return new Promise((resolve) => {
    const cutoff = new Date(now.getTime() - (WINDOW_DAYS + 1) * 24 * 3600 * 1000)
      .toISOString()
      .substring(0, 10);

    db.all(
      `SELECT name, sport_type, start_date, rooka_score, moving_time_min
         FROM activities
        WHERE user_id = ? AND substr(replace(start_date, 'T', ' '), 1, 10) >= ?`,
      [userId, cutoff],
      (err, rows) => {
        if (err || !rows) return resolve(fatiguePercentages([], now));
        resolve(fatiguePercentages(rows, now));
      }
    );
  });
}

/**
 * The MUSCLE STATUS block for a coach prompt.
 *
 * Only groups at MODERATE or above are listed — a full six-row table of mostly
 * "FRESH" is prompt noise, and the interesting signal is what is loaded.
 */
async function getMuscleStatusTextForUser(userId, now = new Date()) {
  return new Promise((resolve) => {
    const cutoff = new Date(now.getTime() - (WINDOW_DAYS + 1) * 24 * 3600 * 1000)
      .toISOString()
      .substring(0, 10);
    db.all(
      `SELECT ${ACTIVITY_COLUMNS}
         FROM activities
        WHERE user_id = ? AND substr(replace(start_date, 'T', ' '), 1, 10) >= ?`,
      [userId, cutoff],
      (err, rows) => resolve(describeMuscleStatus(err ? [] : rows || [], now))
    );
  });
}

module.exports = {
  MUSCLE_GROUPS,
  MUSCLE_LABELS,
  SPORT_MUSCLE_SHARES,
  SPORT_LOAD_WEIGHT,
  DAILY_RETENTION,
  WINDOW_DAYS,
  REFERENCE_LOAD,
  sportKeyFor,
  loadOf,
  ageInDays,
  decayedMuscleLoad,
  saturate,
  fatiguePercentages,
  bandFor,
  describeMuscleStatus,
  ACTIVITY_COLUMNS,
  getMuscleLoadForUser,
  getMuscleStatusTextForUser,
};
