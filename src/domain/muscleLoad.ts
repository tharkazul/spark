/**
 * Per-muscle training load over a rolling window.
 *
 * This replaces the arithmetic that used to sit inline in MuscleFatigueCard,
 * which counted activities rather than measuring them:
 *
 *   quads = min(95, 30 + runs * 15 + rides * 18)
 *
 * That has four separate reasons to read too high, and they compound:
 *
 *   1. A floor. Every muscle started at 15-30% on a week with no training at
 *      all, so an ordinary week began a third of the way up the bar.
 *   2. Count, not load. A 25-minute recovery jog added the same 15 points to
 *      the quads as a three-hour long run.
 *   3. No recency. A session six days ago counted exactly as much as this
 *      morning's, so nothing ever recovered inside the window.
 *   4. A hard clamp. `min(95, ...)` meant that once the sum passed 95 every
 *      muscle pinned to exactly 95 — which is why an ordinary week showed
 *      quadriceps 95% and hamstrings 95% simultaneously.
 *
 * The model here keeps the ranking (the sport-to-muscle mapping was the part
 * that was right) and fixes the magnitude: load is measured in Rooka, the
 * app's own unit of training load, it decays with age, and it saturates on a
 * smooth curve instead of hitting a wall.
 */

/** Muscle groups, in the order the card lists them. */
export const MUSCLE_GROUPS = [
  'quads',
  'calves',
  'hamstrings',
  'glutes',
  'core',
  'upper',
] as const;

export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

export type MuscleShares = Record<MuscleGroup, number>;

/**
 * How each sport's load lands on each muscle group.
 *
 * A row is not normalised to 1: it is "how hard does an hour of this hit this
 * muscle", so a run legitimately sums above a swim. These are the same relative
 * weightings the old constants encoded, which is why the ranking does not move.
 */
export const SPORT_MUSCLE_SHARES: Record<string, Partial<MuscleShares>> = {
  run: { quads: 0.55, calves: 0.85, hamstrings: 0.5, glutes: 0.35, core: 0.3, upper: 0.05 },
  bike: { quads: 0.9, calves: 0.25, hamstrings: 0.45, glutes: 0.6, core: 0.2, upper: 0.05 },
  swim: { quads: 0.2, calves: 0.15, hamstrings: 0.25, glutes: 0.25, core: 0.6, upper: 0.9 },
  strength: { quads: 0.6, calves: 0.3, hamstrings: 0.55, glutes: 0.65, core: 0.6, upper: 0.8 },
  other: { quads: 0.3, calves: 0.25, hamstrings: 0.3, glutes: 0.3, core: 0.3, upper: 0.3 },
};

/**
 * Fraction of a day-old session's load still counted the next day.
 *
 * The nightly server job uses 0.6, which is very fast — day three is already
 * down to 22%, so a Tuesday session is invisible by Friday. 0.78 gives a
 * half-life of about 2.8 days: yesterday's long run still dominates, last
 * weekend's has mostly cleared.
 */
export const DAILY_RETENTION = 0.78;

/** Days of history considered. Beyond this the retention factor is negligible. */
export const WINDOW_DAYS = 7;

/**
 * Decayed Rooka load at which a muscle reads ~63%.
 *
 * Calibrated against the bands the card itself draws — under 35 "Fresh / Low",
 * 35-64 "Moderate", 65+ "High Fatigue" — so that:
 *
 *   a week off            -> single digits
 *   a race taper          -> Fresh / Low
 *   3 runs + 2 rides      -> Moderate, around 55 on the quads
 *   a heavy block         -> High Fatigue, around 80
 *
 * The old arithmetic put that ordinary week at 95 on three muscles at once,
 * which is the complaint this is answering.
 */
export const REFERENCE_LOAD = 220;

/**
 * Per-sport scaling of Rooka into mechanical muscle load.
 *
 * Rooka is a cardiovascular currency: it is minutes weighted by heart-rate or
 * power zone. That undercounts resistance work badly — a hard set of squats
 * barely moves the heart rate but is the single largest mechanical stimulus a
 * quadriceps gets all week. Scaling strength up keeps the two comparable
 * without giving strength its own parallel scoring model.
 */
