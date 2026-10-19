// Shapes returned by GET /api/season (server/routes/season.js). The server is the
// only place the season rules live; these types just describe its output.

export type SeasonPhase = 'base' | 'build' | 'peak' | 'taper' | 'race';
export type SeasonUnit = 'km' | 'min';

export type EventType =
  | '5k'
  | '10k'
  | 'half'
  | 'marathon'
  | 'sprint_tri'
  | 'olympic_tri'
  | '70.3'
  | 'ironman'
  | 'hyrox'
  | 'other';

export const EVENT_TYPES: EventType[] = ['5k', '10k', 'half', 'marathon', 'sprint_tri', 'olympic_tri', '70.3', 'ironman', 'hyrox', 'other'];

export interface LongSession {
  sport: 'Run' | 'Bike' | 'Any';
  unit: SeasonUnit;
  value: number;
}

export interface SeasonWeek {
  weekStart: string;
  index: number;
  total: number;
  phase: SeasonPhase;
  isRecovery: boolean;
  isCheckpoint: boolean;
  unit: SeasonUnit;
  volume: number;
  actualVolume: number | null;
  longSessions: LongSession[];
  split: Record<string, number> | null;
  isPast: boolean;
  isCurrent: boolean;
}

export interface LongLimit {
  sport: string;
  unit: SeasonUnit;
  cap: number;
  usual: number;
  longestDayMinutes: number;
}

export interface SeasonFlags {
  timeLimited: boolean;
  longLimitedBy: LongLimit[];
  shortBuild: boolean;
  estimatedStart: boolean;
  recoveryEvery: number;
  recommendedPeak: number;
  capVolume: number;
  easyPace: number;
}

export interface Season {
  eventType: EventType;
  discipline: 'running' | 'triathlon' | 'hyrox' | 'general';
  raceName: string;
  raceDate: string;
  daysToRace: number;
  unit: SeasonUnit;
  flags: SeasonFlags;
  weeks: SeasonWeek[];
  currentWeek: SeasonWeek | null;
}

export type GoalStatusKind = 'on_track' | 'within_reach' | 'ambitious' | 'building';

export interface TrendPoint {
  date: string;
  value: number;
  target: number | null;
}

export interface RaceStatus {
  kind: 'race';
  eventType: EventType;
  raceName: string;
  raceDate: string;
  daysToRace: number;
  timeLimited: boolean;
  longLimitedBy: LongLimit[];
  shortBuild: boolean;
  readiness: { sport: string; unit: SeasonUnit; done: number; peak: number }[];
  consistency: { weeksOnTarget: number; weeks: number } | null;
  status: GoalStatusKind;
  estimateSec: number | null;
  targetSec: number | null;
  gapSec?: number;
  /**
   * What the estimate rests on. `method` says which: the fastest run at 88%+ of
   * max HR ('best_effort'), heart rate vs pace on steady runs ('heart_rate'),
   * or the median of the 3 fastest predictions ('median', also when absent).
   */
  basis?: {
    method?: 'best_effort' | 'heart_rate' | 'median';
    runs?: number;
    hardRuns?: number;
    fromHardRuns?: boolean;
    typedIn?: boolean;
    raceDayBonus?: boolean;
    steadyRuns?: number;
    vdot?: number;
    fastest?: { date: string; distanceKm: number; minutes: number; seconds?: number; avgHr?: number; withinLongerRun?: boolean };
  } | null;
  trend: TrendPoint[];
}

export interface BodyStatus {
  kind: 'body';
  goalName: string;
  goalDate: string;
  targetKg: number;
  status: GoalStatusKind;
  currentKg: number | null;
  ratePerWeek?: number | null;
  neededPerWeek?: number | null;
  trend: TrendPoint[];
}

export interface RacePlan {
  summary: string;
  pacing: { segment: string; target: string; note?: string }[];
  fueling: { when: string; what: string }[];
  raceWeek: { day: string; items: string[] }[];
  raceMorning: string[];
  mindset: string[];
  createdAt?: string;
}

export interface SeasonResponse {
  season: Season | null;
  raceStatus: RaceStatus | null;
  bodyStatus: BodyStatus | null;
  racePlan: RacePlan | null;
}

export interface Achievement {
  id: string;
  group: 'milestones' | 'run' | 'ride' | 'swim';
  icon: string;
  earnedAt: string | null;
  target?: number;
  progress?: number;
}

export interface ExerciseCues {
  setup: string;
  cues: string[];
  mistake: string;
}
