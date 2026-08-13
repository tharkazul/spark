import { Activity, SportType } from '../types/activity';

export interface NormalizedActivity extends Activity {
  formatted_duration: string;
  formatted_distance: string;
  formatted_pace: string;
  average_power_w?: number;
  max_heartrate?: number;
}

export function normalizeSportType(rawSport?: string): SportType {
  if (!rawSport) return 'RUN';
  const upper = rawSport.toUpperCase().trim();
  if (upper.includes('RUN')) return 'RUN';
  if (upper.includes('BIKE') || upper.includes('CYCL')) return 'BIKE';
  if (upper.includes('SWIM')) return 'SWIM';
  if (upper.includes('STRENGTH') || upper.includes('WEIGHT')) return 'STRENGTH';
  if (upper.includes('MOBILITY') || upper.includes('YOGA') || upper.includes('STRETCH')) return 'MOBILITY';
  if (upper.includes('REST')) return 'REST';
  return 'RUN';
}

export function formatPace(movingTimeMin: number, distanceKm: number, sportType: SportType): string {
  if (distanceKm <= 0 || movingTimeMin <= 0) {
    return '--';
  }

  if (sportType === 'BIKE') {
    const kmh = (distanceKm / (movingTimeMin / 60)).toFixed(1);
    return `${kmh} km/h`;
  }

  if (sportType === 'SWIM') {
    const sec100m = (movingTimeMin * 60) / (distanceKm * 10);
    const m = Math.floor(sec100m / 60);
    const s = Math.round(sec100m % 60);
    return `${m}:${s < 10 ? '0' : ''}${s} /100m`;
  }

  // RUN & Default: min/km
  const paceTotalMin = movingTimeMin / distanceKm;
  const paceM = Math.floor(paceTotalMin);
  const paceS = Math.round((paceTotalMin - paceM) * 60);
  return `${paceM}:${paceS < 10 ? '0' : ''}${paceS} /km`;
}

export function formatDuration(movingTimeMin: number): string {
  if (movingTimeMin <= 0) return '0m';
  const hours = Math.floor(movingTimeMin / 60);
  const mins = Math.round(movingTimeMin % 60);
  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  return `${mins}m`;
}

export function normalizeActivityDetail(raw: any): NormalizedActivity {
  if (!raw || typeof raw !== 'object') {
    return {
      id: '0',
      name: 'Unknown Activity',
      sport_type: 'RUN',
      distance_km: 0,
      moving_time_min: 0,
      start_date: new Date().toISOString(),
      spark_score: 0,
      formatted_duration: '0m',
      formatted_distance: '0.0 km',
      formatted_pace: '--',
    };
  }

  // Handle dual-shape distance (meters vs km)
  let distanceKm = 0;
  if (typeof raw.distance_km === 'number') {
    distanceKm = raw.distance_km;
  } else if (typeof raw.distance === 'number') {
    // If raw distance is large, it's in meters from Strava/Garmin
    distanceKm = raw.distance > 100 ? raw.distance / 1000 : raw.distance;
  } else if (typeof raw.distance_m === 'number') {
    distanceKm = raw.distance_m / 1000;
  }
  distanceKm = Math.round(distanceKm * 100) / 100;

  // Handle dual-shape moving time (seconds vs minutes)
  let movingTimeMin = 0;
  if (typeof raw.moving_time_min === 'number') {
    movingTimeMin = raw.moving_time_min;
  } else if (typeof raw.moving_time === 'number') {
    movingTimeMin = raw.moving_time > 300 ? raw.moving_time / 60 : raw.moving_time;
  } else if (typeof raw.elapsed_time === 'number') {
    movingTimeMin = raw.elapsed_time > 300 ? raw.elapsed_time / 60 : raw.elapsed_time;
  }
  movingTimeMin = Math.round(movingTimeMin * 10) / 10;

  const sport_type = normalizeSportType(raw.sport_type || raw.sport || raw.type);

  // Handle start date
  const start_date = raw.start_date || raw.start_date_local || raw.date || new Date().toISOString();

  // Handle spark score / TSS
  const spark_score =
    typeof raw.spark_score === 'number'
      ? raw.spark_score
      : typeof raw.tss === 'number'
      ? raw.tss
      : typeof raw.daily_spark === 'number'
      ? raw.daily_spark
      : 0;

  const formatted_duration = formatDuration(movingTimeMin);
  const formatted_distance = `${distanceKm.toFixed(1)} km`;
  const formatted_pace = formatPace(movingTimeMin, distanceKm, sport_type);

  return {
    id: raw.id || `act_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    user_id: raw.user_id,
    name: raw.name || raw.description || `${sport_type} Workout`,
    sport_type,
    distance_km: distanceKm,
    elevation_m: typeof raw.elevation_m === 'number' ? raw.elevation_m : raw.total_elevation_gain || 0,
    moving_time_min: movingTimeMin,
    average_heartrate: typeof raw.average_heartrate === 'number' ? Math.round(raw.average_heartrate) : undefined,
    max_heartrate: typeof raw.max_heartrate === 'number' ? Math.round(raw.max_heartrate) : undefined,
    average_power_w: typeof raw.average_watts === 'number' ? Math.round(raw.average_watts) : raw.average_power_w,
    start_date,
    tss: spark_score,
    spark_score,
    sets_json: raw.sets_json || (raw.steps_json ? JSON.stringify(raw.steps_json) : undefined),
    kudos_count: typeof raw.kudos_count === 'number' ? raw.kudos_count : 0,
    formatted_duration,
    formatted_distance,
    formatted_pace,
  };
}
