import { ImageSourcePropType } from 'react-native';
import { sportColor } from '../constants/theme';

/**
 * The badge treatment for a sport: its label, glyph, hue, and golden crest emblem.
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
  /** Branded golden crest emblem. */
  emblem: ImageSourcePropType;
}

export const SPORT_EMBLEMS: Record<string, ImageSourcePropType> = {
  RUN: require('../../assets/images/sports/run.png'),
  BIKE: require('../../assets/images/sports/bike.png'),
  RIDE: require('../../assets/images/sports/bike.png'),
  SWIM: require('../../assets/images/sports/swim.png'),
  STRENGTH: require('../../assets/images/sports/strength.png'),
  MOBILITY: require('../../assets/images/sports/mobility.png'),
  YOGA: require('../../assets/images/sports/mobility.png'),
  WALK: require('../../assets/images/sports/hike.png'),
  HIKE: require('../../assets/images/sports/hike.png'),
  CARDIO: require('../../assets/images/sports/cardio.png'),
  HIIT: require('../../assets/images/sports/cardio.png'),
  TRIATHLON: require('../../assets/images/sports/triathlon.png'),
  REST: require('../../assets/images/sports/rest.png'),
};

export function getSportEmblem(type: string | undefined): ImageSourcePropType {
  const raw = String(type || 'REST').toUpperCase();
  return SPORT_EMBLEMS[raw] || SPORT_EMBLEMS.REST;
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
  const emblem = getSportEmblem(key);
  return { ...DISCIPLINES[key], color, tint: `${color}26`, emblem };
}

