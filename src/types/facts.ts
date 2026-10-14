// Shapes returned by GET /api/facts (server/routes/facts.js).

export type FactCategory = 'life' | 'schedule' | 'goal' | 'preference' | 'health' | 'experience';
export const FACT_CATEGORIES: FactCategory[] = ['life', 'schedule', 'goal', 'preference', 'health', 'experience'];

export interface AthleteFact {
  id: number;
  category: FactCategory;
  text: string;
  source: 'athlete' | 'coach' | 'onboarding' | 'migrated';
  until: string | null;
  updatedAt: string;
}

export interface AthleteMetric {
  key: string;
  value: string;
  source: string | null;
  updatedAt: string | null;
}
