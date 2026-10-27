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
  fitnessTargetRange?: { targetUpper: number; targetLower: number };
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
 * Calculates a dynamic fitness target range that creeps upwards as fitness increases.
 * - When an athlete had a historical peak (e.g. hit 30 before a break), that peak serves as the green target.
 * - Once their fitness reaches or exceeds that level (30+), the target creeps upward to the next milestone (e.g. 40).
 * - A lower threshold (~50% of the target) serves as the red maintenance floor.
 */
export function calculateFitnessTargetRange(
  currentCtl: number,
  history: { ctl: number }[] = []
): { targetUpper: number; targetLower: number } {
  const allCtls = history.map((h) => h.ctl).filter((v) => typeof v === 'number' && !isNaN(v));
  if (currentCtl > 0) allCtls.push(currentCtl);

  const maxHistorical = allCtls.length > 0 ? Math.max(...allCtls) : currentCtl;

  let targetUpper: number;
  if (maxHistorical <= 0) {
    targetUpper = 20;
  } else if (currentCtl >= maxHistorical * 0.92) {
    // Athlete is at or near their personal peak: target creeps upwards to the next progressive step!
    const step = 10;
    targetUpper = Math.max(Math.ceil((currentCtl + 1) / step) * step, Math.round(currentCtl * 1.2));
  } else {
    // Athlete had a break or is rebuilding towards their established benchmark
    targetUpper = Math.max(Math.ceil(maxHistorical), 20);
  }

  // Lower maintenance floor (red dashed line)
  const targetLower = Math.max(0, Math.round(targetUpper * 0.5));

  return { targetUpper, targetLower };
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
  const fitnessTargetRange = calculateFitnessTargetRange(result.currentCtl, history);

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
    fitnessTargetRange,
  };
}
