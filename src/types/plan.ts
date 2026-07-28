import { SportType } from './activity';

export interface WorkoutStep {
  type: 'warmup' | 'interval' | 'recovery' | 'cooldown' | 'repeat' | 'rest';
  condition_type?: 'time' | 'time_sec' | 'distance' | 'reps';
  condition_value?: number;
  target_type?: 'no.target' | 'heart.rate.zone' | 'power.zone' | 'pace.zone' | 'pace.exact' | 'speed.zone';
  zone?: number;
  weight?: number;
  exerciseName?: string;
  iterations?: number;
  steps?: WorkoutStep[];
  target_value?: string;
  notes?: string;
}

export interface PlannedWorkout {
  id: string | number;
  user_id?: number;
  date: string; // YYYY-MM-DD
  day?: string; // 'MON', 'TUE'
  sport: SportType | string;
  description: string;
  target_spark: number;
  details?: string;
  steps_json?: string | WorkoutStep[];
  isCompleted?: boolean;
  actualMetrics?: string;
  executionScore?: number;
}