export const SPORT_LOAD_WEIGHT: Record<string, number> = {
  run: 1.0,
  bike: 1.0,
  swim: 1.0,
  strength: 2.2,
  other: 1.0,
};

export interface MuscleLoadActivity {
  sport_type?: string | null;
  name?: string | null;
  start_date?: string | null;
  rooka_score?: number | null;
  moving_time_min?: number | null;
}

/** Which share row a Strava/Garmin sport string belongs to. */
export function sportKeyFor(activity: MuscleLoadActivity): keyof typeof SPORT_MUSCLE_SHARES {
  const raw = `${activity.sport_type || ''} ${activity.name || ''}`.toLowerCase();
  if (raw.includes('run') || raw.includes('treadmill')) return 'run';
  if (raw.includes('ride') || raw.includes('bike') || raw.includes('cycl')) return 'bike';
  if (raw.includes('swim')) return 'swim';
  if (
    raw.includes('strength') ||
    raw.includes('weight') ||
    raw.includes('gym') ||
    raw.includes('crossfit') ||
    raw.includes('hyrox')
  ) {
    return 'strength';
  }
  return 'other';
}

/**
 * Training load of one activity, in Rooka.
 *
 * `rooka_score` is the zone-weighted figure the rest of Progress already shows,
 * so the card agrees with the numbers next to it. Activities predating the
 * rescore have none; those fall back to duration at the Zone-2 rate of 1.2
 * Rooka per minute rather than being dropped, so history still counts.
 */
export function loadOf(activity: MuscleLoadActivity): number {
  const scored = Number(activity.rooka_score);
  if (Number.isFinite(scored) && scored > 0) return scored;
  const mins = Number(activity.moving_time_min);
  if (Number.isFinite(mins) && mins > 0) return mins * 1.2;
  return 0;
}

/** Whole days between an activity and `now`, floored at 0. */
export function ageInDays(startDate: string | null | undefined, now: Date): number {
  if (!startDate) return 0;
  const started = new Date(startDate);
  if (isNaN(started.getTime())) return 0;
  const days = (now.getTime() - started.getTime()) / (24 * 60 * 60 * 1000);
  return days < 0 ? 0 : days;
}

/**
 * Load per muscle group, decayed by age, in Rooka.
 *
 * Returned before saturation so a caller can inspect the raw figure — the
 * percentages the card shows come from `fatiguePercentages`.
 */
export function decayedMuscleLoad(
  activities: MuscleLoadActivity[],
  now: Date = new Date()
): MuscleShares {
  const totals = Object.fromEntries(MUSCLE_GROUPS.map((m) => [m, 0])) as MuscleShares;

  for (const activity of activities) {
    const age = ageInDays(activity.start_date, now);
    if (age > WINDOW_DAYS) continue;

    const load = loadOf(activity);
    if (load <= 0) continue;

    const sport = sportKeyFor(activity);
    const retained =
      load * (SPORT_LOAD_WEIGHT[sport] ?? 1) * Math.pow(DAILY_RETENTION, age);
    const shares = SPORT_MUSCLE_SHARES[sport];

    for (const muscle of MUSCLE_GROUPS) {
      totals[muscle] += retained * (shares[muscle] ?? 0);
    }
  }

  return totals;
}

/**
 * Saturating map from decayed load to a 0-100 reading.
 *
 * `1 - e^(-load/R)` rises steeply while load is low and flattens as it climbs,
 * so heavy weeks separate from each other instead of all pinning to one number.
 * It approaches 100 without reaching it, which is the point: 100% would claim a
 * muscle cannot do anything at all.
 */
export function saturate(load: number, reference: number = REFERENCE_LOAD): number {
  if (load <= 0) return 0;
  // The curve is asymptotic but rounding is not: without the 99 ceiling a big
  // enough week still displays a flat 100%, which is the same overclaim the old
  // clamp made, just further along the scale.
  return Math.min(99, Math.round(100 * (1 - Math.exp(-load / reference))));
}

/** The percentages the card renders, per muscle group. */
export function fatiguePercentages(
  activities: MuscleLoadActivity[],
  now: Date = new Date()
): MuscleShares {
  const loads = decayedMuscleLoad(activities, now);
  return Object.fromEntries(
    MUSCLE_GROUPS.map((m) => [m, saturate(loads[m])])
  ) as MuscleShares;
}
