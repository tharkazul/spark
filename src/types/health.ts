export interface Niggle {
  id: number | string;
  user_id?: number;
  body_part: string;
  severity: number; // 1 to 5
  notes?: string;
  status: 'active' | 'resolved';
  reported_date?: string;
  resolved_date?: string;
}
