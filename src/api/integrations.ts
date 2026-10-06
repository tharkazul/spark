import { apiClient } from '../services/apiClient';

export interface GarminSyncWorkoutPayload {
  date: string;
  sport: string;
  title?: string;
  description?: string;
  rookaPoints?: number;
  steps?: any[];
}

export interface GarminSyncResponse {
  message?: string;
  count?: number;
  error?: string;
}

/**
 * Pushes structured workouts to Garmin Watch via POST /api/sync-garmin
 */
export async function syncGarminWorkout(workouts: GarminSyncWorkoutPayload[]): Promise<GarminSyncResponse> {
  return apiClient<GarminSyncResponse>('/api/sync-garmin', {
    method: 'POST',
    body: JSON.stringify({ workouts }),
  });
}

export type DeviceSyncWorkoutPayload = GarminSyncWorkoutPayload;

export interface CloudDeviceResult {
  id: string;
  name: string;
  success: boolean;
  syncedCount?: number;
  message?: string;
  error?: string;
}

export interface CloudDevicesSyncResponse {
  success: boolean;
  devices: CloudDeviceResult[];
  message?: string;
}

/**
 * Sends structured workouts to every cloud-connected device (Garmin, Suunto, ...)
 * via POST /api/devices/send-workouts. The backend fans out per platform.
 */
export async function sendWorkoutsToCloudDevices(
  workouts: DeviceSyncWorkoutPayload[]
): Promise<CloudDevicesSyncResponse> {
  return apiClient<CloudDevicesSyncResponse>('/api/devices/send-workouts', {
    method: 'POST',
    body: JSON.stringify({ workouts }),
  });
}

/**
 * Pushes structured workout to Apple Watch via WorkoutKit
 */
export async function syncAppleWorkout(workout: any): Promise<GarminSyncResponse> {
  const { deployWorkoutToAppleWatch } = require('../services/appleHealthService');
  return deployWorkoutToAppleWatch(workout);
}

