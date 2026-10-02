import { calculatePMC } from '../domain/pmc';
import { Activity } from '../types/activity';
import { PhysiqueEntry } from '../types/physique';

import { SparklinePoint } from '../components/common/Sparkline';

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
  weightPoints: SparklinePoint[];
  fullHistory: any[];
}

export interface ActivityForPMC {
  rooka_score?: number;
  start_date?: string;
  date?: string;
  daily_rooka?: number;
  rooka?: number;
  tss?: number;
}

/**
 * Calculates PMC (Performance Management Chart) Telemetry metrics & sparklines
 * using the domain pmc calculation module (src/domain/pmc.ts).
 */
export function calculatePMCMetrics(
  activities: ActivityForPMC[] = [],
  currentWeightKg: number = 0,
  physiqueLogs: PhysiqueEntry[] = []
): PMCMetricsData {
  const result = calculatePMC(activities as Activity[], physiqueLogs);

  const historyDays = 14;
  const history = result.history;

  const ctlHistory = history.slice(-historyDays).map((h) => Math.round(h.ctl * 10) / 10);
  const atlHistory = history.slice(-historyDays).map((h) => Math.round(h.atl * 10) / 10);
  const tsbHistory = history.slice(-historyDays).map((h) => Math.round(h.tsb * 10) / 10);

  const latestPhysiqueWeight = physiqueLogs.length > 0 ? physiqueLogs[0].weight_kg ?? currentWeightKg : currentWeightKg;

  // Build weight history from actual measurement logs (do not fake interpolate empty days)
  const sortedLogs = [...physiqueLogs]
    .filter((p) => p.date && typeof p.weight_kg === 'number')
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const recentLogs = sortedLogs.filter((p) => new Date(p.date).getTime() >= ninetyDaysAgo.getTime());
  const logsToUse = recentLogs.length > 0 ? recentLogs : sortedLogs;

  const weightHistory: number[] = logsToUse.map((p) => Math.round(p.weight_kg * 10) / 10);
  const weightPoints: SparklinePoint[] = logsToUse.map((p) => ({
    val: Math.round(p.weight_kg * 10) / 10,
    date: p.date,
  }));
  if (weightHistory.length === 0 && currentWeightKg > 0) {
    const defaultVal = Math.round(currentWeightKg * 10) / 10;
    weightHistory.push(defaultVal);
    weightPoints.push({ val: defaultVal, date: new Date() });
  }

  const runningWeight = logsToUse.length > 0
    ? logsToUse[logsToUse.length - 1].weight_kg
    : latestPhysiqueWeight;

  return {
    ctl: result.currentCtl,
    atl: result.currentAtl,
    tsb: result.currentTsb,
    readinessScore: result.readiness.score,
    weightKg: runningWeight,
    ctlDelta: result.trends.ctlDelta7,
    atlDelta: result.trends.atlDelta7,
    ctlHistory,
    atlHistory,
    tsbHistory,
    weightHistory,
    weightPoints,
    fullHistory: result.history,
  };
}
