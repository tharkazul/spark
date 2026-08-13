export interface GarminExercise {
  category_key: string;
  exercise_key: string;
  exercise_name: string;
}

// Common Garmin exercise database fallback list for instant client-side matching & autocomplete
export const COMMON_GARMIN_EXERCISES: GarminExercise[] = [
  { category_key: 'BENCH_PRESS', exercise_key: 'BARBELL_BENCH_PRESS', exercise_name: 'Barbell Bench Press' },
  { category_key: 'BENCH_PRESS', exercise_key: 'DUMBBELL_BENCH_PRESS', exercise_name: 'Dumbbell Bench Press' },
  { category_key: 'BENCH_PRESS', exercise_key: 'INCLINE_BARBELL_BENCH_PRESS', exercise_name: 'Incline Barbell Bench Press' },
  { category_key: 'BENCH_PRESS', exercise_key: 'INCLINE_DUMBBELL_BENCH_PRESS', exercise_name: 'Incline Dumbbell Bench Press' },
  { category_key: 'SQUAT', exercise_key: 'BARBELL_BACK_SQUAT', exercise_name: 'Barbell Back Squat' },
  { category_key: 'SQUAT', exercise_key: 'BARBELL_FRONT_SQUAT', exercise_name: 'Barbell Front Squat' },
  { category_key: 'SQUAT', exercise_key: 'GOBLET_SQUAT', exercise_name: 'Goblet Squat' },
  { category_key: 'SQUAT', exercise_key: 'DUMBBELL_SQUAT', exercise_name: 'Dumbbell Squat' },
  { category_key: 'DEADLIFT', exercise_key: 'BARBELL_DEADLIFT', exercise_name: 'Barbell Deadlift' },
  { category_key: 'DEADLIFT', exercise_key: 'ROMANIAN_DEADLIFT', exercise_name: 'Romanian Deadlift' },
  { category_key: 'DEADLIFT', exercise_key: 'SINGLE_LEG_ROMANIAN_DEADLIFT', exercise_name: 'Single Leg Romanian Deadlift' },
  { category_key: 'SHOULDER_PRESS', exercise_key: 'OVERHEAD_PRESS', exercise_name: 'Overhead Press' },
  { category_key: 'SHOULDER_PRESS', exercise_key: 'DUMBBELL_SHOULDER_PRESS', exercise_name: 'Dumbbell Shoulder Press' },
  { category_key: 'PULL_UP', exercise_key: 'PULL_UP', exercise_name: 'Pull-Up' },
  { category_key: 'PULL_UP', exercise_key: 'CHIN_UP', exercise_name: 'Chin-Up' },
  { category_key: 'ROW', exercise_key: 'BARBELL_ROW', exercise_name: 'Barbell Row' },
  { category_key: 'ROW', exercise_key: 'DUMBBELL_ROW', exercise_name: 'Dumbbell Row' },
  { category_key: 'ROW', exercise_key: 'SEATED_CABLE_ROW', exercise_name: 'Seated Cable Row' },
  { category_key: 'LUNGE', exercise_key: 'WALKING_LUNGE', exercise_name: 'Walking Lunge' },
  { category_key: 'LUNGE', exercise_key: 'DUMBBELL_LUNGE', exercise_name: 'Dumbbell Lunge' },
  { category_key: 'CURL', exercise_key: 'BARBELL_BICEP_CURL', exercise_name: 'Barbell Bicep Curl' },
  { category_key: 'CURL', exercise_key: 'DUMBBELL_BICEP_CURL', exercise_name: 'Dumbbell Bicep Curl' },
  { category_key: 'TRICEPS_EXTENSION', exercise_key: 'TRICEPS_PUSHDOWN', exercise_name: 'Triceps Pushdown' },
  { category_key: 'TRICEPS_EXTENSION', exercise_key: 'SKULL_CRUSHER', exercise_name: 'Skull Crusher' },
  { category_key: 'PLANK', exercise_key: 'PLANK', exercise_name: 'Plank' },
  { category_key: 'CRUNCH', exercise_key: 'CRUNCH', exercise_name: 'Crunch' },
  { category_key: 'HIP_RAISE', exercise_key: 'BARBELL_HIP_THRUST', exercise_name: 'Barbell Hip Thrust' },
  { category_key: 'CALF_RAISE', exercise_key: 'STANDING_CALF_RAISE', exercise_name: 'Standing Calf Raise' },
];

export function expandAcronyms(text: string): string {
  return text
    .replace(/\bdb\b/gi, 'dumbbell')
    .replace(/\bbb\b/gi, 'barbell')
    .replace(/\bkb\b/gi, 'kettlebell')
    .replace(/\brdl\b/gi, 'romanian deadlift')
    .replace(/\bohp\b/gi, 'overhead press');
}

/**
 * Computes simple fuzzy matching score between search input and target text.
 * Higher score indicates better match quality (1.0 = exact match).
 */
export function scoreFuzzyMatch(query: string, target: string): number {
  if (!query || !target) return 0;
  const q = expandAcronyms(query).toLowerCase().trim();
  const t = expandAcronyms(target).toLowerCase().trim();

  if (q === t) return 1.0;
  if (t.includes(q)) return 0.8 + (q.length / t.length) * 0.15;

  const qTokens = q.split(/\s+/);
  const tTokens = t.split(/\s+/);

  let matchCount = 0;
  for (const qTok of qTokens) {
    if (tTokens.some((tTok) => tTok.includes(qTok) || qTok.includes(tTok))) {
      matchCount++;
    }
  }

  return (matchCount / Math.max(qTokens.length, 1)) * 0.7;
}

export function matchGarminExerciseClient(
  rawName: string,
  exerciseDatabase: GarminExercise[] = COMMON_GARMIN_EXERCISES
): GarminExercise | null {
  if (!rawName || !rawName.trim()) return null;

  let bestMatch: GarminExercise | null = null;
  let bestScore = 0;

  for (const item of exerciseDatabase) {
    const nameScore = scoreFuzzyMatch(rawName, item.exercise_name);
    const keyScore = scoreFuzzyMatch(rawName, item.exercise_key.replace(/_/g, ' '));
    const score = Math.max(nameScore, keyScore);

    if (score > bestScore && score >= 0.3) {
      bestScore = score;
      bestMatch = item;
    }
  }

  return bestMatch;
}
