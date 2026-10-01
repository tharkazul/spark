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

export interface PaceParts {
  value: string;
  unit: string;
  label: 'SPEED' | 'PACE';
}

/**
 * Returns structured pace/speed parts for high-fidelity rendering (e.g. StatValue),
 * or null when it can't be computed.
 */
export function getPaceParts(
  distanceKm?: number | null,
  movingTimeMinOrSec?: number | null,
  sportType?: string,
  activityName?: string,
  isExactSeconds?: boolean,
): PaceParts | null {
  if (!distanceKm || !movingTimeMinOrSec || distanceKm <= 0 || movingTimeMinOrSec <= 0) return null;

  const totalSecs = isExactSeconds ? movingTimeMinOrSec : movingTimeMinOrSec * 60;
  const hours = totalSecs / 3600;

  switch (sportFamily(sportType, activityName)) {
    case 'wheel':
      return {
        value: (distanceKm / hours).toFixed(1),
        unit: 'km/h',
        label: 'SPEED',
      };
    case 'water':
      return {
        value: mmss(totalSecs / (distanceKm * 10)),
        unit: '/100m',
        label: 'PACE',
      };
    case 'foot':
      return {
        value: mmss(totalSecs / distanceKm),
        unit: '/km',
        label: 'PACE',
      };
    default:
      return null;
  }
}

/**
 * The headline pace/speed for an activity, or null when it can't be computed
 * or the sport has no meaningful one. Callers should omit the field on null
 * rather than substituting a placeholder.
 */
export function formatPaceOrSpeed(
  distanceKm?: number | null,
  movingTimeMinOrSec?: number | null,
  sportType?: string,
  activityName?: string,
  isExactSeconds?: boolean,
): string | null {
  const parts = getPaceParts(distanceKm, movingTimeMinOrSec, sportType, activityName, isExactSeconds);
  if (!parts) return null;
  return `${parts.value} ${parts.unit}`;
}

