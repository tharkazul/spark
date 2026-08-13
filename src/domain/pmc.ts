import { Activity } from '../types/activity';
import { PhysiqueEntry } from '../types/physique';

export type TsbStatus = 'Overreaching' | 'Optimal Training' | 'Maintaining' | 'Fresh / Tapering' | 'Detraining';
export type ReadinessCategory = 'Need Recovery' | 'Adequate' | 'Prime Condition';

export interface PMCDayPoint {
  date: string;
  spark: number;
  ctl: number;
  atl: number;
  tsb: number;
  weight: number | null;
  targetCtl: number | null;
  isFuture: boolean;
}

export interface PMCRecentTrends {
  ctlDelta7: number;
  atlDelta7: number;
  readinessDelta7: number;
}

export interface ReadinessResult {
  score: number;
  category: ReadinessCategory;
  tsbContribution: number;
  sleepAdjustment: number;
  fatigueAdjustment: number;
}

export interface GoalMilestone {
  date: string;
  name?: string;
  target_ctl: number;
}

export interface GoalProjection {
  targetCtl: number;
  daysOut: number;
  currentCtl: number;
  rampRateWeekly: number;
  projectedCtl: number;
  progressPercent: number;
  statusText: string;
  statusType: 'success' | 'warning' | 'accent' | 'ready';
}

export interface PMCComputationResult {
  currentCtl: number;
  currentAtl: number;
  currentTsb: number;
  tsbStatus: TsbStatus;
  readiness: ReadinessResult;
  history: PMCDayPoint[];
  futureProjection: PMCDayPoint[];
  trends: PMCRecentTrends;
  goalProjection: GoalProjection | null;
}

export function getTsbStatus(tsb: number): TsbStatus {
  if (tsb < -30) return 'Overreaching';
  if (tsb < -10) return 'Optimal Training';
  if (tsb < 5) return 'Maintaining';
  if (tsb < 25) return 'Fresh / Tapering';
  return 'Detraining';
}

export function calculateReadiness(tsb: number, latestPhysique?: PhysiqueEntry | null): ReadinessResult {
  let score = 50; // Base score
  const tsbContribution = Math.max(-20, Math.min(20, tsb * 0.5));
  score += tsbContribution;

  let sleepAdjustment = 0;
  let fatigueAdjustment = 0;

  if (latestPhysique) {
    const todayStr = new Date().toISOString().split('T')[0];
    const yesterdayStr = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    if (latestPhysique.date === todayStr || latestPhysique.date === yesterdayStr) {
      if (typeof latestPhysique.sleep_quality === 'number') {
        sleepAdjustment = (latestPhysique.sleep_quality - 3) * 10;
      }
      if (typeof latestPhysique.fatigue_level === 'number') {
        fatigueAdjustment = -(latestPhysique.fatigue_level - 3) * 10;
      }
    }
  }

  score = Math.max(0, Math.min(100, Math.round(score + sleepAdjustment + fatigueAdjustment)));

  let category: ReadinessCategory = 'Adequate';
  if (score < 40) {
    category = 'Need Recovery';
  } else if (score >= 70) {
    category = 'Prime Condition';
  }

  return {
    score,
    category,
    tsbContribution,
    sleepAdjustment,
    fatigueAdjustment,
  };
}

