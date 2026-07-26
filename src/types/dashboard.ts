export type SportType = 'SWIM' | 'BIKE' | 'RUN' | 'STRENGTH' | 'MOBILITY' | 'REST';

export interface WorkoutItem {
  id: string;
  day: string; // e.g. 'MON', 'TUE', 'FRI'
  dateStr: string; // e.g. 'Jul 24'
  type: SportType;
  title: string;
  duration?: string;
  sparkPoints: number;
  isStructured?: boolean;
  isCompleted?: boolean;
  actualDuration?: string;
  actualMetrics?: string; // e.g. "158 avg bpm · 245W · 4:12/km"
  executionScore?: number; // e.g. 98 (% target hit)
  notes?: string;
}

export interface NutritionMacro {
  carbs: number;
  carbsTarget: number;
  protein: number;
  proteinTarget: number;
  fat: number;
  fatTarget: number;
  focusTitle: string;
  rationale: string;
}

export interface MacroPeriodInfo {
  raceTargetName: string;
  daysRemaining: number;
  currentPhaseIndex: number; // 0: Base, 1: Build, 2: Peak, 3: Taper
  targetCTL: number;
  currentCTL: number;
  phases: {
    name: string;
    weeks: string;
    focus: string;
    progressPercent: number; // 0-100 for current phase
  }[];
}
