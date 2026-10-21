import { useEffect, useState } from 'react';
import { AppState, DeviceEventEmitter } from 'react-native';

import { useUser } from '../context/UserStore';

async function readAppleHealthConnected(): Promise<boolean> {
  try {
    const { isAppleHealthConnected } = require('../services/appleHealthService');
    return await isAppleHealthConnected();
  } catch {
    return false;
  }
}

export interface UseActivitySourcesReturn {
  hasAppleHealth: boolean;
  /** Any source that brings workouts in: Apple Health, Strava, Garmin or Suunto. */
  hasActivitySource: boolean;
}

/**
 * Which workout sources the athlete has connected. Apple Health lives on this
 * device only, so it is read from the service rather than the user record;
 * prompts that only looked at Strava/Garmin kept asking Apple Health users to
 * "connect" something they already had.
 */
export function useActivitySources(): UseActivitySourcesReturn {
  const { user } = useUser();
  const [hasAppleHealth, setHasAppleHealth] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const check = () => {
      readAppleHealthConnected().then((connected) => {
        if (!cancelled) setHasAppleHealth(connected);
      });
    };
    check();
    const changed = DeviceEventEmitter.addListener('connectedDevicesChanged', check);
    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => {
      cancelled = true;
      changed.remove();
      foreground.remove();
    };
  }, []);

  const hasCloudSource = Boolean(
    user?.strava_connected ||
      (user as any)?.strava_athlete_id ||
      user?.garmin_connected ||
      (user as any)?.garmin_username ||
      user?.suunto_connected
  );

  return { hasAppleHealth, hasActivitySource: hasAppleHealth || hasCloudSource };
}
