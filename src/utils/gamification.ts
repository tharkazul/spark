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
 * Calculates the athlete's current streak in days.
 *
 * A day counts towards the streak when:
 *  - at least one activity was logged that day, or
 *  - the plan scheduled that day as rest (a REST/RECOVERY plan entry) and the day is over.
 * Days without any plan entry and without an activity break the streak, as do planned
 * workout days that were missed. Today never breaks the streak: it counts once an activity
 * is logged, and otherwise the streak is evaluated from yesterday backwards.
 *
 * `plannedItems` accepts plan entries ({ date, sport }), or a Set/array of rest date strings.
 */
export function calculateActivityStreak(
  activities: { start_date?: string; start_date_local?: string }[],
  plannedItems?: Set<string> | string[] | { date?: string; sport?: string }[]
): number {
  const toLocalDateStr = (d: Date): string => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const activityDates = new Set<string>();
  for (const a of activities || []) {
    if (a.start_date_local && a.start_date_local.length >= 10) {
      activityDates.add(a.start_date_local.substring(0, 10));
    } else if (a.start_date) {
      const d = new Date(a.start_date);
      activityDates.add(!isNaN(d.getTime()) ? toLocalDateStr(d) : a.start_date.substring(0, 10));
    }
  }

  const restDates = new Set<string>();
  const isRestSport = (sport?: string) => {
    const s = String(sport || '').toUpperCase();
    return s === 'REST' || s === 'RECOVERY';
  };
  if (plannedItems instanceof Set) {
    plannedItems.forEach((d) => restDates.add(String(d).substring(0, 10)));
  } else if (Array.isArray(plannedItems)) {
    for (const item of plannedItems) {
      if (typeof item === 'string') {
        restDates.add(item.substring(0, 10));
      } else if (item && item.date && isRestSport(item.sport)) {
        restDates.add(item.date.substring(0, 10));
      }
    }
  }

  const checkDate = new Date();
  let streak = 0;

  // Today: only an activity counts; an unfinished day never breaks the streak.
  if (activityDates.has(toLocalDateStr(checkDate))) streak++;
  checkDate.setDate(checkDate.getDate() - 1);

  // Walk back from yesterday while each day is either active or a planned rest day.
  // Safety bound so malformed data can never loop forever.
  for (let i = 0; i < 3650; i++) {
    const dateStr = toLocalDateStr(checkDate);
    if (activityDates.has(dateStr) || restDates.has(dateStr)) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }

  return streak;
}
