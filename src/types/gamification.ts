export interface Quest {
  id: number | string;
  user_id?: number;
  title?: string;
  description: string;
  target_metric: string;
  target_value: number;
  reward_points: number;
  status: 'active' | 'completed' | 'claimed';
  target_sport?: string;
  is_accumulative?: boolean;
  expires_at?: string;
  progress?: number;
}

export interface UserTitle {
  id: number | string;
  title?: string;
  title_name?: string;
  description?: string;
  created_at?: string;
  is_equipped?: number | boolean;
  unlocked_at?: string;
}

export interface LeaderboardEntry {
  user_id: number;
  username: string;
  total_rooka: number;
  level: number;
  profile_picture_url?: string;
  rank: number;
}
