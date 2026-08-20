export type SportType = 'SWIM' | 'BIKE' | 'RUN' | 'STRENGTH' | 'MOBILITY' | 'REST';

export interface ActivityLap {
  lap_index: number;
  distance_km: number;
  elapsed_time_min: number;
  split_pace?: string;
  average_heartrate?: number;
  elevation_gain_m?: number;
}

export interface StrengthSetItem {
  exerciseName: string;
  weight?: number;
  reps?: number;
  durationSec?: number;
  completed?: boolean;
}

export interface Activity {
  id: string | number;
  user_id?: number;
  name: string;
  sport_type: SportType | string;
  distance_km: number;
  elevation_m?: number;
  moving_time_min: number;
  average_heartrate?: number;
  max_heartrate?: number;
  average_power_w?: number;
  start_date: string;
  tss?: number;
  rooka_score?: number;
  sets_json?: string;
  polyline?: string;
  kudos_count?: number;
  has_kudosed?: boolean;
  comments_count?: number;
  laps?: ActivityLap[];
  type?: SportType | string;
  moving_time?: number;
  elapsed_time?: number;
  distance?: number;
  total_elevation_gain?: number;
  start_date_local?: string;
  average_speed?: number;
  source?: string;
}

export interface PMCDataPoint {
  date: string;
  ctl: number; // Fitness
  atl: number; // Fatigue
  tsb: number; // Form
}
