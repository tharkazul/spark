import { sportColor } from '../constants/theme';

/**
 * The badge treatment for a sport: its label, glyph, and hue for the active
 * theme.
 *
 * This replaced four near-identical `getDisciplineConfig` functions declared
 * inside DetailedDayCard, TodaysPlanCard, MicroPlanAgendaCard and coach.tsx.
 * They had drifted apart, so the same session was a different colour depending
 * on which screen you looked at it from -- a bike was #4CAF6D on Planning,
 * #34D399 on Coach and #10B981 on the agenda. All of them also hardcoded the
 * light hue, so sport colours never changed in dark mode.
 *
 * Colours come back as values rather than Tailwind classes: a class string
 * cannot carry a runtime theme, which is what forced the hardcoding in the
 * first place.
 */
export interface DisciplineConfig {
  /** Uppercase badge text, e.g. "SWIM". */
  label: string;
  /** Ionicons name. */
  icon: string;
  /** The sport's hue, resolved for the current theme. */
  color: string;
  /** The same hue at 15%, for the badge background. */
  tint: string;
}

const DISCIPLINES: Record<string, { label: string; icon: string }> = {
  SWIM: { label: 'SWIM', icon: 'water-outline' },
  BIKE: { label: 'BIKE', icon: 'bicycle-outline' },
  RIDE: { label: 'BIKE', icon: 'bicycle-outline' },
  RUN: { label: 'RUN', icon: 'walk-outline' },
  STRENGTH: { label: 'STRENGTH', icon: 'barbell-outline' },
  MOBILITY: { label: 'MOBILITY', icon: 'body-outline' },
  YOGA: { label: 'YOGA', icon: 'body-outline' },
  WALK: { label: 'WALK', icon: 'footsteps-outline' },
  HIKE: { label: 'HIKE', icon: 'trail-sign-outline' },
  CARDIO: { label: 'CARDIO', icon: 'flash-outline' },
  HIIT: { label: 'HIIT', icon: 'flash-outline' },
  REST: { label: 'REST', icon: 'moon-outline' },
};

export function getDisciplineConfig(
  type: string | undefined,
  scheme: 'light' | 'dark' = 'light',
): DisciplineConfig {
  // The plan stores sport in title case ('Bike') while these keys are upper.
  // Without normalising, every workout fell through to REST and rendered a moon.
  const raw = String(type || 'REST').toUpperCase();
  const key = raw in DISCIPLINES ? raw : 'REST';
  const color = sportColor(key, scheme);
  return { ...DISCIPLINES[key], color, tint: `${color}26` };
}
