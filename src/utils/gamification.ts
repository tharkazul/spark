export interface RookaLevelInfo {
  level: number;
  currentLevelThreshold: number;
  nextLevelThreshold: number;
  progressPercent: number;
  totalRooka: number;
  xp_total: number;
  level_start_xp: number;
  next_level_xp: number;
  xpThisLevel: number;
  xpNeeded: number;
  xpRemaining: number;
  progress: number;
}

/**
 * Calculates rooka Level and progress based on total rooka points accumulated.
 * Standard rooka Level logarithmic curve:
 * Level 1 starts at 0 XP (range 0 to ~78 XP).
 * Level formula: level = Math.floor(8.5 * Math.log10(rooka / 250 + 1)) + 1
 */
export function getRookaLevelInfo(totalRooka: number = 0): RookaLevelInfo {
  const rooka = Math.round(Math.max(0, Number(totalRooka) || 0));
  const level = Math.floor(8.5 * Math.log10(rooka / 250 + 1)) + 1;
  const currentLevelThreshold = level <= 1 ? 0 : Math.ceil(250 * (Math.pow(10, (level - 1) / 8.5) - 1));
  const nextLevelThreshold = Math.ceil(250 * (Math.pow(10, level / 8.5) - 1));

  const xpTotal = rooka;
  const levelStart = currentLevelThreshold;
  const nextLevel = nextLevelThreshold;
  const xpNeeded = Math.max(1, nextLevel - levelStart);
  const xpThisLevel = Math.max(0, Math.min(xpTotal - levelStart, xpNeeded));
  const xpRemaining = Math.max(0, nextLevel - xpTotal);
  const progress = Math.min(Math.max(xpThisLevel / xpNeeded, 0), 1);
  const progressPercent = Math.min(Math.max(Math.round(progress * 100), 0), 100);

  return {
    level,
    currentLevelThreshold,
    nextLevelThreshold,
    progressPercent,
    totalRooka: xpTotal,
    xp_total: xpTotal,
    level_start_xp: levelStart,
    next_level_xp: nextLevel,
    xpThisLevel,
    xpNeeded,
    xpRemaining,
    progress,
  };
}

/**
 * Calculates consecutive active days streak from athlete activities.
 * Counts consecutive days with at least one logged activity up to today or yesterday.
 * If there is an activity today, counts back from today.
 * If there is no activity today but there is one yesterday, counts back from yesterday
 * (streak is maintained until end of today).
 * If neither today nor yesterday has an activity, streak is 0.
 */
export function calculateActivityStreak(activities: { start_date?: string; start_date_local?: string }[]): number {
  if (!activities || activities.length === 0) return 0;

  const toLocalDateStr = (d: Date): string => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const activityDates = new Set<string>();

  for (const a of activities) {
    if (a.start_date_local && a.start_date_local.length >= 10) {
      activityDates.add(a.start_date_local.substring(0, 10));
    } else if (a.start_date) {
      try {
        const d = new Date(a.start_date);
        if (!isNaN(d.getTime())) {
          activityDates.add(toLocalDateStr(d));
        } else {
          activityDates.add(a.start_date.substring(0, 10));
        }
      } catch (_) {
        activityDates.add(a.start_date.substring(0, 10));
      }
    }
  }

  const now = new Date();
  const todayStr = toLocalDateStr(now);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = toLocalDateStr(yesterday);

  // If no activity today and no activity yesterday, streak is broken
  if (!activityDates.has(todayStr) && !activityDates.has(yesterdayStr)) {
    return 0;
  }

  let streak = 0;
  let checkDate = activityDates.has(todayStr) ? new Date(now) : new Date(yesterday);

  while (true) {
    const dateStr = toLocalDateStr(checkDate);
    if (activityDates.has(dateStr)) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }

  return streak;
}
