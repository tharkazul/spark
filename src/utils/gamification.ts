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
export function calculateActivityStreak(
  activities: { start_date?: string; start_date_local?: string }[],
  plannedItems?: Set<string> | string[] | { date?: string; sport?: string }[]
): number {
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

  // Parse planned rest dates
  const restDates = new Set<string>();
  if (plannedItems) {
    if (plannedItems instanceof Set) {
      plannedItems.forEach((d) => restDates.add(String(d).substring(0, 10)));
    } else if (Array.isArray(plannedItems)) {
      for (const item of plannedItems) {
        if (typeof item === 'string') {
          restDates.add(item.substring(0, 10));
        } else if (item && typeof item === 'object') {
          if (item.sport && String(item.sport).toUpperCase() === 'REST' && item.date) {
            restDates.add(item.date.substring(0, 10));
          }
        }
      }
    }
  }

  const now = new Date();

  // Find start date: today, or look backwards through planned rest days (up to 3 days)
  let checkDate = new Date(now);
  let foundStart = false;

  for (let lookback = 0; lookback <= 3; lookback++) {
    const dStr = toLocalDateStr(checkDate);
    if (activityDates.has(dStr)) {
      foundStart = true;
      break;
    }
    // If today hasn't been completed yet, continue checking yesterday
    // If yesterday or prior had no activity, it must be an honored rest day
    if (lookback > 0 && !restDates.has(dStr)) {
      break;
    }
    checkDate.setDate(checkDate.getDate() - 1);
  }

  if (!foundStart) {
    return 0;
  }

  let streak = 0;
  let consecutiveRest = 0;

  while (true) {
    const dateStr = toLocalDateStr(checkDate);
    if (activityDates.has(dateStr)) {
      streak++;
      consecutiveRest = 0;
      checkDate.setDate(checkDate.getDate() - 1);
    } else if (restDates.has(dateStr)) {
      // Planned rest day is neutral per Decision D-06
      consecutiveRest++;
      if (consecutiveRest > 3) break;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }

  return streak;
}
