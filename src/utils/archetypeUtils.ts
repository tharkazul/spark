export interface ArchetypeData {
  endurance: number;    // 0 - 100
  strength: number;     // 0 - 100
  versatility: number;  // 0 - 100
  explosiveness: number; // 0 - 100
  consistency: number;  // 0 - 100
  title: string;        // Dynamic archetype classification title
  description: string;  // Detailed archetype narrative
}

export interface ActivityForArchetype {
  sport_type?: string;
  distance_km?: number;
  moving_time_min?: number;
  average_heartrate?: number;
  average_watts?: number;
  start_date?: string;
  name?: string;
  sets_json?: string;
}

export interface AthleteMetricsForArchetype {
  ftp?: number;
  weight_kg?: number;
  max_hr?: number;
}

/**
 * Calculates Athlete Archetype scores (0-100) and title based on actual workout data,
 * incorporating gym strength, functional cycling/running wattage, endurance volume, and multi-sport versatility.
 */
export function calculateAthleteArchetype(
  activities: ActivityForArchetype[] = [],
  metrics?: AthleteMetricsForArchetype
): ArchetypeData {
  if (!activities || activities.length === 0) {
    return {
      endurance: 25,
      strength: 25,
      versatility: 25,
      explosiveness: 25,
      consistency: 25,
      title: 'Developing Athlete',
      description: 'Building baseline training volume and establishing workout consistency across core endurance and strength domains.',
    };
  }

  const now = new Date().getTime();
  const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;

  // Filter activities within past 90 days (or use all if small sample)
  const recentActivities = activities.filter((a) => {
    if (!a.start_date) return true;
    const t = new Date(a.start_date).getTime();
    return !isNaN(t) && now - t <= ninetyDaysMs;
  });

  const activeSet = recentActivities.length >= 3 ? recentActivities : activities;
  const daysSpan = 90;

  // --- 1. ENDURANCE (Aerobic capacity & volume) ---
  const aerobicSports = ['run', 'bike', 'ride', 'swim', 'rowing', 'nordic ski', 'hike', 'virtualride', 'virtualrun'];
  const aerobicActs = activeSet.filter((a) =>
    aerobicSports.includes((a.sport_type || '').toLowerCase())
  );

  const totalAerobicMins = aerobicActs.reduce((sum, a) => sum + (a.moving_time_min || 0), 0);
  const weeklyAerobicHours = (totalAerobicMins / 60) / (daysSpan / 7);
  const maxSessionMins = aerobicActs.reduce((max, a) => Math.max(max, a.moving_time_min || 0), 0);

  const enduranceScore = Math.min(
    100,
    Math.round((weeklyAerobicHours / 5.5) * 55 + (maxSessionMins / 150) * 45)
  );

  // --- 2. STRENGTH (Gym resistance + Functional Cycling/Running Wattage) ---
  const strengthActs = activeSet.filter((a) => {
    const st = (a.sport_type || '').toLowerCase();
    const nm = (a.name || '').toLowerCase();
    return st === 'strength' || st === 'weighttraining' || nm.includes('strength') || nm.includes('gym') || nm.includes('lift');
  });

  const weeklyStrengthSessions = strengthActs.length / (daysSpan / 7);
  const gymScore = Math.min(60, weeklyStrengthSessions * 22);

  // Wattage component (FTP / W/kg and peak watts logged)
  let wattScore = 0;
  const ftp = metrics?.ftp || 0;
  const weight = metrics?.weight_kg || 75;
  const wKg = weight > 0 ? ftp / weight : 0;

  if (wKg >= 4.0) wattScore = 40;
  else if (wKg >= 3.2) wattScore = 30;
  else if (wKg >= 2.5) wattScore = 20;
  else if (wKg >= 1.8) wattScore = 10;

  // Max activity watts bonus
  const maxWatts = activeSet.reduce((max, a) => Math.max(max, a.average_watts || 0), 0);
  if (maxWatts >= 280) wattScore = Math.min(40, wattScore + 10);
  else if (maxWatts >= 220) wattScore = Math.min(40, wattScore + 5);

  const strengthScore = Math.min(100, Math.round(gymScore + wattScore));

  // --- 3. VERSATILITY (Cross-training discipline breadth) ---
  const uniqueSports = new Set(
    activeSet.map((a) => (a.sport_type || 'other').toLowerCase())
  );
  const versatilityScore = Math.min(100, Math.round(uniqueSports.size * 22));

  // --- 4. EXPLOSIVENESS (Anaerobic intensity & interval work) ---
  let highHrCount = 0;
  let intervalCount = 0;

  activeSet.forEach((a) => {
    if (a.average_heartrate && a.average_heartrate >= 155) {
      highHrCount++;
    }
    const nm = (a.name || '').toLowerCase();
    if (
      nm.includes('sprint') ||
      nm.includes('interval') ||
      nm.includes('vo2') ||
      nm.includes('hiit') ||
      nm.includes('tempo') ||
      nm.includes('threshold') ||
      nm.includes('repeats')
    ) {
      intervalCount++;
    }
  });

  const explosivenessScore = Math.min(
    100,
    Math.round(highHrCount * 7 + intervalCount * 15)
  );

  // --- 5. CONSISTENCY (Workout frequency & regularity) ---
  const uniqueDays = new Set(
    activeSet.map((a) => (a.start_date || '').substring(0, 10))
  ).size;
  const weeklyWorkoutDays = uniqueDays / (daysSpan / 7);
  const consistencyScore = Math.min(100, Math.round((weeklyWorkoutDays / 4.5) * 100));

  // --- DYNAMIC TITLE & DESCRIPTION CLASSIFICATION ---
  let title = 'Developing Athlete';
  let description =
    'Building baseline training volume and establishing workout consistency across core endurance and strength domains.';

  if (activeSet.length < 5) {
    title = 'Developing Athlete';
    description =
      'Building baseline training volume and establishing workout consistency across core endurance and strength domains.';
  } else if (enduranceScore >= 60 && strengthScore >= 60) {
    title = 'Balanced Hybrid';
    description =
      'Demonstrates exceptional dual-capacity across high-volume endurance and heavy resistance work, maintaining strong work capacity across all training domains.';
  } else if (enduranceScore >= 70 && strengthScore < 45) {
    title = 'Endurance Specialist';
    description =
      'Excels in sustained aerobic capacity and long-duration volume, showing deep cardiovascular efficiency and stamina.';
  } else if (strengthScore >= 70 && enduranceScore < 45) {
    title = 'Iron Specialist';
    description =
      'Prioritizes heavy resistance training and raw muscular strength, maintaining high peak output in power and strength disciplines.';
  } else if (explosivenessScore >= 65 && strengthScore >= 50) {
    title = 'Speed & Power Athlete';
    description =
      'Dominates high-intensity anaerobic efforts, interval surges, and explosive power outputs with strong threshold resilience.';
  } else if (versatilityScore >= 70) {
    title = 'Multi-Sport Athlete';
    description =
      'Possesses exceptional versatility across diverse disciplines (running, cycling, swimming, functional fitness), seamlessly adapting to multi-modal training.';
  } else if (consistencyScore >= 75) {
    title = 'Consistent Grinder';
    description =
      'Maintains remarkable training discipline and regular weekly frequency, building fitness through relentless week-over-week consistency.';
  } else if (versatilityScore >= 45) {
    title = 'Versatile Athlete';
    description =
      'Balances cross-training variety across multiple athletic disciplines with steady training volume.';
  }

  return {
    endurance: Math.max(15, enduranceScore),
    strength: Math.max(15, strengthScore),
    versatility: Math.max(15, versatilityScore),
    explosiveness: Math.max(15, explosivenessScore),
    consistency: Math.max(15, consistencyScore),
    title,
    description,
  };
}
