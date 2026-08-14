import { apiClient } from '../services/apiClient';

export interface GarminSyncWorkoutPayload {
  date: string;
  sport: string;
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

/**
 * Pushes structured workout to Apple Watch via WorkoutKit
 */
export async function syncAppleWorkout(workout: any): Promise<GarminSyncResponse> {
  const { deployWorkoutToAppleWatch } = require('../services/appleHealthService');
  return deployWorkoutToAppleWatch(workout);
}

