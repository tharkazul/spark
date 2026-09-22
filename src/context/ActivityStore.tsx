import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { Activity } from '../types/activity';
import { activitiesApi } from '../services/apiServices';
import { wsService } from '../services/websocket';
import { useUser } from './UserStore';
import { activityStorage } from '../services/storage';
import { offlineSync } from '../services/offlineSync';

interface ActivityContextType {
  activities: Activity[];
  loading: boolean;
  error: string | null;
  refreshActivities: () => Promise<void>;
  syncGarmin: () => Promise<void>;
  syncStrava: () => Promise<void>;
  addManualActivity: (newAct: Partial<Activity>) => Promise<void>;
}

const defaultActivities: Activity[] = [];

const ActivityContext = createContext<ActivityContextType | undefined>(undefined);

export const ActivityStore: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isAuthenticated, user } = useUser();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const hasFreshServerDataRef = useRef<boolean>(false);
  const userId = user?.id;

  const refreshActivities = React.useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    try {
      const data = await activitiesApi.getActivities();
      if (data && Array.isArray(data)) {
        hasFreshServerDataRef.current = true;
        setActivities(data);
        activityStorage.setActivities(data, userId).catch(() => {});
      }
      setError(null);
    } catch (err: any) {
      console.log('ActivityStore fetch info:', err.message || err);
      // Do not clear existing cached activities on network error
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, userId]);

  const addManualActivity = React.useCallback(async (newAct: Partial<Activity>) => {
    const durSec = newAct.moving_time || (newAct.moving_time_min ? newAct.moving_time_min * 60 : 1800);
    const distMeters = newAct.distance || (newAct.distance_km ? newAct.distance_km * 1000 : 0);
    const nowIso = new Date().toISOString();
    const formattedActivity: Activity = {
      id: `manual_${Date.now()}`,
      name: newAct.name || 'Manual Workout',
      sport_type: newAct.sport_type || newAct.type || 'RUN',
      type: newAct.type || newAct.sport_type || 'RUN',
      distance_km: newAct.distance_km !== undefined ? newAct.distance_km : (distMeters / 1000),
      moving_time_min: newAct.moving_time_min !== undefined ? newAct.moving_time_min : (durSec / 60),
      start_date: newAct.start_date || nowIso,
      start_date_local: newAct.start_date_local || nowIso,
      moving_time: durSec,
      elapsed_time: durSec,
      distance: distMeters,
      total_elevation_gain: newAct.total_elevation_gain || newAct.elevation_m || 0,
      elevation_m: newAct.elevation_m || newAct.total_elevation_gain || 0,
      average_speed: distMeters && durSec ? distMeters / durSec : 0,
      source: 'manual',
      ...newAct,
    };
    // Optimistic UI update and cache sync
    setActivities((prev) => {
      const next = [formattedActivity, ...prev];
      activityStorage.setActivities(next, userId).catch(() => {});
      return next;
    });

    const payload = {
      name: formattedActivity.name,
      sport_type: formattedActivity.sport_type,
      distance_km: formattedActivity.distance_km,
      moving_time_min: formattedActivity.moving_time_min,
      start_date: formattedActivity.start_date,
      elevation_m: formattedActivity.elevation_m,
      average_heartrate: formattedActivity.average_heartrate,
    };

    try {
      await activitiesApi.logActivity(payload);
      await refreshActivities();
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      const isNetworkErr =
        err?.status === 0 ||
        !offlineSync.getStatus().isOnline ||
        errMsg.includes('Network') ||
        errMsg.includes('Failed to fetch');

      if (isNetworkErr) {
        console.log('[ActivityStore] Network error; queued manual activity for offline sync:', formattedActivity.name);
        await offlineSync.enqueueMutation('LOG_ACTIVITY', payload, formattedActivity.id);
        // Retain optimistic activity in state & storage
        return;
      }

      console.error('Failed to persist manual activity to server, rolling back:', err);
      setActivities((prev) => {
        const rollback = prev.filter((a) => a.id !== formattedActivity.id);
        activityStorage.setActivities(rollback, userId).catch(() => {});
        return rollback;
      });
      throw err;
    }
  }, [refreshActivities, userId]);

  const syncGarmin = React.useCallback(async () => {
    setLoading(true);
    try {
      await activitiesApi.syncGarmin();
      await refreshActivities();
      setError(null);
    } catch (err: any) {
      console.error('Garmin sync error:', err);
      setError(err.message || 'Garmin sync failed.');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [refreshActivities]);

  const syncStrava = React.useCallback(async () => {
    setLoading(true);
    try {
      await activitiesApi.syncStrava();
      await refreshActivities();
      setError(null);
    } catch (err: any) {
      console.error('Strava sync error:', err);
      setError(err.message || 'Strava sync failed.');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [refreshActivities]);

  // Hydrate from cache immediately upon mounting or user change
  useEffect(() => {
    if (!isAuthenticated) {
      setActivities([]);
      hasFreshServerDataRef.current = false;
      return;
    }

    let isMounted = true;
    const hydrateCache = async () => {
      try {
        const cached = await activityStorage.getActivities(userId);
        if (isMounted && cached && Array.isArray(cached) && !hasFreshServerDataRef.current) {
          setActivities(cached);
        }
      } catch (e) {
        console.warn('Error hydrating activities cache:', e);
      }
    };

    hydrateCache();
    refreshActivities();

    const unsubActivity = wsService.subscribeToEvent('activity_synced', () => refreshActivities());
    const unsubStrava = wsService.subscribeToEvent('strava_sync_complete', () => refreshActivities());
    const unsubGarmin = wsService.subscribeToEvent('garmin_sync_complete', () => refreshActivities());
    const unsubOfflineSync = offlineSync.onSyncComplete(() => refreshActivities());

    return () => {
      isMounted = false;
      unsubActivity();
      unsubStrava();
      unsubGarmin();
      unsubOfflineSync();
    };
  }, [isAuthenticated, userId, refreshActivities]);

  return (
    <ActivityContext.Provider
      value={{
        activities,
        loading,
        error,
        refreshActivities,
        syncGarmin,
        syncStrava,
        addManualActivity,
      }}
    >
      {children}
    </ActivityContext.Provider>
  );
};

export const useActivities = (): ActivityContextType => {
  const context = useContext(ActivityContext);
  if (!context) {
    throw new Error('useActivities must be used within an ActivityStore');
  }
  return context;
};
