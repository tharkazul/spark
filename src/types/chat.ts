export interface TokenUsage {
  daily_token_usage: number;
  daily_token_limit: number;
  subscription_tier: string;
}

export interface ProposedWorkoutItem {
  date: string;
  sport: string;
  description: string;
  target_rooka?: number;
  details?: string;
  steps_json?: string | any[];
}

export interface EventInvitePayload {
  type: 'event_invite';
  invite_id: number | string;
  micro_plan_id: number | string;
  sport: string;
  date: string;
  description?: string;
  inviter_name?: string;
  inviter_avatar?: string;
  status: 'pending' | 'accepted' | 'declined';
}

export interface SocialMentionPayload {
  type: 'social_mention';
  activity_id: number | string;
  author_name: string;
  author_avatar?: string;
  comment_text: string;
  created_at?: string;
}

export interface WorkoutProposalPayload {
  type: 'workout_proposal';
  plan: ProposedWorkoutItem[];
  status: 'pending' | 'accepted' | 'rejected';
}

export interface ConnectionRequestPayload {
  type: 'connection_request' | 'connection_accepted';
  friend_id?: number;
  fromUserId?: number;
  username?: string;
  status?: string;
}

export type ChatPayload = EventInvitePayload | SocialMentionPayload | WorkoutProposalPayload | ConnectionRequestPayload;

export interface ChatMessage {
  id: string | number;
  clientId?: string;
  tempId?: string;
  user_id?: number;
  role: 'user' | 'coach' | 'assistant';
  content: string;
  mood?: string;
  timestamp: string;
  images?: string[];
  proposedPlan?: ProposedWorkoutItem[];
  proposalStatus?: 'pending' | 'accepted' | 'rejected';
  payload_json?: ChatPayload;
  isStreaming?: boolean;
  isError?: boolean;
}

