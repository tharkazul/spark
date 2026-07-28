export interface ChatMessage {
  id: string | number;
  user_id?: number;
  role: 'user' | 'coach' | 'assistant';
  content: string;
  mood?: string;
  timestamp: string;
}
