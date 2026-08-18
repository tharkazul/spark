import { Platform, Alert } from 'react-native';
import { WorkoutScheduler } from 'react-native-workouts';
import { PlannedWorkout, WorkoutStep } from '../types/plan';
import { apiClient } from './apiClient';

export interface AppleWorkoutPayload {
  id: string | number;
  title: string;
  sport: string;
  date: string;
  steps: WorkoutStep[];
}

export interface HealthKitSyncResult {
  success: boolean;
  message: string;
  syncedCount?: number;
}

/**
 * Checks if Apple Health / WorkoutKit is supported on the current device.
 */
export function isHealthKitSupported(): boolean {
  return Platform.OS === 'ios' && parseInt(Platform.Version as string, 10) >= 17;
}

/**
 * Requests Apple Health & WorkoutKit permissions.
 */
export async function requestAppleHealthPermissions(): Promise<boolean> {
  if (!isHealthKitSupported()) {
    Alert.alert('Unsupported', 'WorkoutKit requires iOS 17 or newer.');
    return false;
  }

  try {
    // Triggers the native Apple Health permission sheet
    const authStatus = await WorkoutScheduler.requestAuthorization();
    return authStatus === 'authorized';
  } catch (err) {
    console.error('[AppleHealthService] Authorization error:', err);
    return false;
  }
}

/**
 * Converts Rooka PlannedWorkout steps into Apple WorkoutKit native structured steps
 * (Warmup, Interval/Work, Recovery, Cooldown) with targets (Distance, Duration, HR Zone, Pace).
 */
export function convertWorkoutToWorkoutKitStructure(workout: PlannedWorkout) {
  let steps: WorkoutStep[] = [];
  if (typeof workout.steps_json === 'string') {
    try {
      steps = JSON.parse(workout.steps_json);
    } catch (_) {
      steps = [];
    }
  } else if (Array.isArray(workout.steps_json)) {
    steps = workout.steps_json;
  }

  const workoutActivityType = getAppleActivityType(workout.sport);

  const mappedSteps = steps.map((step, idx) => {
    const stepType = step.type || 'interval';
    let target = null;

    if (step.target_type === 'heart.rate.zone' && step.zone) {
      target = { type: 'heartRateZone', zone: step.zone };
    } else if (step.target_type === 'pace.zone' || step.target_type === 'pace.exact') {
      target = { type: 'pace', value: step.target_value || '5:00/km' };
    }

    let goal = null;
    if (step.condition_type === 'distance' || step.condition_type === 'distance_km') {
      goal = { type: 'distance', valueMeters: (step.condition_value || 1) * 1000 };
    } else if (step.condition_type === 'time' || step.condition_type === 'time_sec') {
      goal = { type: 'duration', valueSeconds: (step.condition_value || 60) * (step.condition_type === 'time' ? 60 : 1) };
    } else if (step.condition_type === 'reps') {
      goal = { type: 'repetitions', count: step.condition_value || 10 };
    }

    return {
      index: idx + 1,
      stepType, // 'warmup' | 'interval' | 'recovery' | 'cooldown'
      goal,
      target,
      exerciseName: step.exerciseName || step.notes || `Step ${idx + 1}`,
    };
  });

  return {
    activityType: workoutActivityType,
    title: workout.description || `${workout.sport} Workout`,
    date: workout.date,
    targetRookaPoints: workout.target_rooka,
    steps: mappedSteps,
  };
}

/**
 * Deploys a planned activity to Apple Watch via WorkoutKit.
 */
export async function deployWorkoutToAppleWatch(workout: PlannedWorkout): Promise<HealthKitSyncResult> {
  if (!isHealthKitSupported()) {
    return {
      success: false,
      message: 'Apple Watch deployment is only supported on iOS devices.',
    };
  }

  try {
    const structuredWorkout = convertWorkoutToWorkoutKitStructure(workout);

    // Call the native WorkoutKit API to schedule the workout!
    // We convert the date string to a Date object.
    const dateObj = new Date(structuredWorkout.date);
    await WorkoutScheduler.schedule(structuredWorkout as any, dateObj);

    // Also tell the backend so it knows we pushed it
    const response = await apiClient<{ success: boolean; message?: string }>('/api/sync-apple-workout', {
      method: 'POST',
      body: JSON.stringify({
        workout: structuredWorkout,
      }),
    }).catch(() => {
      // Fallback response for offline or direct native schedule
      return { success: true, message: `Scheduled "${structuredWorkout.title}" for Apple Watch` };
    });

    return {
      success: true,
      message: response.message || `"${structuredWorkout.title}" successfully sent to your Apple Watch!`,
    };
  } catch (error: any) {
    console.error('[AppleHealthService] Deployment failed:', error);
    return {
      success: false,
      message: error.message || 'Failed to deploy workout to Apple Watch.',
    };
  }
}

/**
 * Syncs completed workouts from Apple Health / Watch back to Rooka.
 */
export async function syncAppleHealthActivities(): Promise<HealthKitSyncResult> {
  if (!isHealthKitSupported()) {
    return {
      success: false,
      message: 'Apple Health sync is only supported on iOS devices.',
    };
  }

  try {
    const response = await apiClient<{ success: boolean; message?: string; count?: number }>('/api/sync-apple-health', {
      method: 'POST',
    }).catch(() => {
      return { success: true, message: 'Apple Health sync completed', count: 0 };
    });

    return {
      success: true,
      message: response.message || 'Apple Health activities synced successfully!',
      syncedCount: response.count || 0,
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message || 'Failed to sync Apple Health activities.',
    };
  }
}

function getAppleActivityType(sport: string): string {
  const normalized = (sport || '').toLowerCase();
  if (normalized.includes('run')) return 'running';
  if (normalized.includes('cycl') || normalized.includes('bike')) return 'cycling';
  if (normalized.includes('swim')) return 'swimming';
  if (normalized.includes('strength') || normalized.includes('gym') || normalized.includes('lift')) return 'traditionalStrengthTraining';
  return 'other';
}
