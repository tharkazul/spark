import * as Haptics from 'expo-haptics';
import { translate as tr } from '../locales/i18n';
import { sendWorkoutsToCloudDevices, DeviceSyncWorkoutPayload } from '../api/integrations';
import { deployWorkoutToAppleWatch } from './appleHealthService';
import { WorkoutItem } from '../types/dashboard';
import { PlannedWorkout } from '../types/plan';

export interface SyncWorkoutsOptions {
  /** Any server-side device platform (Garmin, Suunto, ...) is connected. */
  hasCloudDevices: boolean;
  /** Apple Watch via on-device WorkoutKit. */
  hasAppleWatch: boolean;
}

export interface DeviceSyncOutcome {
  id: string;
  name: string;
  success: boolean;
  error?: string;
}

export interface SyncWorkoutsResult {
  success: boolean;
  devices?: DeviceSyncOutcome[];
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

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] || '';
  return `${names.slice(0, -1).join(', ')} ${tr('deviceSync.and')} ${names[names.length - 1]}`;
}

/**
 * Sends workouts to every device the user has connected. Cloud platforms
 * (Garmin, Suunto, ...) are fanned out by the backend in one call; Apple Watch
 * is deployed on-device through WorkoutKit.
 */
export async function sendWorkoutsToConnectedDevices(
  workouts: WorkoutItem[],
  options: SyncWorkoutsOptions
): Promise<SyncWorkoutsResult> {
  const { hasCloudDevices, hasAppleWatch } = options;

  if (!hasCloudDevices && !hasAppleWatch) {
    return {
      success: false,
      syncedCount: 0,
      message: tr('deviceSync.noDevicesHint'),
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
      message: tr('deviceSync.noWorkouts'),
      errors: ['No active workouts'],
    };
  }

  const outcomes: DeviceSyncOutcome[] = [];

  // 1. Cloud-connected devices (backend sends to each connected platform)
  if (hasCloudDevices) {
    try {
      const payloads: DeviceSyncWorkoutPayload[] = validWorkouts.map((w) => {
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

      const res = await sendWorkoutsToCloudDevices(payloads);
      for (const d of res.devices || []) {
        outcomes.push({ id: d.id, name: d.name, success: d.success, error: d.error });
      }
    } catch (err: any) {
      console.error('[DeviceSync] Cloud device sync failed:', err);
      outcomes.push({ id: 'cloud', name: 'Connected devices', success: false, error: err?.message || 'Sync failed' });
    }
  }

  // 2. Apple Watch via WorkoutKit
  if (hasAppleWatch) {
    const appleErrors: string[] = [];
    let anyAppleSuccess = false;
    try {
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
          appleErrors.push(`${title}: ${res.message}`);
        }
      }
    } catch (err: any) {
      console.error('[DeviceSync] Apple Watch sync failed:', err);
      appleErrors.push(err?.message || 'Sync failed');
    }
    outcomes.push({
      id: 'apple_watch',
      name: 'Apple Watch',
      success: anyAppleSuccess,
      error: appleErrors.length ? appleErrors.join('; ') : undefined,
    });
  }

  const succeeded = outcomes.filter((o) => o.success);
  const failed = outcomes.filter((o) => !o.success);
  const errors = failed.map((o) => `${o.name}: ${o.error || tr('addWorkoutExtra.syncFailed')}`);
  const targetCount = validWorkouts.length;

  if (succeeded.length === 0) {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    return {
      success: false,
      devices: outcomes,
      syncedCount: 0,
      message: errors.length ? tr('deviceSync.sendFailed', { errors: errors.join('; ') }) : tr('deviceSync.noDevices'),
      errors,
    };
  }

  const sentTo = joinNames(succeeded.map((o) => o.name));
  if (failed.length > 0) {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    return {
      success: true,
      devices: outcomes,
      syncedCount: targetCount,
      message: tr('deviceSync.partial', { devices: sentTo, errors: errors.join('; ') }),
      errors,
    };
  }

  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  return {
    success: true,
    devices: outcomes,
    syncedCount: targetCount,
    message: targetCount === 1 ? tr('deviceSync.sentOne', { devices: sentTo }) : tr('deviceSync.sentMany', { count: targetCount, devices: sentTo }),
    errors,
  };
}
