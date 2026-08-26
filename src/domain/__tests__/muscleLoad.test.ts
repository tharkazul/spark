import {
  MUSCLE_GROUPS,
  DAILY_RETENTION,
  REFERENCE_LOAD,
  WINDOW_DAYS,
  retentionAt,
  ageInDays,
  decayedMuscleLoad,
  fatiguePercentages,
  loadOf,
  saturate,
  sportKeyFor,
  MuscleLoadActivity,
} from '../muscleLoad';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

const NOW = new Date('2026-08-26T20:00:00Z');

function act(
  daysAgo: number,
  sport: string,
  mins: number,
  rookaPerMin = 1.2
): MuscleLoadActivity {
  return {
    sport_type: sport,
    start_date: new Date(NOW.getTime() - daysAgo * 24 * 3600 * 1000).toISOString(),
    moving_time_min: mins,
    rooka_score: Math.round(mins * rookaPerMin),
  };
}

export function runMuscleLoadTests() {
  console.log('[MuscleLoad Unit Tests] Running tests...');

  // --- sport classification --------------------------------------------
  assert(sportKeyFor({ sport_type: 'Run' }) === 'run', 'Run -> run');
  assert(sportKeyFor({ sport_type: 'TrailRun' }) === 'run', 'TrailRun -> run');
  assert(sportKeyFor({ sport_type: 'VirtualRide' }) === 'bike', 'VirtualRide -> bike');
  assert(sportKeyFor({ sport_type: 'Swim' }) === 'swim', 'Swim -> swim');
  assert(sportKeyFor({ sport_type: 'WeightTraining' }) === 'strength', 'WeightTraining -> strength');
  assert(sportKeyFor({ sport_type: 'Kayaking' }) === 'other', 'unknown sport -> other');
  // Falls back to the activity name when the sport type is blank.
  assert(sportKeyFor({ sport_type: '', name: 'Morning Run' }) === 'run', 'name used when type blank');

  // --- load of one activity --------------------------------------------
  assert(loadOf({ rooka_score: 72, moving_time_min: 60 }) === 72, 'prefers rooka_score');
  assert(loadOf({ rooka_score: null, moving_time_min: 60 }) === 72, 'falls back to minutes * 1.2');
  assert(loadOf({ rooka_score: 0, moving_time_min: 0 }) === 0, 'no signal -> 0');

  // --- saturation curve -------------------------------------------------
  assert(saturate(0) === 0, 'no load reads 0');
  assert(saturate(REFERENCE_LOAD) === 63, 'reference load reads 63');
  assert(saturate(1e9) < 100, 'never reaches 100');
  assert(saturate(200) > saturate(100), 'monotonic in load');
  // The bug being fixed: the old model clamped, so two very different weeks
  // showed the same number. This one has to separate them.
  assert(saturate(400) > saturate(300) + 1, 'heavy weeks stay distinguishable');

  // --- recency ----------------------------------------------------------
  assert(ageInDays(null, NOW) === 0, 'missing date -> age 0');
  assert(Math.round(ageInDays(act(3, 'Run', 60).start_date!, NOW)) === 3, 'age in whole days');
  // A future-dated activity must not be amplified by a negative exponent.
  assert(ageInDays(new Date(NOW.getTime() + 86400000).toISOString(), NOW) === 0, 'future -> 0');

  const today = decayedMuscleLoad([act(0, 'Run', 60)], NOW);
  const sixDaysAgo = decayedMuscleLoad([act(6, 'Run', 60)], NOW);
  assert(today.quads > sixDaysAgo.quads, 'today counts more than six days ago');
  const ratio = sixDaysAgo.quads / today.quads;
  assert(
    Math.abs(ratio - retentionAt(6)) < 0.01,
    `six-day retention should be ~${retentionAt(6).toFixed(3)}, got ${ratio.toFixed(3)}`
  );

  // --- the window edge is continuous -----------------------------------
  // Raw DAILY_RETENTION^7 is still 0.17, so before the taper an activity fell
  // off the window carrying 17% of its load and the reading dropped ~11 points
  // between two consecutive reads. Nothing happens to a muscle at 168 hours.
  assert(Math.abs(retentionAt(0) - 1) < 1e-9, 'a session today counts in full');
  assert(Math.abs(retentionAt(WINDOW_DAYS)) < 1e-9, 'weight reaches 0 at the window edge');
  assert(retentionAt(1) > retentionAt(2), 'retention is monotonically decreasing');
  assert(retentionAt(3) > retentionAt(6), 'retention is monotonically decreasing');

  const hardSession = [act(0, 'Ride', 180, 1.2)];
  const justInside = fatiguePercentages(
    hardSession.map((a) => ({ ...a, start_date: new Date(NOW.getTime() - (WINDOW_DAYS * 86400000 - 3600000)).toISOString() })),
    NOW
  );
  const justOutside = fatiguePercentages(
    hardSession.map((a) => ({ ...a, start_date: new Date(NOW.getTime() - (WINDOW_DAYS * 86400000 + 3600000)).toISOString() })),
    NOW
  );
  for (const m of MUSCLE_GROUPS) {
    assert(
      Math.abs(justInside[m] - justOutside[m]) <= 1,
      `${m} must not jump across the window edge: ${justInside[m]} -> ${justOutside[m]}`
    );
  }

  // Decay is continuous in time, not a nightly step: six hours of rest after a
  // hard session has to register.
  const ride = act(0, 'Ride', 180, 1.2);
  const atSix = fatiguePercentages(
    [{ ...ride, start_date: new Date(NOW.getTime() - 6 * 3600000).toISOString() }],
    NOW
  );
  const atZero = fatiguePercentages([ride], NOW);
  assert(atZero.quads > atSix.quads, 'a muscle recovers within the same day');

  // Outside the window it does not count at all.
  const outside = decayedMuscleLoad([act(30, 'Run', 60)], NOW);
  assert(outside.quads === 0, 'activities older than the window are excluded');

  // --- the four defects of the old model --------------------------------
  // 1. No floor: a week with no training reads zero, not 30%.
  const restWeek = fatiguePercentages([], NOW);
  for (const m of MUSCLE_GROUPS) {
    assert(restWeek[m] === 0, `${m} should read 0 on a rest week, got ${restWeek[m]}`);
  }

  // 2. Duration matters: the old model gave both of these the same score.
  const shortJog = fatiguePercentages([act(0, 'Run', 25)], NOW);
  const longRun = fatiguePercentages([act(0, 'Run', 150)], NOW);
  assert(longRun.quads > shortJog.quads * 2, 'a long run outweighs a short jog');

  // 3 & 4. An ordinary week lands in the card's "Moderate" band (35-64)
  // instead of pinning three muscles to 95.
  const ordinaryWeek = [
    act(0, 'Run', 45),
    act(2, 'Run', 60),
    act(5, 'Run', 50),
    act(1, 'Ride', 90),
    act(4, 'Ride', 90),
  ];
  const ordinary = fatiguePercentages(ordinaryWeek, NOW);
  assert(
    ordinary.quads >= 35 && ordinary.quads <= 64,
    `ordinary week quads should be Moderate, got ${ordinary.quads}`
  );
  const pinned = MUSCLE_GROUPS.filter((m) => ordinary[m] >= 90).length;
  assert(pinned === 0, `no muscle should read 90+ on an ordinary week, got ${pinned}`);

  // A heavy block does reach High Fatigue, so the band still means something.
  const bigBlock = [
    act(0, 'Run', 60),
    act(1, 'Run', 45),
    act(3, 'Run', 75, 1.35),
    act(4, 'Run', 40),
    act(6, 'Run', 90),
    act(1, 'Ride', 180),
    act(2, 'Ride', 75),
    act(5, 'Ride', 120),
  ];
  const heavy = fatiguePercentages(bigBlock, NOW);
  assert(heavy.quads >= 65, `heavy block quads should be High Fatigue, got ${heavy.quads}`);
  assert(heavy.quads > ordinary.quads, 'heavy block outranks ordinary week');

  // --- ranking is preserved --------------------------------------------
  // The sport-to-muscle mapping was the part of the old model that was right.
  assert(ordinary.quads > ordinary.core, 'endurance week loads quads over core');
  assert(ordinary.calves > ordinary.upper, 'running loads calves over upper body');
  const swimWeek = fatiguePercentages([act(0, 'Swim', 60), act(2, 'Swim', 60)], NOW);
  assert(swimWeek.upper > swimWeek.calves, 'swimming loads upper body over calves');
  const gymWeek = fatiguePercentages(
    [act(0, 'WeightTraining', 50, 0.7), act(2, 'WeightTraining', 50, 0.7)],
    NOW
  );
  assert(gymWeek.upper > gymWeek.calves, 'lifting loads upper body over calves');

  // --- robustness -------------------------------------------------------
  const junk = fatiguePercentages(
    [
      { sport_type: null, start_date: null, rooka_score: null, moving_time_min: null },
      { sport_type: 'Run', start_date: 'not-a-date', rooka_score: 50 },
      { sport_type: 'Ride', start_date: act(1, 'Ride', 60).start_date, rooka_score: -5, moving_time_min: -5 },
    ],
    NOW
  );
  for (const m of MUSCLE_GROUPS) {
    assert(Number.isFinite(junk[m]), `${m} stays finite on malformed input`);
    assert(junk[m] >= 0 && junk[m] < 100, `${m} stays in range on malformed input`);
  }

  // --- the agreed calibration ------------------------------------------
  // These four readings were signed off explicitly. A change to REFERENCE_LOAD,
  // DAILY_RETENTION or the taper that moves them is a recalibration and needs
  // saying out loud, not a silent constant edit.
  const CALIBRATION: [string, MuscleLoadActivity[], number][] = [
    ['race taper', [act(0, 'Run', 25), act(2, 'Run', 30, 1.35), act(4, 'Ride', 40)], 19],
    ['ordinary week', ordinaryWeek, 55],
    [
      'ordinary + gym',
      [...ordinaryWeek, act(1, 'WeightTraining', 50, 0.7), act(4, 'WeightTraining', 50, 0.7)],
      65,
    ],
    ['big block', bigBlock, 80],
  ];
  for (const [label, acts, expectedQuads] of CALIBRATION) {
    const got = fatiguePercentages(acts, NOW).quads;
    assert(
      got === expectedQuads,
      `${label} quads should read ${expectedQuads}% as agreed, got ${got}%`
    );
  }

  console.log('[MuscleLoad Unit Tests] All muscle load tests passed successfully!');
}

if (typeof require !== 'undefined' && require.main === module) {
  runMuscleLoadTests();
}
