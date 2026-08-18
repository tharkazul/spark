export interface RookaLevelInfo {
  level: number;
  currentLevelThreshold: number;
  nextLevelThreshold: number;
  progressPercent: number;
  totalRooka: number;
}

/**
 * Calculates Rooka Level and progress based on total Rooka points accumulated.
 * Standard Rooka Level logarithmic curve:
 * Level 1 starts at 0 XP (range 0 to ~78 XP).
 * Level formula: level = Math.floor(8.5 * Math.log10(rooka / 250 + 1)) + 1
 */
export function getRookaLevelInfo(totalRooka: number = 0): RookaLevelInfo {
  const rooka = Math.max(0, totalRooka || 0);
  const level = Math.floor(8.5 * Math.log10(rooka / 250 + 1)) + 1;
  const currentLevelThreshold = 250 * (Math.pow(10, (level - 1) / 8.5) - 1);
  const nextLevelThreshold = 250 * (Math.pow(10, level / 8.5) - 1);

  let progressPercent = 0;
  if (nextLevelThreshold > currentLevelThreshold) {
    progressPercent =
      ((rooka - currentLevelThreshold) /
        (nextLevelThreshold - currentLevelThreshold)) *
      100;
  }

  return {
    level,
    currentLevelThreshold: Math.round(currentLevelThreshold),
    nextLevelThreshold: Math.round(nextLevelThreshold),
    progressPercent: Math.min(Math.max(Math.round(progressPercent), 0), 100),
    totalRooka: Math.round(rooka),
  };
}
