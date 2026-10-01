import { useState, useEffect, useCallback } from 'react';
import { useUser } from '../context/UserStore';
import { WorkoutItem } from '../types/dashboard';
import {
  sendWorkoutsToConnectedDevices,
  SyncWorkoutsResult,
} from '../services/deviceSyncService';

export interface UseConnectedDevicesReturn {
  hasGarmin: boolean;
  hasAppleWatch: boolean;
  hasAnyDevices: boolean;
  isChecking: boolean;
  isSyncing: boolean;
  checkDevices: () => Promise<void>;
  syncWorkouts: (workouts: WorkoutItem[]) => Promise<SyncWorkoutsResult>;
}

export function useConnectedDevices(): UseConnectedDevicesReturn {
  const { user } = useUser();
  const [isAppleWatchAuthorized, setIsAppleWatchAuthorized] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  const hasGarmin = Boolean(
    user?.garmin_connected ||
      (user as any)?.hasGarmin ||
      (user as any)?.garmin_username ||
      (user as any)?.garminUsername
  );

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

  const hasAppleWatch = isAppleWatchAuthorized;
  const hasAnyDevices = hasGarmin || hasAppleWatch;

  const syncWorkouts = useCallback(
    async (workouts: WorkoutItem[]): Promise<SyncWorkoutsResult> => {
      if (!hasAnyDevices) {
        return {
          success: false,
          syncedCount: 0,
          message: 'No connected devices found.',
          errors: ['No devices connected'],
        };
      }

      setIsSyncing(true);
      try {
        const result = await sendWorkoutsToConnectedDevices(workouts, {
          hasGarmin,
          hasAppleWatch,
        });
        return result;
      } finally {
        setIsSyncing(false);
      }
    },
    [hasAnyDevices, hasGarmin, hasAppleWatch]
  );

  return {
    hasGarmin,
    hasAppleWatch,
    hasAnyDevices,
    isChecking,
    isSyncing,
    checkDevices,
    syncWorkouts,
  };
}

export default useConnectedDevices;
