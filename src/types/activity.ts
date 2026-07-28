export type SportType = 'SWIM' | 'BIKE' | 'RUN' | 'STRENGTH' | 'MOBILITY' | 'REST';

export interface Activity {
  id: string | number;
  user_id?: number;
  name: string;
  sport_type: SportType | string;
  distance_km: number;
  elevation_m?: number;
  moving_time_min: number;
  average_heartrate?: number;
  start_date: string;
  tss?: number;
  spark_score?: number;
  sets_json?: string;
  kudos_count?: number;
}

export interface PMCDataPoint {
  date: string;
  ctl: number; // Fitness
  atl: number; // Fatigue
  tsb: number; // Form
}
