export type SportType = 'RUN' | 'BIKE' | 'SWIM' | 'STRENGTH' | 'MOBILITY' | 'REST';

export interface WorkoutStep {
  id?: string;
  type: 'warmup' | 'interval' | 'recovery' | 'cooldown' | 'repeat' | 'rest';
  condition_type?: 'time' | 'time_sec' | 'distance' | 'distance_km' | 'reps';
  condition_value?: number;
  target_type?: 'no.target' | 'heart.rate.zone' | 'power.zone' | 'power.exact' | 'pace.zone' | 'pace.exact' | 'speed.zone' | 'speed.exact' | 'weight';
  zone?: number;
  weight?: number;
  exerciseName?: string;
  garmin_exercise_name?: string;
  garmin_category_key?: string;
  garmin_exercise_key?: string;
  iterations?: number;
  steps?: WorkoutStep[];
  target_value?: string;
  notes?: string;
}

export interface WorkoutItem {
  id: string;
  day?: string;
  dateStr?: string;
  date?: string;
  type: SportType;
  sport?: SportType | string;
  title: string;
  duration: string;
  rookaPoints: number;
  sparkPoints?: number;
  isStructured: boolean;
  steps?: WorkoutStep[];
  isCompleted: boolean;
  actualMetrics?: string | {
    avgHr?: number;
    maxHr?: number;
    avgPower?: number;
    normalizedPower?: number;
    distanceKm?: number;
    durationMins?: number;
    calories?: number;
  };
  executionScore?: number;
  notes?: string;
  coachNote?: string;
  isCoachCreated?: boolean;
  source?: string;
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
  loggedItems?: string | string[];
  loggedCarbs?: number;
  loggedProtein?: number;
  loggedFat?: number;
}

export interface DayAgenda {
  dayName: string;
  dateStr: string;
  isToday?: boolean;
  isPast?: boolean;
  workouts: WorkoutItem[];
}

export interface TrainingPhaseDetail {
  name: string;
  weeks: string;
  focus: string;
  description: string;
  status: 'completed' | 'active' | 'upcoming';
  progressPercent?: number;
  achievementLabel?: string;
  targetCTL?: number;
  achievedCTL?: number;
}

export interface MacroPeriodInfo {
  raceTargetName: string;
  daysRemaining: number;
  currentPhaseIndex: number;
  targetCTL: number;
  currentCTL: number;
  phases: TrainingPhaseDetail[];
  goalType?: 'race' | 'physiological';
  isPrimaryGoal?: boolean;
  goalLabel?: string;
}
