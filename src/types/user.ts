export type SubscriptionTier = 'free' | 'spark_plus';

export interface UserProfile {
  id: number;
  username: string;
  email?: string;
  subscription_tier: SubscriptionTier;
  total_spark: number;
  level: number;
  coach_tone: string;
  coach_name?: string;
  coach_context?: string;
  coach_avatar_neutral?: string;
  coach_avatar_hype?: string;
  coach_avatar_disappointed?: string;
  athlete_context?: string;
  long_term_memory?: string;
  profile_picture_url?: string;
  garmin_connected?: boolean;
  strava_connected?: boolean;
  target_event?: string;
  event_date?: string;
  target_ctl?: number;
  current_ctl?: number;
  athlete_metrics?: {
    max_hr?: number;
    resting_hr?: number;
    ftp?: number;
    weight_kg?: number;
  };
}
