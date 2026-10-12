import { LongSession, SeasonPhase, SeasonUnit } from '../../types/season';

type T = (key: string, params?: any) => string;

export const PHASE_COLORS: Record<SeasonPhase, string> = {
  base: '#38BDF8',
  build: '#0EA5E9',
  peak: '#0369A1',
  taper: '#8B5CF6',
  race: '#F97316',
};

export function phaseLabel(t: T, phase: SeasonPhase): string {
  return t(`goal.phase_${phase}`);
}

export function formatHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}:${String(m).padStart(2, '0')}`;
}

/** "40 km" or "6:30 h". */
export function formatVolume(value: number, unit: SeasonUnit): string {
  return unit === 'km' ? `${Math.round(value)} km` : `${formatHours(value)} h`;
}

/** "long run 22 km", "long ride 2:30 h", "longest session 1:30 h". */
export function formatLongSession(t: T, l: LongSession): string {
  const value = l.unit === 'km' ? `${l.value % 1 === 0 ? l.value : l.value.toFixed(1)} km` : `${formatHours(l.value)} h`;
  const key = l.sport === 'Run' ? 'goal.longRun' : l.sport === 'Bike' ? 'goal.longRide' : 'goal.longSession';
  return t(key, { value });
}

/** 6515 -> "1:48:35"; under an hour -> "48:35". */
export function formatRaceTime(sec: number | null | undefined): string {
  if (!sec && sec !== 0) return '–';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.round(sec % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

/** 215 -> "3:35", 4000 -> "1:06:40". */
export function formatGap(sec: number): string {
  return formatRaceTime(Math.abs(sec));
}
