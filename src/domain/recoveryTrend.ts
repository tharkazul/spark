/**
 * Recovery trend: pure, no React Native, so it runs in plain Node tests
 * (src/domain/__tests__/recoveryTrend.test.ts). Used by computeCardiovascularStrain in
 * services/appleHealthService.ts (Home recovery card, Progress tab, body map).
 */

/** The fields of a day's biometrics the trend reads (AppleHealthDailyBiometrics has them all). */
export interface TrendDay {
  date: string;
  sleep_minutes?: number | null;
  resting_hr?: number | null;
  hrv_rmssd?: number | null;
  hrv_sdnn?: number | null;
}

type Source = 'garmin' | 'apple';
// Garmin's overnight RMSSD when a day has one, else Apple's SDNN; a series never mixes the two
// (same rule as hrvOf / hrvIn / latestHrvSource in appleHealthService.ts).
const hrvSourceOf = (d: TrendDay | null | undefined): Source | null =>
  d?.hrv_rmssd && d.hrv_rmssd > 0 ? 'garmin' : d?.hrv_sdnn && d.hrv_sdnn > 0 ? 'apple' : null;
const hrvIn = (d: TrendDay, source: Source) => (source === 'garmin' ? d.hrv_rmssd : d.hrv_sdnn);
const latestSource = (days: TrendDay[]): Source | null => {
  const latest = [...days].sort((a, b) => b.date.localeCompare(a.date)).find((d) => hrvSourceOf(d));
  return latest ? hrvSourceOf(latest) : null;
};

/**
 * The last week against the athlete's own normal, on top of "today vs the last 7 days".
 * Comparing only with last week can't see a bad stretch: after two weeks of short nights,
 * last week is bad too and a bad day looks normal (tester feedback, 24 Nov 2026).
 *
 * Sleep debt: the last 7 nights against SLEEP_NEED_MIN, one night counting for at most
 * MAX_NIGHT_DEBT_MIN so a night without watch data can't fill the week by itself.
 * HRV and resting HR: their 7-day average against the 3 weeks before (days 8 to 30 back).
 * Values agreed with Rutger on 24 Nov 2026; see RECOVERY_TREND.
 */
export const RECOVERY_TREND = {
  HISTORY_DAYS: 30,
  SLEEP_NEED_MIN: 7 * 60,
  MAX_NIGHT_DEBT_MIN: 150,
  MIN_SLEEP_NIGHTS: 5,
  /** Hours of debt over 7 nights -> points. */
  SLEEP_DEBT_STEPS: [
    { hours: 9, points: 30 },
    { hours: 6, points: 20 },
    { hours: 4, points: 10 },
  ],
  MIN_WEEK_VALUES: 5,
  MIN_BASELINE_VALUES: 10,
  /** HRV 7-day average vs normal (fraction) -> points. */
  HRV_DROP_STEPS: [
    { change: -0.12, points: 25 },
    { change: -0.07, points: 15 },
  ],
  /** Day-to-day HRV variation (coefficient of variation) this high, and this much above normal. */
  HRV_SWING_MIN_CV: 0.1,
  HRV_SWING_VS_NORMAL: 1.5,
  HRV_SWING_POINTS: 10,
  /** Resting HR 7-day average above normal (bpm) -> points. */
  RHR_RISE_STEPS: [
    { delta: 4, points: 20 },
    { delta: 2, points: 10 },
  ],
} as const;

export interface RecoveryTrend {
  points: number;
  /** Minutes short over the last 7 nights (scaled to 7 when a night is missing), or null. */
  sleepDebtMin: number | null;
  /** HRV 7-day average vs normal, as a fraction (-0.08 = 8% lower), or null. */
  hrvWeekChange: number | null;
  hrvSwinging: boolean;
  /** Resting HR 7-day average minus normal, bpm, or null. */
  rhrWeekDelta: number | null;
  /** What added points, biggest first. */
  reasons: ('sleepDebt' | 'hrvDrop' | 'hrvSwings' | 'rhrRise')[];
}

