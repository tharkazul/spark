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

export function normalizeSportType(type: string | undefined): string {
  if (!type) return 'REST';
  const clean = String(type).trim().toUpperCase();

  if (clean === 'REST' || clean === 'RECOVERY') return 'REST';

  // Run family
  if (clean.includes('RUN') || clean.includes('TREADMILL') || clean.includes('JOG')) return 'RUN';

  // Bike family
  if (
    clean.includes('BIKE') ||
    clean.includes('RIDE') ||
    clean.includes('CYCLE') ||
    clean.includes('CYCLING') ||
    clean.includes('SPIN') ||
    clean.includes('GRAVEL') ||
    clean.includes('MOUNTAIN')
  ) {
    return 'BIKE';
  }

  // Swim family
  if (clean.includes('SWIM') || clean.includes('POOL') || clean.includes('WATER')) return 'SWIM';

  // Strength family (WeightTraining, Weights, Gym, Functional, Crossfit, etc.)
  if (
    clean.includes('WEIGHT') ||
    clean.includes('STRENGTH') ||
    clean.includes('LIFT') ||
    clean.includes('GYM') ||
    clean.includes('WORKOUT') ||
    clean.includes('CROSSFIT') ||
    clean.includes('BODYBUILDING') ||
    clean.includes('HYROX') ||
    clean.includes('FITNESS')
  ) {
    return 'STRENGTH';
  }

  // Mobility / Yoga / Pilates
  if (clean.includes('YOGA') || clean.includes('PILATES') || clean.includes('STRETCH') || clean.includes('MOBILITY')) {
    return 'MOBILITY';
  }

  // Walk / Hike
  if (clean.includes('WALK')) return 'WALK';
  if (clean.includes('HIKE')) return 'HIKE';

  // Cardio / HIIT / Rowing
  if (clean.includes('CARDIO') || clean.includes('HIIT') || clean.includes('ROW') || clean.includes('ELLIPTICAL')) {
    return 'CARDIO';
  }

  if (clean.includes('TRIATHLON')) return 'TRIATHLON';

  // Fallback: Default unrecognized active workouts to STRENGTH, never to REST
  return 'STRENGTH';
}

export function getSportEmblem(type: string | undefined): ImageSourcePropType {
  const norm = normalizeSportType(type);
  return SPORT_EMBLEMS[norm] || SPORT_EMBLEMS.STRENGTH;
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
  TRIATHLON: { label: 'TRIATHLON', icon: 'trophy-variant', family: 'MaterialCommunityIcons' },
  REST: { label: 'REST', icon: 'weather-night', family: 'MaterialCommunityIcons' },
};

export function getDisciplineConfig(
  type: string | undefined,
  scheme: 'light' | 'dark' = 'light',
): DisciplineConfig {
  const key = normalizeSportType(type);
  const discipline = DISCIPLINES[key] || DISCIPLINES.STRENGTH;
  const color = sportColor(key, scheme);
  const emblem = getSportEmblem(key);
  return { ...discipline, color, tint: `${color}26`, emblem };
}

