import { ImageSourcePropType } from 'react-native';
import { sportColor } from '../constants/theme';

/**
 * The badge treatment for a sport: its label, glyph, hue, and golden crest emblem.
 */
export interface DisciplineConfig {
  /** Uppercase badge text, e.g. "SWIM". */
  label: string;
  /** Icon name (Ionicons or MaterialCommunityIcons). */
  icon: string;
  /** Icon family. Defaults to Ionicons. */
  family?: 'Ionicons' | 'MaterialCommunityIcons';
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

const DISCIPLINES: Record<string, { label: string; icon: string; family?: 'Ionicons' | 'MaterialCommunityIcons' }> = {
  SWIM: { label: 'SWIM', icon: 'swim', family: 'MaterialCommunityIcons' },
  BIKE: { label: 'BIKE', icon: 'bike', family: 'MaterialCommunityIcons' },
  RIDE: { label: 'BIKE', icon: 'bike', family: 'MaterialCommunityIcons' },
  RUN: { label: 'RUN', icon: 'run', family: 'MaterialCommunityIcons' },
  STRENGTH: { label: 'STRENGTH', icon: 'dumbbell', family: 'MaterialCommunityIcons' },
  MOBILITY: { label: 'MOBILITY', icon: 'yoga', family: 'MaterialCommunityIcons' },
  YOGA: { label: 'YOGA', icon: 'yoga', family: 'MaterialCommunityIcons' },
  WALK: { label: 'WALK', icon: 'walk', family: 'MaterialCommunityIcons' },
  HIKE: { label: 'HIKE', icon: 'hiking', family: 'MaterialCommunityIcons' },
  CARDIO: { label: 'CARDIO', icon: 'heart-pulse', family: 'MaterialCommunityIcons' },
  HIIT: { label: 'HIIT', icon: 'lightning-bolt', family: 'MaterialCommunityIcons' },
  REST: { label: 'REST', icon: 'weather-night', family: 'MaterialCommunityIcons' },
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

