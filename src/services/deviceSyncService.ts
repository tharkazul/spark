import * as Haptics from 'expo-haptics';
import { syncGarminWorkout, GarminSyncWorkoutPayload } from '../api/integrations';
import { deployWorkoutToAppleWatch } from './appleHealthService';
import { WorkoutItem } from '../types/dashboard';
import { PlannedWorkout } from '../types/plan';

export interface SyncWorkoutsOptions {
  hasGarmin: boolean;
  hasAppleWatch: boolean;
}

export interface SyncWorkoutsResult {
  success: boolean;
  garminSuccess?: boolean;
  appleSuccess?: boolean;
  syncedCount: number;
  message: string;
  errors: string[];
}

function normalizeDate(w: any): string {
  if (w.date && /^\d{4}-\d{2}-\d{2}$/.test(w.date)) return w.date;
  if (w.fullDate && /^\d{4}-\d{2}-\d{2}$/.test(w.fullDate)) return w.fullDate;
  if (w.dateStr) {
    const trimmed = String(w.dateStr).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    const currentYear = new Date().getFullYear();
    const parsed = new Date(`${trimmed} ${currentYear}`);
    if (!isNaN(parsed.getTime())) {
      const y = parsed.getFullYear();
      const m = String(parsed.getMonth() + 1).padStart(2, '0');
      const d = String(parsed.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  }
  return new Date().toISOString().split('T')[0];
}

function extractSteps(w: any): any[] {
  if (Array.isArray(w.steps) && w.steps.length > 0) return w.steps;
  if (Array.isArray(w.steps_json) && w.steps_json.length > 0) return w.steps_json;
  if (typeof w.steps_json === 'string') {
    try {
      const parsed = JSON.parse(w.steps_json);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Sends workouts to all connected hardware devices (Garmin, Apple Watch/WorkoutKit, or both).
 */
export async function sendWorkoutsToConnectedDevices(
  workouts: WorkoutItem[],
  options: SyncWorkoutsOptions
): Promise<SyncWorkoutsResult> {
  const { hasGarmin, hasAppleWatch } = options;

  if (!hasGarmin && !hasAppleWatch) {
    return {
      success: false,
      syncedCount: 0,
      message: 'No connected devices found. Connect Garmin or Apple Watch in Profile > Connections.',
      errors: ['No devices connected'],
    };
  }

  // Filter out rest days
  const validWorkouts = (workouts || []).filter(
    (w) => String(w.type || (w as any).sport || '').toUpperCase() !== 'REST'
  );

  if (validWorkouts.length === 0) {
    return {
      success: false,
      syncedCount: 0,
      message: 'No active workouts to send.',
      errors: ['No active workouts'],
    };
  }

  let garminSuccess = false;
  let appleSuccess = false;
  const errors: string[] = [];

  // 1. Sync to Garmin Connect if connected
  if (hasGarmin) {
    try {
      const garminPayloads: GarminSyncWorkoutPayload[] = validWorkouts.map((w) => {
        const title = (w.title || (w as any).description || `${w.type || 'RUN'} Workout`).trim();
        return {
          date: normalizeDate(w),
          sport: String(w.type || (w as any).sport || 'RUN').toUpperCase(),
          title,
          description: w.notes || (w as any).details || title,
          rookaPoints: w.rookaPoints || (w as any).target_rooka || 50,
          steps: extractSteps(w),
        };
      });

      await syncGarminWorkout(garminPayloads);
      garminSuccess = true;
    } catch (err: any) {
      console.error('[DeviceSync] Garmin sync failed:', err);
      errors.push(`Garmin: ${err?.message || 'Sync failed'}`);
    }
  }

  // 2. Sync to Apple Watch via WorkoutKit if connected
  if (hasAppleWatch) {
    try {
      let anyAppleSuccess = false;
      for (const w of validWorkouts) {
        const title = (w.title || (w as any).description || `${w.type || 'RUN'} Workout`).trim();
        const applePayload: PlannedWorkout = {
          id: String(w.id || '1'),
          date: normalizeDate(w),
          sport: String(w.type || (w as any).sport || 'RUN').toUpperCase(),
          description: title,
          target_rooka: w.rookaPoints || (w as any).target_rooka || 50,
          steps_json: extractSteps(w),
        };

        const res = await deployWorkoutToAppleWatch(applePayload);
        if (res.success) {
          anyAppleSuccess = true;
        } else {
          errors.push(`Apple Watch (${title}): ${res.message}`);
        }
      }
      appleSuccess = anyAppleSuccess;
    } catch (err: any) {
      console.error('[DeviceSync] Apple Watch sync failed:', err);
      errors.push(`Apple Watch: ${err?.message || 'Sync failed'}`);
    }
  }

  const targetCount = validWorkouts.length;
  const workoutNoun = targetCount === 1 ? 'workout' : 'workouts';

  // Determine overall outcome and messaging
  if (hasGarmin && hasAppleWatch) {
    if (garminSuccess && appleSuccess) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return {
        success: true,
        garminSuccess: true,
        appleSuccess: true,
        syncedCount: targetCount,
        message: `Successfully sent ${targetCount} ${workoutNoun} to Garmin Connect and Apple Watch!`,
        errors,
      };
    } else if (garminSuccess) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return {
        success: true,
        garminSuccess: true,
        appleSuccess: false,
        syncedCount: targetCount,
        message: `Sent to Garmin Connect (Apple Watch failed: ${errors[0] || 'Unknown error'})`,
        errors,
      };
    } else if (appleSuccess) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return {
        success: true,
        garminSuccess: false,
        appleSuccess: true,
        syncedCount: targetCount,
        message: `Sent to Apple Watch (Garmin failed: ${errors[0] || 'Unknown error'})`,
        errors,
      };
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return {
        success: false,
        garminSuccess: false,
        appleSuccess: false,
        syncedCount: 0,
        message: `Failed to send to devices: ${errors.join('; ')}`,
        errors,
      };
    }
  } else if (hasGarmin) {
    if (garminSuccess) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return {
        success: true,
        garminSuccess: true,
        syncedCount: targetCount,
        message: `Successfully sent ${targetCount} ${workoutNoun} to Garmin Connect!`,
        errors,
      };
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return {
        success: false,
        garminSuccess: false,
        syncedCount: 0,
        message: `Garmin sync failed: ${errors[0] || 'Unknown error'}`,
        errors,
      };
    }
  } else if (hasAppleWatch) {
    if (appleSuccess) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return {
        success: true,
        appleSuccess: true,
        syncedCount: targetCount,
        message: `Successfully sent ${targetCount} ${workoutNoun} to Apple Watch!`,
        errors,
      };
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return {
        success: false,
        appleSuccess: false,
        syncedCount: 0,
        message: `Apple Watch sync failed: ${errors[0] || 'Unknown error'}`,
        errors,
      };
    }
  }

  return {
    success: false,
    syncedCount: 0,
    message: 'Unknown sync error',
    errors,
  };
}
