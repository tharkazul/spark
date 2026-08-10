export interface SparkLevelInfo {
  level: number;
  currentLevelThreshold: number;
  nextLevelThreshold: number;
  progressPercent: number;
  totalSpark: number;
}

/**
 * Calculates Spark Level and progress based on total Spark points accumulated.
 * Standard Spark Level logarithmic curve:
 * Level 1 starts at 0 XP (range 0 to ~78 XP).
 * Level formula: level = Math.floor(8.5 * Math.log10(spark / 250 + 1)) + 1
 */
export function getSparkLevelInfo(totalSpark: number = 0): SparkLevelInfo {
  const spark = Math.max(0, totalSpark || 0);
  const level = Math.floor(8.5 * Math.log10(spark / 250 + 1)) + 1;
  const currentLevelThreshold = 250 * (Math.pow(10, (level - 1) / 8.5) - 1);
  const nextLevelThreshold = 250 * (Math.pow(10, level / 8.5) - 1);

  let progressPercent = 0;
  if (nextLevelThreshold > currentLevelThreshold) {
    progressPercent =
      ((spark - currentLevelThreshold) /
        (nextLevelThreshold - currentLevelThreshold)) *
      100;
  }

  return {
    level,
    currentLevelThreshold: Math.round(currentLevelThreshold),
    nextLevelThreshold: Math.round(nextLevelThreshold),
    progressPercent: Math.min(Math.max(Math.round(progressPercent), 0), 100),
    totalSpark: Math.round(spark * 10) / 10,
  };
}
