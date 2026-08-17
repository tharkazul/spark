import { normalizeActivityDetail, formatPace, formatDuration, normalizeSportType } from '../../api/activityNormalizer';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

export function runNormalizerTests() {
  console.log('[Normalizer Unit Tests] Running tests...');

  // Test 1: normalizeSportType
  assert(normalizeSportType('run') === 'RUN', 'run should normalize to RUN');
  assert(normalizeSportType('cycling') === 'BIKE', 'cycling should normalize to BIKE');
  assert(normalizeSportType('swimming') === 'SWIM', 'swimming should normalize to SWIM');
  assert(normalizeSportType('weightlifting') === 'STRENGTH', 'weightlifting should normalize to STRENGTH');
  assert(normalizeSportType('yoga') === 'MOBILITY', 'yoga should normalize to MOBILITY');

  // Test 2: formatPace and formatDuration
  assert(formatDuration(45) === '45m', '45 min formatted duration');
  assert(formatDuration(75) === '1h 15m', '75 min formatted duration');

  assert(formatPace(50, 10, 'RUN') === '5:00 /km', '50m / 10km run pace should be 5:00 /km');
  assert(formatPace(60, 30, 'BIKE') === '30.0 km/u', '60m / 30km bike pace should be 30.0 km/u');
  assert(formatPace(20, 1, 'SWIM') === '2:00 /100m', '20m / 1km swim pace should be 2:00 /100m');

  // Test 3: Raw Strava payload normalization (meters + seconds)
  const rawStrava = {
    id: 123456,
    name: 'Morning Run',
    type: 'Run',
    distance: 10000, // 10,000 meters
    moving_time: 3000, // 3000 seconds = 50 minutes
    total_elevation_gain: 150,
    average_heartrate: 155.4,
    start_date_local: '2026-08-10T08:00:00Z',
    tss: 65,
  };

  const normalized = normalizeActivityDetail(rawStrava);
  assert(normalized.distance_km === 10, 'Distance should be converted to 10 km');
  assert(normalized.moving_time_min === 50, 'Moving time should be converted to 50 min');
  assert(normalized.sport_type === 'RUN', 'Sport type should be RUN');
  assert(normalized.elevation_m === 150, 'Elevation should be 150');
  assert(normalized.average_heartrate === 155, 'Avg HR should be rounded to 155');
  assert(normalized.formatted_pace === '5:00 /km', 'Pace should be formatted as 5:00 /km');
  assert(normalized.formatted_duration === '50m', 'Duration should be 50m');

  console.log('[Normalizer Unit Tests] All Normalizer tests passed successfully!');
}

if (typeof require !== 'undefined' && require.main === module) {
  runNormalizerTests();
}
