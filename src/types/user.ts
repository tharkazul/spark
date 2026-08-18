export type SubscriptionTier = 'free' | 'subscription' | 'rooka_plus' | 'premium' | 'admin';

export interface UserProfile {
  id: number;
  username: string;
  email?: string;
  subscription_tier: SubscriptionTier;
  total_rooka: number;
  level: number;
  gender?: string;
  last_cycle_start?: string;
  cycle_tracking_enabled?: boolean;
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
  daily_availability?: Record<string, number>; // e.g. { MON: 45, TUE: 45, WED: 60, THU: 45, FRI: 60, SAT: 90, SUN: 45 }
  athlete_metrics?: {
    max_hr?: number;
    resting_hr?: number;
    ftp?: number;
    weight_kg?: number;
  };
  daily_token_usage?: number;
  dailyTokenUsage?: number;
  daily_token_limit?: number;
  dailyTokenLimit?: number;
  onboarding_completed?: boolean;
}

