export interface TokenUsage {
  daily_token_usage: number;
  daily_token_limit: number;
  subscription_tier: string;
}

export interface ProposedWorkoutItem {
  date: string;
  sport: string;
  description: string;
  target_spark?: number;
  details?: string;
  steps_json?: string | any[];
}

export interface ChatMessage {
  id: string | number;
  user_id?: number;
  role: 'user' | 'coach' | 'assistant';
  content: string;
  mood?: string;
  timestamp: string;
  images?: string[];
  proposedPlan?: ProposedWorkoutItem[];
  proposalStatus?: 'pending' | 'accepted' | 'rejected';
}
