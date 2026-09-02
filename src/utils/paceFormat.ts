/**
 * Pace / speed formatting, in one place.
 *
 * The unit an endurance athlete reads depends on the sport: minutes per
 * kilometre on foot, kilometres per hour on a bike, minutes per 100m in the
 * water. Getting that wrong is worse than showing nothing — "5:07 /km" on a
 * bike ride is not a slow ride, it is a nonsense number.
 *
 * This existed as three near-copies inside ActivityDetailModal, and
 * app/activities.tsx skipped the maths altogether and printed a literal
 * `'5:07/km'` for every run.
 */

type SportFamily = 'foot' | 'wheel' | 'water' | 'other';

const FOOT = ['run', 'walk', 'hike', 'trail', 'treadmill'];
const WHEEL = ['ride', 'bike', 'cycling', 'cycle', 'ebike', 'handcycle', 'velomobile'];
const WATER = ['swim', 'openwater', 'open_water'];

export function sportFamily(sportType?: string, activityName?: string): SportFamily {
  const hay = `${sportType ?? ''} ${activityName ?? ''}`.toLowerCase();
  if (WATER.some((k) => hay.includes(k))) return 'water';
  if (WHEEL.some((k) => hay.includes(k))) return 'wheel';
  if (FOOT.some((k) => hay.includes(k))) return 'foot';
  return 'other';
}

const mmss = (totalSeconds: number) => {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.round(totalSeconds % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
};

/**
 * The headline pace/speed for an activity, or null when it can't be computed
 * or the sport has no meaningful one. Callers should omit the field on null
 * rather than substituting a placeholder.
 */
export function formatPaceOrSpeed(
  distanceKm?: number | null,
  movingTimeMin?: number | null,
  sportType?: string,
  activityName?: string,
): string | null {
  if (!distanceKm || !movingTimeMin || distanceKm <= 0 || movingTimeMin <= 0) return null;

  switch (sportFamily(sportType, activityName)) {
    case 'wheel':
      return `${(distanceKm / (movingTimeMin / 60)).toFixed(1)} km/h`;
    case 'water':
      return `${mmss((movingTimeMin * 60) / (distanceKm * 10))} /100m`;
    case 'foot':
      return `${mmss((movingTimeMin * 60) / distanceKm)} /km`;
    default:
      return null;
  }
}
