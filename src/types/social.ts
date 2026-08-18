export interface SocialFeedActivity {
  id: string | number;
  user_id: number;
  username: string;
  athlete_name?: string;
  profile_picture_url?: string;
  rooka_level: number;
  title: string;
  sport_type: string;
  distance_km?: number;
  moving_time_min?: number;
  rooka_score: number;
  kudos_count: number;
  comments_count: number;
  has_kudosed: boolean;
  start_date: string;
  polyline?: string;
  sets_json?: string;
  elevation_m?: number;
  average_heartrate?: number;
  max_heartrate?: number;
  average_power_w?: number;
}

export interface ActivityComment {
  id: string | number;
  activity_id: string | number;
  user_id: number;
  username: string;
  profile_picture_url?: string;
  comment: string;
  created_at: string;
}

export interface SocialConnection {
  friend_id: number;
  username: string;
  status: 'pending' | 'pending_received' | 'accepted';
  profile_picture_url?: string;
}

export interface LeaderboardEntry {
  user_id: number;
  username: string;
  rooka_level: number;
  total_rooka_score: number;
  quests_completed_7d: number;
  total_activities?: number;
  total_minutes?: number;
  profile_picture_url?: string;
  rank: number;
}

export interface LeaderboardResponse {
  leaderboard: LeaderboardEntry[];
  questLeaderboard: LeaderboardEntry[];
  topActivities?: any[];
}

export interface MentionUser {
  id: number;
  username: string;
  profile_picture_url?: string;
}
