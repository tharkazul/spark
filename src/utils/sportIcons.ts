import { ComponentProps } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { sportColor } from '../constants/theme';

export type IoniconsName = ComponentProps<typeof Ionicons>['name'];

export interface SportIconConfig {
  name: string;
  outlineName: string;
  family?: 'Ionicons' | 'FontAwesome5';
  color: string;
  bgColor: string;
  label: string;
}

/**
 * Returns the appropriate icon config based on sport_type and activity name.
 */
export function getSportIconConfig(
  sportType?: string,
  activityName?: string,
  scheme: 'light' | 'dark' = 'light',
): SportIconConfig {
  const sport = (sportType || '').toLowerCase().trim();
  const name = (activityName || '').toLowerCase().trim();
  const combined = `${sport} ${name}`;

  // 1. Cycling / Bike / Ride
  if (
    sport.includes('ride') ||
    sport.includes('bike') ||
    sport.includes('cycl') ||
    sport.includes('virtualride') ||
    sport.includes('gravel') ||
    sport.includes('mtb') ||
    sport.includes('spinning') ||
    sport.includes('handcycle') ||
    sport.includes('velomobile') ||
    name.includes('ride') ||
    name.includes('bike') ||
    name.includes('cycling') ||
    name.includes('spinning')
  ) {
    return {
      name: 'bicycle',
      outlineName: 'bicycle-outline',
      color: sportColor('BIKE', scheme),
      bgColor: 'bg-[#4CAF6D]/15',
      label: 'BIKE',
    };
  }

  // 2. Swim
  if (
    sport.includes('swim') ||
    sport.includes('water') ||
    sport.includes('pool') ||
    name.includes('swim') ||
    name.includes('pool') ||
    name.includes('swimming')
  ) {
    return {
      name: 'water',
      outlineName: 'water-outline',
      family: 'Ionicons',
      color: sportColor('SWIM', scheme),
      bgColor: 'bg-[#2E8FE0]/15',
      label: 'SWIM',
    };
  }

  // 3. Strength / Weight Training / Gym / Lift
  if (
    sport.includes('weighttraining') ||
    sport.includes('weight training') ||
    sport.includes('strength') ||
    sport.includes('barbell') ||
    sport.includes('dumbbell') ||
    sport.includes('gym') ||
    sport.includes('lift') ||
    sport.includes('weight') ||
    name.includes('weight training') ||
    name.includes('weighttraining') ||
    name.includes('weights') ||
    name.includes('strength') ||
    name.includes('workout') && (name.includes('upper') || name.includes('lower') || name.includes('push') || name.includes('pull') || name.includes('leg'))
  ) {
    return {
      name: 'barbell',
      outlineName: 'barbell-outline',
      color: sportColor('STRENGTH', scheme),
      bgColor: 'bg-[#B36AE0]/15',
      label: 'STRENGTH',
    };
  }

  // 4. Pilates / Yoga / Mobility / Flexibility / Core / Stretching
  if (
    sport.includes('pilates') ||
    sport.includes('yoga') ||
    sport.includes('mobility') ||
    sport.includes('stretch') ||
    sport.includes('flexibility') ||
    sport.includes('core') ||
    name.includes('pilates') ||
    name.includes('yoga') ||
    name.includes('mobility') ||
    name.includes('stretch') ||
    name.includes('flexibility') ||
    name.includes('core')
  ) {
    return {
      name: 'body',
      outlineName: 'body-outline',
      color: sportColor('MOBILITY', scheme),
      bgColor: 'bg-[#2EBFAF]/15',
      label: 'MOBILITY',
    };
  }

  // 5. Walk / Hiking
  if (
    sport.includes('hike') ||
    sport.includes('hiking') ||
    sport.includes('walk') ||
    sport.includes('walking') ||
    name.includes('hike') ||
    name.includes('hiking') ||
    name.includes('walk')
  ) {
    return {
      name: 'footsteps',
      outlineName: 'footsteps-outline',
      color: sportColor('WALK', scheme),
      bgColor: 'bg-[#8FA82E]/15',
      label: 'WALK',
    };
  }

  // 6. Running / Run / Jog / Treadmill / Track
  if (
    sport.includes('run') ||
    sport.includes('jog') ||
    sport.includes('trailrun') ||
    sport.includes('virtualrun') ||
    sport.includes('treadmill') ||
    sport.includes('track') ||
    name.includes('run') ||
    name.includes('jog') ||
    name.includes('5k') ||
    name.includes('10k') ||
    name.includes('marathon') ||
    name.includes('treadmill') ||
    name.includes('tempo') ||
    name.includes('intervals')
  ) {
    return {
      name: 'walk',
      outlineName: 'walk-outline',
      color: sportColor('RUN', scheme),
      bgColor: 'bg-[#D9A62E]/15',
      label: 'RUN',
    };
  }

  // 7. Rowing / Water sports / Kayak / Canoe / SUP / Surfing
  if (
    sport.includes('row') ||
    sport.includes('kayak') ||
    sport.includes('canoe') ||
    sport.includes('surf') ||
    sport.includes('standuppaddling') ||
    sport.includes('sup') ||
    sport.includes('paddle') ||
    sport.includes('sail') ||
    name.includes('rowing') ||
    name.includes('kayak') ||
    name.includes('canoe') ||
    name.includes('surf') ||
    name.includes('paddle') ||
    name.includes('sup')
  ) {
    return {
      name: 'boat',
      outlineName: 'boat-outline',
      color: sportColor('ROWING', scheme),
      bgColor: 'bg-[#0284C7]/15',
      label: 'ROWING',
    };
  }

  // 8. Winter sports / Ski / Snowboard / Skate
  if (
    sport.includes('ski') ||
    sport.includes('snowboard') ||
    sport.includes('skate') ||
    sport.includes('snowshoe') ||
    sport.includes('ice') ||
    name.includes('ski') ||
    name.includes('snowboard') ||
    name.includes('skating') ||
    name.includes('ice skate')
  ) {
    return {
      name: 'snow',
      outlineName: 'snow-outline',
      color: sportColor('WINTER', scheme),
      bgColor: 'bg-[#38BDF8]/15',
      label: 'WINTER',
    };
  }

  // 9. Racquet sports / Tennis / Badminton / Pickleball / Squash / Padel
  if (
    sport.includes('tennis') ||
    sport.includes('pickleball') ||
    sport.includes('badminton') ||
    sport.includes('squash') ||
    sport.includes('racquet') ||
    sport.includes('padel') ||
    sport.includes('tabletennis') ||
    name.includes('tennis') ||
    name.includes('pickleball') ||
    name.includes('badminton') ||
    name.includes('squash') ||
    name.includes('padel') ||
    name.includes('ping pong') ||
    name.includes('table tennis')
  ) {
    return {
      name: 'tennisball',
      outlineName: 'tennisball-outline',
      color: sportColor('RACQUET', scheme),
      bgColor: 'bg-[#84CC16]/15',
      label: 'RACQUET',
    };
  }

  // 10. Ball Sports
  if (sport.includes('soccer') || sport.includes('football') || name.includes('soccer') || name.includes('football')) {
    return {
      name: 'football',
      outlineName: 'football-outline',
      color: sportColor('SOCCER', scheme),
      bgColor: 'bg-[#10B981]/15',
      label: 'SOCCER',
    };
  }

  if (sport.includes('basketball') || name.includes('basketball')) {
    return {
      name: 'basketball',
      outlineName: 'basketball-outline',
      color: sportColor('BASKETBALL', scheme),
      bgColor: 'bg-[#FF5F3B]/15',
      label: 'BASKETBALL',
    };
  }

  if (sport.includes('golf') || name.includes('golf')) {
    return {
      name: 'golf',
      outlineName: 'golf-outline',
      color: sportColor('GOLF', scheme),
      bgColor: 'bg-[#22C55E]/15',
      label: 'GOLF',
    };
  }

  // 11. Combat / Boxing / Martial Arts
  if (
    sport.includes('box') ||
    sport.includes('fight') ||
    sport.includes('martial') ||
    sport.includes('mma') ||
    sport.includes('kickbox') ||
    name.includes('boxing') ||
    name.includes('kickbox') ||
    name.includes('mma')
  ) {
    return {
      name: 'shield',
      outlineName: 'shield-outline',
      color: sportColor('COMBAT', scheme),
      bgColor: 'bg-[#EF4444]/15',
      label: 'COMBAT',
    };
  }

  // 12. HIIT / Crossfit / General Workout / Other Fitness
  if (
    sport.includes('hiit') ||
    sport.includes('crossfit') ||
    sport.includes('cardio') ||
    sport.includes('circuit') ||
    sport.includes('fitness') ||
    name.includes('hiit') ||
    name.includes('crossfit') ||
    name.includes('cardio') ||
    name.includes('circuit') ||
    name.includes('tabata') ||
    name.includes('bootcamp')
  ) {
    return {
      name: 'fitness',
      outlineName: 'fitness-outline',
      color: sportColor('FITNESS', scheme),
      bgColor: 'bg-[#F43F5E]/15',
      label: 'FITNESS',
    };
  }

  // Fallback default
  return {
    name: 'fitness',
    outlineName: 'fitness-outline',
    color: sportColor('DEFAULT', scheme),
    bgColor: 'bg-theme-accent/15',
    label: sportType ? sportType.toUpperCase() : 'WORKOUT',
  };
}

/**
 * Returns the outline icon name for a given sport type and activity name.
 */
export function getSportOutlineIcon(sportType?: string, activityName?: string): IoniconsName {
  return getSportIconConfig(sportType, activityName).outlineName as IoniconsName;
}

/**
 * Returns the filled icon name for a given sport type and activity name.
 */
export function getSportFilledIcon(sportType?: string, activityName?: string): IoniconsName {
  return getSportIconConfig(sportType, activityName).name as IoniconsName;
}
