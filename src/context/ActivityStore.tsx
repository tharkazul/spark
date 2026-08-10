import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Activity } from '../types/activity';
import { activitiesApi } from '../services/apiServices';
import { wsService } from '../services/websocket';

interface ActivityContextType {
  activities: Activity[];
  loading: boolean;
  error: string | null;
  refreshActivities: () => Promise<void>;
  syncGarmin: () => Promise<void>;
  syncStrava: () => Promise<void>;
}

const defaultActivities: Activity[] = [];

const ActivityContext = createContext<ActivityContextType | undefined>(undefined);

export const ActivityStore: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const refreshActivities = async () => {
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
    refreshActivities();

    const unsubActivity = wsService.subscribeToEvent('activity_synced', () => refreshActivities());
    const unsubStrava = wsService.subscribeToEvent('strava_sync_complete', () => refreshActivities());
    const unsubGarmin = wsService.subscribeToEvent('garmin_sync_complete', () => refreshActivities());

    return () => {
      unsubActivity();
      unsubStrava();
      unsubGarmin();
    };
  }, []);

  return (
    <ActivityContext.Provider
      value={{
        activities,
        loading,
        error,
        refreshActivities,
        syncGarmin,
        syncStrava,
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