const daysBefore = (date: string, n: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};
const meanOf = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
const cvOf = (a: number[]) => {
  const m = meanOf(a);
  return Math.sqrt(meanOf(a.map((x) => (x - m) ** 2))) / m;
};

export function assessRecoveryTrend(
  today: TrendDay | null | undefined,
  history: TrendDay[] = []
): RecoveryTrend {
  const none: RecoveryTrend = { points: 0, sleepDebtMin: null, hrvWeekChange: null, hrvSwinging: false, rhrWeekDelta: null, reasons: [] };
  if (!today?.date) return none;
  const T = RECOVERY_TREND;
  const byDate = new Map<string, TrendDay>();
  for (const r of history) if (r?.date && r.date < today.date) byDate.set(r.date, r);
  byDate.set(today.date, today);
  const rows = Array.from(byDate.values());
  const weekFrom = daysBefore(today.date, 6);
  const normalFrom = daysBefore(today.date, T.HISTORY_DAYS - 1);
  const week = rows.filter((r) => r.date >= weekFrom);
  const normal = rows.filter((r) => r.date >= normalFrom && r.date < weekFrom);
  const pos = (v: unknown): v is number => typeof v === 'number' && v > 0;
  const scored: { reason: RecoveryTrend['reasons'][number]; points: number }[] = [];

  // Sleep debt
  const nights = week.map((r) => r.sleep_minutes).filter(pos);
  let sleepDebtMin: number | null = null;
  if (nights.length >= T.MIN_SLEEP_NIGHTS) {
    const short = nights.reduce((sum, m) => sum + Math.min(T.MAX_NIGHT_DEBT_MIN, Math.max(0, T.SLEEP_NEED_MIN - m)), 0);
    sleepDebtMin = Math.round((short * 7) / nights.length);
    const step = T.SLEEP_DEBT_STEPS.find((s) => sleepDebtMin! >= s.hours * 60);
    if (step) scored.push({ reason: 'sleepDebt', points: step.points });
  }

  // HRV: one source only (Garmin RMSSD or Apple SDNN), the one today's value comes from.
  const source = hrvSourceOf(today) ?? latestSource(rows);
  let hrvWeekChange: number | null = null;
  let hrvSwinging = false;
  if (source) {
    const hw = week.map((r) => hrvIn(r, source)).filter(pos);
    const hn = normal.map((r) => hrvIn(r, source)).filter(pos);
    if (hw.length >= T.MIN_WEEK_VALUES && hn.length >= T.MIN_BASELINE_VALUES) {
      hrvWeekChange = (meanOf(hw) - meanOf(hn)) / meanOf(hn);
      const step = T.HRV_DROP_STEPS.find((s) => hrvWeekChange! <= s.change);
      if (step) scored.push({ reason: 'hrvDrop', points: step.points });
      const cvWeek = cvOf(hw);
      if (cvWeek >= T.HRV_SWING_MIN_CV && cvWeek >= T.HRV_SWING_VS_NORMAL * cvOf(hn)) {
        hrvSwinging = true;
        scored.push({ reason: 'hrvSwings', points: T.HRV_SWING_POINTS });
      }
    }
  }

  // Resting HR
  const rw = week.map((r) => r.resting_hr).filter(pos);
  const rn = normal.map((r) => r.resting_hr).filter(pos);
  let rhrWeekDelta: number | null = null;
  if (rw.length >= T.MIN_WEEK_VALUES && rn.length >= T.MIN_BASELINE_VALUES) {
    rhrWeekDelta = meanOf(rw) - meanOf(rn);
    const step = T.RHR_RISE_STEPS.find((s) => rhrWeekDelta! >= s.delta);
    if (step) scored.push({ reason: 'rhrRise', points: step.points });
  }

  scored.sort((a, b) => b.points - a.points);
  return {
    points: scored.reduce((sum, s) => sum + s.points, 0),
    sleepDebtMin,
    hrvWeekChange,
    hrvSwinging,
    rhrWeekDelta,
    reasons: scored.map((s) => s.reason),
  };
}
