import { useState, useEffect, useCallback } from 'react';
import { AppState, DeviceEventEmitter } from 'react-native';
import { translate as tr } from '../locales/i18n';
import { useUser } from '../context/UserStore';
import { WorkoutItem } from '../types/dashboard';
import { UserProfile } from '../types/user';
import {
  sendWorkoutsToConnectedDevices,
  SyncWorkoutsResult,
} from '../services/deviceSyncService';

export interface UseConnectedDevicesReturn {
  hasGarmin: boolean;
  hasSuunto: boolean;
  /** TrainerDay calendar (bike sessions only, ridden in ERG mode); false for a free TrainerDay account. */
  hasTrainerDay: boolean;
  hasAppleWatch: boolean;
  hasAnyDevices: boolean;
  isChecking: boolean;
  isSyncing: boolean;
  checkDevices: () => Promise<void>;
  syncWorkouts: (workouts: WorkoutItem[]) => Promise<SyncWorkoutsResult>;
}

/**
 * Whether planned workouts can go to this athlete's Garmin. The server decides
 * (garminTakesWorkouts): only when the athlete allowed workout import on Garmin's
 * page. A server that doesn't send the field yet falls back to "Garmin is connected".
 */
export function garminTakesWorkouts(user: UserProfile | null | undefined): boolean {
  if (typeof user?.garmin_takes_workouts === 'boolean') return user.garmin_takes_workouts;
  return Boolean(user?.garmin_connected || (user as any)?.hasGarmin);
}

export function useConnectedDevices(): UseConnectedDevicesReturn {
  const { user } = useUser();
  const [isAppleWatchAuthorized, setIsAppleWatchAuthorized] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  // A Garmin that won't take workouts (import not allowed) is no send target, so
  // with no other device the send buttons disappear.
  const hasGarmin = garminTakesWorkouts(user);

  const hasSuunto = Boolean(user?.suunto_connected || (user as any)?.hasSuunto);
  // TrainerDay only takes workouts from paid accounts, so a free one is no send target.
  const hasTrainerDay = Boolean(user?.trainerday_connected && user?.trainerday_pro !== false);
  const hasCloudDevices = hasGarmin || hasSuunto || hasTrainerDay;

  const checkDevices = useCallback(async () => {
    try {
      const {
        isWorkoutKitSupported,
        getWorkoutKitAuthorizationStatus,
      } = require('../services/appleHealthService');

      if (isWorkoutKitSupported && isWorkoutKitSupported()) {
        const status = await getWorkoutKitAuthorizationStatus();
        setIsAppleWatchAuthorized(status === 'authorized');
      } else {
        setIsAppleWatchAuthorized(false);
      }
    } catch {
      setIsAppleWatchAuthorized(false);
    } finally {
      setIsChecking(false);
    }
  }, []);

  useEffect(() => {
    checkDevices();
  }, [checkDevices, user]);

  // The Watch permission can change while these screens stay mounted: granted under
  // Connections (after a reinstall, say) or in the Watch app. Checked once at mount,
  // the send buttons stayed hidden until the app was restarted.
  useEffect(() => {
    const changed = DeviceEventEmitter.addListener('connectedDevicesChanged', checkDevices);
    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkDevices();
    });
    return () => {
      changed.remove();
      foreground.remove();
    };
  }, [checkDevices]);

  const hasAppleWatch = isAppleWatchAuthorized;
  const hasAnyDevices = hasCloudDevices || hasAppleWatch;

  const syncWorkouts = useCallback(
    async (workouts: WorkoutItem[]): Promise<SyncWorkoutsResult> => {
      if (!hasAnyDevices) {
        return {
          success: false,
          syncedCount: 0,
          message: tr('deviceSync.noDevices'),
          errors: ['No devices connected'],
        };
      }

      setIsSyncing(true);
      try {
        const result = await sendWorkoutsToConnectedDevices(workouts, {
          hasCloudDevices,
          hasAppleWatch,
        });
        return result;
      } finally {
        setIsSyncing(false);
      }
    },
    [hasAnyDevices, hasCloudDevices, hasAppleWatch]
  );

  return {
    hasGarmin,
    hasSuunto,
    hasTrainerDay,
    hasAppleWatch,
    hasAnyDevices,
    isChecking,
    isSyncing,
    checkDevices,
    syncWorkouts,
  };
}

export default useConnectedDevices;
