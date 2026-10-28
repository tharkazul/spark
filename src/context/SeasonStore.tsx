import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useStableFns } from '../hooks/useStableFns';
import { keepIfSame } from '../utils/keepIfSame';
import { AppState } from 'react-native';

import { seasonApi } from '../services/apiServices';
import { SeasonResponse } from '../types/season';
import { useUser } from './UserStore';

interface SeasonContextType {
  data: SeasonResponse | null;
  loading: boolean;
  /** True once the first server answer (or cache) arrived, so empty states don't flash. */
  loaded: boolean;
  refresh: () => Promise<void>;
  createRacePlan: () => Promise<void>;
}

const SeasonContext = createContext<SeasonContextType>({
  data: null,
  loading: false,
  loaded: false,
  refresh: async () => {},
  createRacePlan: async () => {},
});

// v2: drops a v1 entry that could hold development fixture data.
const cacheKey = (userId: number | string) => `@rooka_season_v2_${userId}`;

/**
 * The road to race day as the server computes it (GET /api/season): season
 * weeks, goal status and race plan. Shared by Home and the Goal page.
 */
export const SeasonStore: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user, isAuthenticated } = useUser();
  const userId = user?.id;
  const [data, setData] = useState<SeasonResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const inFlight = useRef(false);

  const hasDataRef = useRef(false);
  hasDataRef.current = data != null;

  const refresh = useCallback(async () => {
    if (!isAuthenticated || !userId || inFlight.current) return;
    inFlight.current = true;
    // Placeholder only while empty (see PlanStore).
    if (!hasDataRef.current) setLoading(true);
    try {
      const res = await seasonApi.getSeason();
      if (res) {
        setData(keepIfSame<SeasonResponse | null>(res));
        AsyncStorage.setItem(cacheKey(userId), JSON.stringify(res)).catch(() => {});
      }
    } catch (e: any) {
      // A server without the season endpoint (404) has no season to show; drop
      // the cache. Network errors keep the cached copy for offline use.
      if (e?.status === 404) {
        setData(null);
        AsyncStorage.removeItem(cacheKey(userId)).catch(() => {});
      }
      console.log('Season fetch info:', e?.message || e);
    } finally {
      inFlight.current = false;
      setLoading(false);
      setLoaded(true);
    }
  }, [isAuthenticated, userId]);

  const createRacePlan = useCallback(async () => {
    const res = await seasonApi.createRacePlan();
    if (res?.racePlan) {
      setData((prev) => (prev ? { ...prev, racePlan: res.racePlan } : prev));
    }
    await refresh();
  }, [refresh]);

  useEffect(() => {
    setData(null);
    setLoaded(false);
    if (!isAuthenticated || !userId) return;
    AsyncStorage.getItem(cacheKey(userId))
      .then((cached) => {
        if (cached) {
          setData(JSON.parse(cached));
          setLoaded(true);
        }
      })
      .catch(() => {});
    refresh();
  }, [isAuthenticated, userId, refresh]);

  // Weeks roll over and goals change while the app sleeps: refresh on return.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  // One object per change of the data, not per render (see useStableFns).
  const stableFns = useStableFns({ refresh, createRacePlan });
  const contextValue = useMemo(() => ({ data, loading, loaded, ...stableFns }), [data, loading, loaded, stableFns]);

  return <SeasonContext.Provider value={contextValue}>{children}</SeasonContext.Provider>;
};

export const useSeason = () => useContext(SeasonContext);
