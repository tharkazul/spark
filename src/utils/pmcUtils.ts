export interface PMCMetricsData {
  ctl: number;
  atl: number;
  tsb: number;
  readinessScore: number;
  weightKg: number;
  ctlDelta: number;
  atlDelta: number;
  ctlHistory: number[];
  atlHistory: number[];
  tsbHistory: number[];
  weightHistory: number[];
}

export interface ActivityForPMC {
  spark_score?: number;
  start_date?: string;
}

/**
 * Calculates PMC (Performance Management Chart) Telemetry metrics & 14-day sparklines
 * based on actual daily Spark scores (TSS equivalent) and body weight history.
 *
 * Formulas:
 * - CTL (Fitness): 42-day Exponential Moving Average (EMA) of daily training load.
 * - ATL (Fatigue): 7-day Exponential Moving Average (EMA) of daily training load.
 * - TSB (Readiness): CTL_yesterday - ATL_yesterday
 */
export function calculatePMCMetrics(
  activities: ActivityForPMC[] = [],
  currentWeightKg: number = 0,
  physiqueLogs: { date?: string; weight_kg?: number }[] = []
): PMCMetricsData {
  const daysToCalculate = 42;
  const historyDays = 14;

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  // Map daily spark scores over past 42 days
  const dailySparkMap = new Map<string, number>();

  activities.forEach((act) => {
    if (!act.start_date) return;
    const dateStr = act.start_date.substring(0, 10);
    const score = act.spark_score || 0;
    dailySparkMap.set(dateStr, (dailySparkMap.get(dateStr) || 0) + score);
  });

  // Calculate daily CTL, ATL, TSB array over past 42 days
  const ctlSeries: number[] = [];
  const atlSeries: number[] = [];
  const tsbSeries: number[] = [];

  let ctl = 0;
  let atl = 0;

  for (let i = daysToCalculate - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];

    const sparkToday = dailySparkMap.get(dateStr) || 0;

    // EMA calculation
    const prevCtl = ctl;
    const prevAtl = atl;

    ctl = prevCtl + (sparkToday - prevCtl) * (1 / 42);
    atl = prevAtl + (sparkToday - prevAtl) * (1 / 7);

    const tsb = prevCtl - prevAtl;

    ctlSeries.push(Math.round(ctl * 10) / 10);
    atlSeries.push(Math.round(atl * 10) / 10);
    tsbSeries.push(Math.round(tsb * 10) / 10);
  }

  const latestCtl = ctlSeries[ctlSeries.length - 1] || 0;
  const latestAtl = atlSeries[atlSeries.length - 1] || 0;
  const latestTsb = tsbSeries[tsbSeries.length - 1] || 0;

  const ctl7DaysAgo = ctlSeries[ctlSeries.length - 8] || latestCtl;
  const atl7DaysAgo = atlSeries[atlSeries.length - 8] || latestAtl;

  const ctlDelta = Math.round((latestCtl - ctl7DaysAgo) * 10) / 10;
  const atlDelta = Math.round((latestAtl - atl7DaysAgo) * 10) / 10;

  // 14-day history for sparkline charts
  const ctlHistory = ctlSeries.slice(-historyDays);
  const atlHistory = atlSeries.slice(-historyDays);
  const tsbHistory = tsbSeries.slice(-historyDays);

  // Body weight history over past 14 days
  const weightMap = new Map<string, number>();
  physiqueLogs.forEach((log) => {
    if (log.date && log.weight_kg) {
      weightMap.set(log.date.substring(0, 10), log.weight_kg);
    }
  });

  const weightHistory: number[] = [];
  let runningWeight = currentWeightKg;

  for (let i = historyDays - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];

    if (weightMap.has(dateStr)) {
      runningWeight = weightMap.get(dateStr)!;
    }
    weightHistory.push(Math.round(runningWeight * 10) / 10);
  }

  // Calculate readiness score (0-100)
  const readinessScore = Math.min(
    100,
    Math.max(0, Math.round(50 + Math.max(-30, Math.min(30, latestTsb * 1.5))))
  );

  return {
    ctl: latestCtl,
    atl: latestAtl,
    tsb: latestTsb,
    readinessScore,
    weightKg: runningWeight,
    ctlDelta,
    atlDelta,
    ctlHistory,
    atlHistory,
    tsbHistory,
    weightHistory,
  };
}
