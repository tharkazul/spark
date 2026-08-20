import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Activity } from '../types/activity';
import { activitiesApi } from '../services/apiServices';
import { wsService } from '../services/websocket';
import { useUser } from './UserStore';

interface ActivityContextType {
  activities: Activity[];
  loading: boolean;
  error: string | null;
  refreshActivities: () => Promise<void>;
  syncGarmin: () => Promise<void>;
  syncStrava: () => Promise<void>;
  addManualActivity: (newAct: Partial<Activity>) => void;
}

const defaultActivities: Activity[] = [];

const ActivityContext = createContext<ActivityContextType | undefined>(undefined);

export const ActivityStore: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useUser();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const addManualActivity = (newAct: Partial<Activity>) => {
    const durSec = newAct.moving_time || 1800;
    const distMeters = newAct.distance || 0;
    const formattedActivity: Activity = {
      id: `manual_${Date.now()}`,
      name: newAct.name || 'Manual Workout',
      type: newAct.type || 'Run',
      start_date_local: new Date().toISOString(),
      moving_time: durSec,
      elapsed_time: durSec,
      distance: distMeters,
      total_elevation_gain: 0,
      average_speed: distMeters && durSec ? distMeters / durSec : 0,
      source: 'manual',
      ...newAct,
    };
    setActivities((prev) => [formattedActivity, ...prev]);
  };

  const refreshActivities = async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    try {
      const data = await activitiesApi.getActivities();
      if (data && Array.isArray(data)) {
        setActivities(data);
      }
      setError(null);
    } catch (err: any) {
      console.log('ActivityStore fetch info:', err.message || err);
    } finally {
      setLoading(false);
    }
  };

  const syncGarmin = async () => {
    setLoading(true);
    try {
      await activitiesApi.syncGarmin();
      await refreshActivities();
    } catch (err: any) {
      console.error('Garmin sync error:', err);
    } finally {
      setLoading(false);
    }
  };

  const syncStrava = async () => {
    setLoading(true);
    try {
      await activitiesApi.syncStrava();
      await refreshActivities();
    } catch (err: any) {
      console.error('Strava sync error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    refreshActivities();

    const unsubActivity = wsService.subscribeToEvent('activity_synced', () => refreshActivities());
    const unsubStrava = wsService.subscribeToEvent('strava_sync_complete', () => refreshActivities());
    const unsubGarmin = wsService.subscribeToEvent('garmin_sync_complete', () => refreshActivities());

    return () => {
      unsubActivity();
      unsubStrava();
      unsubGarmin();
    };
  }, [isAuthenticated]);

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
