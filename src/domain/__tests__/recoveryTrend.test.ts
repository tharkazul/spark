// Run: npx sucrase-node src/domain/__tests__/recoveryTrend.test.ts
// The recovery trend agreed on 24 Nov 2026: 7 nights against a 7h00 need, HRV and resting HR
// over the last week against the 3 weeks before. Synthetic numbers, no athlete's data.
import { assessRecoveryTrend, RECOVERY_TREND, TrendDay } from '../recoveryTrend';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}
const eq = (a: unknown, b: unknown, message: string) =>
  assert(JSON.stringify(a) === JSON.stringify(b), `${message} (got ${JSON.stringify(a)}, expected ${JSON.stringify(b)})`);

const TODAY = '2026-11-24';
const dayBack = (n: number) => {
  const d = new Date(`${TODAY}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

/** 30 days, oldest first, built from (daysBack) => fields. Index 0 of the result is today. */
function days(f: (back: number) => Partial<TrendDay>): TrendDay[] {
  return Array.from({ length: RECOVERY_TREND.HISTORY_DAYS }, (_, back) => ({ date: dayBack(back), ...f(back) })).reverse();
}
const run = (history: TrendDay[]) => assessRecoveryTrend(history[history.length - 1], history);

export function runRecoveryTrendTests() {
  // A steady athlete sleeping 7h30: nothing.
  const steady = days(() => ({ sleep_minutes: 450, hrv_rmssd: 100, resting_hr: 45 }));
  eq(run(steady).points, 0, 'steady weeks add nothing');
  eq(run(steady).sleepDebtMin, 0, 'no sleep debt at 7h30');

  // Sleep debt against 7h00: 6h every night is 7h short over the week.
  const sixHours = days(() => ({ sleep_minutes: 360, hrv_rmssd: 100, resting_hr: 45 }));
  eq(run(sixHours).sleepDebtMin, 420, '6h a night is 7h short');
  eq(run(sixHours).points, 20, '6h+ of debt: +20');
  eq(run(sixHours).reasons, ['sleepDebt'], 'sleep debt is the reason');
  eq(run(days((b) => ({ sleep_minutes: b < 7 ? 380 : 450 }))).points, 10, '6h20 a night (4h40 short): +10');
  eq(run(days((b) => ({ sleep_minutes: b < 7 ? 380 : 450 }))).sleepDebtMin, 280, '6h20 a night is 4h40 short');
  eq(run(days((b) => ({ sleep_minutes: b < 7 ? 340 : 450 }))).points, 30, '5h40 a night (9h20 short): +30');
  eq(run(days((b) => ({ sleep_minutes: b < 7 ? 270 : 450 }))).sleepDebtMin, 7 * 150, '4h30 a night: 2h30 short each, 17h30');

  // One night without watch data counts for at most 2h30.
  const oneBadNight = days((b) => ({ sleep_minutes: b === 3 ? 20 : 420 }));
  eq(run(oneBadNight).sleepDebtMin, 150, 'one 20-minute night counts as 2h30 short');
  eq(run(oneBadNight).points, 0, 'and alone adds nothing');

  // Missing nights: the debt of the known nights, scaled to a week; under 5 nights, no verdict.
  const fiveNights = days((b) => ({ sleep_minutes: b === 1 || b === 2 ? undefined : 360 }));
  eq(run(fiveNights).sleepDebtMin, 420, 'five 6h nights scale to 7h short');
  eq(run(days((b) => ({ sleep_minutes: b < 7 && b > 2 ? undefined : 300 }))).sleepDebtMin, null, 'three nights: no sleep verdict');

  // HRV week average against the 3 weeks before.
  eq(run(days((b) => ({ hrv_rmssd: b < 7 ? 92 : 100 }))).points, 15, 'HRV -8%: +15');
  eq(run(days((b) => ({ hrv_rmssd: b < 7 ? 87 : 100 }))).points, 25, 'HRV -13%: +25');
  eq(run(days((b) => ({ hrv_rmssd: b < 7 ? 95 : 100 }))).points, 0, 'HRV -5%: nothing');
  eq(run(days((b) => ({ hrv_rmssd: b < 7 ? 87 : b < 22 ? 100 : undefined }))).points, 25, '15 baseline nights are enough');
  eq(run(days((b) => ({ hrv_rmssd: b < 7 ? 87 : b < 15 ? 100 : undefined }))).hrvWeekChange, null, '8 baseline nights are not');

  // HRV swinging: day-to-day variation of 10%+ and 1.5x the usual.
  const swings = run(days((b) => ({ hrv_rmssd: b < 7 ? (b % 2 ? 85 : 115) : b % 2 ? 98 : 102 })));
  eq(swings.hrvSwinging, true, 'HRV jumping 85/115 after weeks of 98/102 swings');
  eq(swings.points, 10, 'swings alone: +10 (the average stayed level)');
  eq(run(days((b) => ({ hrv_rmssd: b % 2 ? 85 : 115 }))).hrvSwinging, false, 'always this jumpy is this athlete\'s normal');

  // A source switch (Apple SDNN before, Garmin now) doesn't compare apples with Garmins.
  const switched = run(days((b) => (b < 7 ? { hrv_rmssd: 60 } : { hrv_sdnn: 100 })));
  eq(switched.hrvWeekChange, null, 'no HRV verdict across sources');

  // Resting HR week average.
  eq(run(days((b) => ({ resting_hr: b < 7 ? 47 : 45 }))).points, 10, 'RHR +2: +10');
  eq(run(days((b) => ({ resting_hr: b < 7 ? 50 : 45 }))).points, 20, 'RHR +5: +20');
  eq(run(days((b) => ({ resting_hr: b < 7 ? 46 : 45 }))).points, 0, 'RHR +1: nothing');

  // Everything at once, biggest reason first.
  const all = run(days((b) => ({ sleep_minutes: b < 7 ? 330 : 450, hrv_rmssd: b < 7 ? 86 : 100, resting_hr: b < 7 ? 50 : 45 })));
  eq(all.reasons, ['sleepDebt', 'hrvDrop', 'rhrRise'], 'reasons sorted by points (5h30 a night is 10h30 short: +30)');
  eq(all.points, 30 + 25 + 20, 'points add up');

  // Only days before today count as history; a later day (clock skew) is ignored.
  const withFuture = [...steady, { date: '2026-11-25', sleep_minutes: 60, hrv_rmssd: 40, resting_hr: 70 }];
  eq(assessRecoveryTrend(steady[steady.length - 1], withFuture).points, 0, 'a day after today is ignored');
  eq(assessRecoveryTrend(null, steady).points, 0, 'no today, no trend');

  console.log('✅ Recovery trend: sleep debt vs 7h00, HRV and resting HR vs the 3 weeks before');
}

runRecoveryTrendTests();
