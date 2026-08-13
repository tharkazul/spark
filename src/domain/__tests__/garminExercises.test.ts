import { matchGarminExerciseClient, scoreFuzzyMatch } from '../garminExercises';
import { parseStepsJson, createStep } from '../steps';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

export function runGarminExercisesTests() {
  console.log('[Garmin Exercises Unit Tests] Running tests...');

  // Test 1: scoreFuzzyMatch
  assert(scoreFuzzyMatch('bench press', 'Barbell Bench Press') > 0.6, 'Bench press should match Barbell Bench Press');

  // Test 2: matchGarminExerciseClient fuzzy matches
  const match1 = matchGarminExerciseClient('Deep Bench press');
  assert(match1 !== null, 'Deep Bench press should match an exercise');
  assert(match1?.category_key === 'BENCH_PRESS', 'Deep Bench press should match BENCH_PRESS category');
  assert(match1?.exercise_name.includes('Bench Press') === true, 'Matched exercise name should contain Bench Press');

  const match2 = matchGarminExerciseClient('Heavy DB Squat');
  assert(match2 !== null, 'Heavy DB Squat should match an exercise');
  assert(match2?.category_key === 'SQUAT', 'Heavy DB Squat should match SQUAT category');

  // Test 3: Steps enrichment in steps.ts
  const step = createStep('interval', { exerciseName: 'Incline Bench press' });
  assert(step.exerciseName === 'Incline Bench press', 'Original exerciseName should be preserved');
  assert(typeof step.garmin_exercise_name === 'string', 'garmin_exercise_name should be populated');
  assert(step.garmin_category_key === 'BENCH_PRESS', 'garmin_category_key should be BENCH_PRESS');

  console.log('[Garmin Exercises Unit Tests] All Garmin Exercises tests passed successfully!');
}

if (typeof require !== 'undefined' && require.main === module) {
  runGarminExercisesTests();
}