export function calculatePMC(
  activities: (Activity & { date?: string; daily_spark?: number; spark?: number })[] = [],
  physiqueLogs: PhysiqueEntry[] = [],
  goalMilestones: GoalMilestone[] = []
): PMCComputationResult {
  const sparkDict: Record<string, number> = {};
  activities.forEach((act) => {
    const rawDate = act.start_date || act.date;
    if (rawDate) {
      const dateStr = rawDate.split('T')[0];
      const sparkVal =
        typeof act.spark_score === 'number'
          ? act.spark_score
          : typeof act.daily_spark === 'number'
          ? act.daily_spark
          : typeof act.tss === 'number'
          ? act.tss
          : act.spark || 0;
      sparkDict[dateStr] = (sparkDict[dateStr] || 0) + sparkVal;
    }
  });

  const weightMap: Record<string, number> = {};
  physiqueLogs.forEach((p) => {
    if (p.date && typeof p.weight_kg === 'number') {
      weightMap[p.date.split('T')[0]] = p.weight_kg;
    }
  });

  const todayStr = new Date().toISOString().split('T')[0];
  let startDateStr = todayStr;

  const activityDates = activities
    .map((a) => (a.start_date || a.date)?.split('T')[0])
    .filter(Boolean) as string[];
  const weightDates = Object.keys(weightMap);

  if (activityDates.length > 0 || weightDates.length > 0) {
    const allDates = [...activityDates, ...weightDates].sort();
    startDateStr = allDates[0];
  }

  const history: PMCDayPoint[] = [];
  let ctl = 0;
  let atl = 0;

  const curDate = new Date(startDateStr);
  const todayDate = new Date(todayStr);

  while (curDate <= todayDate) {
    const str = curDate.toISOString().split('T')[0];
    const spark = sparkDict[str] || 0;

    ctl += (spark - ctl) / 42;
    atl += (spark - atl) / 7;
    const tsb = ctl - atl;

    history.push({
      date: str,
      spark,
      ctl,
      atl,
      tsb,
      weight: weightMap[str] || null,
      targetCtl: null,
      isFuture: false,
    });

    curDate.setDate(curDate.getDate() + 1);
  }

  const currentCtl = history.length > 0 ? history[history.length - 1].ctl : 0;
  const currentAtl = history.length > 0 ? history[history.length - 1].atl : 0;
  const currentTsb = currentCtl - currentAtl;
  const tsbStatus = getTsbStatus(currentTsb);

  const latestPhysique = physiqueLogs.length > 0 ? physiqueLogs[0] : null;
  const readiness = calculateReadiness(currentTsb, latestPhysique);

  // Calculate 7-day trend deltas
  const idx7 = Math.max(0, history.length - 8);
  const ctl7 = history[idx7]?.ctl ?? currentCtl;
  const atl7 = history[idx7]?.atl ?? currentAtl;
  const tsb7 = ctl7 - atl7;
  const readiness7Score = calculateReadiness(tsb7, null).score;

  const trends: PMCRecentTrends = {
    ctlDelta7: Math.round((currentCtl - ctl7) * 10) / 10,
    atlDelta7: Math.round((currentAtl - atl7) * 10) / 10,
    readinessDelta7: Math.round(readiness.score - readiness7Score),
  };

  // Goal Trajectory and Future Projections
  const futureProjection: PMCDayPoint[] = [];
  let goalProjection: GoalProjection | null = null;

  if (goalMilestones.length > 0) {
    const sortedMilestones = [...goalMilestones].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    const mainRace = sortedMilestones[sortedMilestones.length - 1];
    const raceDateStr = mainRace.date.split('T')[0];
    const raceDate = new Date(raceDateStr);

    const daysOut = Math.max(0, Math.round((raceDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24)));

    // Ramp rate calculated over last 14 days
    const fourteenDaysAgoStr = new Date(todayDate.getTime() - 14 * 86400000).toISOString().split('T')[0];
    const pastIdx = history.findIndex((h) => h.date === fourteenDaysAgoStr);
    const ctl14 = pastIdx !== -1 ? history[pastIdx].ctl : (history[0]?.ctl ?? currentCtl);

    const rampRateWeekly = ((currentCtl - ctl14) / 14) * 7;
    const projectedCtl = currentCtl + rampRateWeekly * (daysOut / 7);
    const progressPercent = Math.min(100, Math.max(0, (currentCtl / mainRace.target_ctl) * 100));

    let statusText = '';
    let statusType: 'success' | 'warning' | 'accent' | 'ready' = 'accent';

    if (daysOut === 0) {
      statusText = 'Race day is here! Good luck!';
      statusType = 'ready';
    } else if (rampRateWeekly <= 0.1) {
      statusText = 'You are not currently building fitness. Start training consistently to project race day CTL.';
      statusType = 'warning';
    } else {
      statusText = `Building at +${rampRateWeekly.toFixed(1)} CTL/wk. Projected race day fitness: ${Math.round(projectedCtl)} CTL.`;
      statusType = projectedCtl >= mainRace.target_ctl ? 'success' : 'accent';
    }

    goalProjection = {
      targetCtl: mainRace.target_ctl,
      daysOut,
      currentCtl: Math.round(currentCtl),
      rampRateWeekly: Math.round(rampRateWeekly * 10) / 10,
      projectedCtl: Math.round(projectedCtl),
      progressPercent: Math.round(progressPercent),
      statusText,
      statusType,
    };

    // Project future timeline up to 7 days past main race
    const endDate = new Date(raceDate);
    endDate.setDate(endDate.getDate() + 7);

    const controlPoints = [
      { date: new Date(todayStr), ctl: currentCtl },
      ...sortedMilestones.map((m) => ({ date: new Date(m.date.split('T')[0]), ctl: m.target_ctl })),
    ].sort((a, b) => a.date.getTime() - b.date.getTime());

    let projDate = new Date(todayDate);
    projDate.setDate(projDate.getDate() + 1);

    let ctrlIdx = 0;
    while (projDate <= endDate) {
      const dateStr = projDate.toISOString().split('T')[0];

      while (ctrlIdx < controlPoints.length - 1 && projDate > controlPoints[ctrlIdx + 1].date) {
        ctrlIdx++;
      }

      const p1 = controlPoints[ctrlIdx];
      const p2 = controlPoints[ctrlIdx + 1] || p1;
      let targetCtlVal = p1.ctl;
      if (p1.date.getTime() < p2.date.getTime()) {
        const ratio = (projDate.getTime() - p1.date.getTime()) / (p2.date.getTime() - p1.date.getTime());
        targetCtlVal = p1.ctl + (p2.ctl - p1.ctl) * ratio;
      }

      futureProjection.push({
        date: dateStr,
        spark: 0,
        ctl: 0,
        atl: 0,
        tsb: 0,
        weight: weightMap[dateStr] || null,
        targetCtl: Math.round(targetCtlVal * 10) / 10,
        isFuture: true,
      });

      projDate.setDate(projDate.getDate() + 1);
    }
  }

  return {
    currentCtl: Math.round(currentCtl * 10) / 10,
    currentAtl: Math.round(currentAtl * 10) / 10,
    currentTsb: Math.round(currentTsb * 10) / 10,
    tsbStatus,
    readiness,
    history,
    futureProjection,
    trends,
    goalProjection,
  };
}
