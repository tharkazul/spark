import { calculatePMC, calculateReadiness, getTsbStatus } from '../pmc';
import { Activity } from '../../types/activity';
import { PhysiqueEntry } from '../../types/physique';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

export function runPMCTests() {
  console.log('[PMC Unit Tests] Running tests...');

  // Test 1: getTsbStatus classifications
  assert(getTsbStatus(-35) === 'Overreaching', 'TSB -35 should be Overreaching');
  assert(getTsbStatus(-15) === 'Optimal Training', 'TSB -15 should be Optimal Training');
  assert(getTsbStatus(0) === 'Maintaining', 'TSB 0 should be Maintaining');
  assert(getTsbStatus(15) === 'Fresh / Tapering', 'TSB 15 should be Fresh / Tapering');
  assert(getTsbStatus(30) === 'Detraining', 'TSB 30 should be Detraining');

  // Test 2: calculateReadiness baseline and bounds
  const baselineReadiness = calculateReadiness(0, null);
  assert(baselineReadiness.score === 50, 'Baseline TSB 0 readiness score should be 50');
  assert(baselineReadiness.category === 'Adequate', 'Baseline category should be Adequate');

  // Moderate high readiness test: TSB 10 (contrib +5), sleep 4 (+10), fatigue 2 (+10) => 50 + 5 + 10 + 10 = 75
  const modHighReadiness = calculateReadiness(10, {
    date: new Date().toISOString().split('T')[0],
    sleep_quality: 4,
    fatigue_level: 2,
  } as PhysiqueEntry);
  assert(modHighReadiness.score === 75, `Moderate high readiness score should be 75, got ${modHighReadiness.score}`);
  assert(modHighReadiness.category === 'Prime Condition', 'Moderate high category should be Prime Condition');

  // Clamped max test: TSB 30 (+15), sleep 5 (+20), fatigue 1 (+20) => 105 clamped to 100
  const maxReadiness = calculateReadiness(30, {
    date: new Date().toISOString().split('T')[0],
    sleep_quality: 5,
    fatigue_level: 1,
  } as PhysiqueEntry);
  assert(maxReadiness.score === 100, `Max readiness score should be clamped to 100, got ${maxReadiness.score}`);
  assert(maxReadiness.category === 'Prime Condition', 'Max readiness category should be Prime Condition');

  // Clamped min test: TSB -50 (-20), sleep 1 (-20), fatigue 5 (-20) => -10 clamped to 0
  const clampedLowReadiness = calculateReadiness(-50, {
    date: new Date().toISOString().split('T')[0],
    sleep_quality: 1,
    fatigue_level: 5,
  } as PhysiqueEntry);
  assert(clampedLowReadiness.score === 0, `Low readiness score should be clamped to 0, got ${clampedLowReadiness.score}`);
  assert(clampedLowReadiness.category === 'Need Recovery', 'Low readiness category should be Need Recovery');

  // Test 3: calculatePMC history & trend outputs
  const todayStr = new Date().toISOString().split('T')[0];
  const sampleActivities: Activity[] = [
    {
      id: '1',
      start_date: todayStr,
      rooka_score: 50,
      name: 'Run',
      sport_type: 'RUN',
      distance_km: 10,
      moving_time_min: 50,
    },
  ];

  const result = calculatePMC(sampleActivities, [], [
    { date: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0], target_ctl: 60 },
  ]);

  assert(typeof result.currentCtl === 'number', 'currentCtl should be a number');
  assert(typeof result.currentAtl === 'number', 'currentAtl should be a number');
  assert(typeof result.currentTsb === 'number', 'currentTsb should be a number');
  assert(Array.isArray(result.history), 'history should be an array');
  assert(result.history.length > 0, 'history should have points');
  assert(result.goalProjection !== null, 'goalProjection should be present when milestones exist');

  console.log('[PMC Unit Tests] All PMC tests passed successfully!');
}

if (typeof require !== 'undefined' && require.main === module) {
  runPMCTests();
}
