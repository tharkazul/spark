export interface PhysiqueEntry {
  id?: string | number;
  user_id?: number;
  date: string;
  weight_kg: number;
  body_fat_percent?: number;
  bmi?: number;
  lean_mass_kg?: number;
  sleep_quality?: number;
  fatigue_level?: number;
  notes?: string;
  photo_url?: string;
  created_at?: string;
}

export interface NutritionProtocol {
  focusTitle: string;
  rationale: string;
  loggedCarbs: number;
  carbsTarget: number;
  loggedProtein: number;
  proteinTarget: number;
  loggedFat: number;
  fatTarget: number;
  loggedItems?: string[];
}
