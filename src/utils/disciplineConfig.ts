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


/**
 * Ball and racket sports. Plans only know Run, Bike, Swim and Strength, so club hockey or
 * tennis is planned (and usually recorded on the watch) as a run. Their own medallion comes
 * from the session or activity title, or from the sport type when a source names it
 * ("Soccer", "Tennis"). All of them are drawn in the run gold, as that's what they count as.
 */
export type SubSport = 'HOCKEY' | 'FOOTBALL' | 'TENNIS' | 'PADEL' | 'BASKETBALL' | 'VOLLEYBALL' | 'GOLF' | 'RUGBY';

export const SUB_SPORT_EMBLEMS: Record<SubSport, ImageSourcePropType> = {
  HOCKEY: require('../../assets/images/sports/hockey.png'),
  FOOTBALL: require('../../assets/images/sports/football.png'),
  TENNIS: require('../../assets/images/sports/tennis.png'),
  PADEL: require('../../assets/images/sports/padel.png'),
  BASKETBALL: require('../../assets/images/sports/basketball.png'),
  VOLLEYBALL: require('../../assets/images/sports/volleyball.png'),
  GOLF: require('../../assets/images/sports/golf.png'),
  RUGBY: require('../../assets/images/sports/rugby.png'),
};

/** The colour family a sub-sport is drawn in. */
export const SUB_SPORT_FAMILY = 'RUN';

// Order matters: padel before tennis ("paddle tennis"), tennis before volleyball ("volley drills").
const SUB_SPORT_PATTERNS: [SubSport, RegExp][] = [
  ['PADEL', /padel|pádel|pickleball|paddle ?tennis/],
  ['TENNIS', /tennis|ténis|tênis|tenis|squash|badminton/],
  ['HOCKEY', /hockey|hóquei/],
  ['FOOTBALL', /soccer|football|voetbal|futebol|fu(ss|ß)ball|futsal|f[uú]tbol/],
  ['BASKETBALL', /basket|basquet/],
  ['VOLLEYBALL', /volley|v[oó]lei|voleibol/],
  ['GOLF', /\bgolf/],
  ['RUGBY', /rugby|r[uú]gbi/],
];
const TABLE_TENNIS = /table ?tennis|tafeltennis|tischtennis|ping ?pong|t[eéê]nis de mesa/;
const REAL_STRENGTH = /WEIGHT|STRENGTH|LIFT|GYM|CROSSFIT|BODYBUILDING|HYROX/;

function matchSubSport(text?: string): SubSport | null {
  const s = String(text || '').toLowerCase();
  if (!s || TABLE_TENNIS.test(s)) return null;
  for (const [sub, re] of SUB_SPORT_PATTERNS) if (re.test(s)) return sub;
  return null;
}

/**
 * The ball or racket sport a session is, or null. The sport type wins when it names one;
 * the title only counts for sessions on foot (a run, cardio, a walk, an unknown type), so a
 * gym session called "strength for hockey" or a bike ride stays what it is.
 */
export function detectSubSport(sport?: string, title?: string): SubSport | null {
  const norm = normalizeSportType(sport);
  if (norm === 'BIKE' || norm === 'SWIM' || norm === 'REST' || norm === 'MOBILITY' || norm === 'TRIATHLON') return null;
  const fromSport = matchSubSport(sport);
  if (fromSport) return fromSport;
  if (norm === 'STRENGTH' && REAL_STRENGTH.test(String(sport || '').toUpperCase())) return null;
  return matchSubSport(title);
}
