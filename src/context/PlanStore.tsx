import React, { useMemo, createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { useStableFns } from '../hooks/useStableFns';
import { keepIfSame } from '../utils/keepIfSame';
import { PlannedWorkout } from '../types/plan';
import { planApi } from '../services/apiServices';
import { useUser } from './UserStore';
import { wsService } from '../services/websocket';
import { planStorage } from '../services/storage';
import { offlineSync } from '../services/offlineSync';

interface PlanContextType {
  plan: PlannedWorkout[];
  loading: boolean;
  error: string | null;
  refreshPlan: () => Promise<void>;
  addWorkout: (workout: Partial<PlannedWorkout>) => Promise<void>;
  updateWorkout: (id: string | number, workout: Partial<PlannedWorkout>) => Promise<void>;
  deleteWorkout: (id: string | number) => Promise<void>;
  toggleComplete: (id: string | number) => void;
  adaptPlan: (params: any) => Promise<void>;
  pushForward: (dateStr: string) => Promise<void>;
}

const defaultPlan: PlannedWorkout[] = [];

const PlanContext = createContext<PlanContextType | undefined>(undefined);

export const PlanStore: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isAuthenticated, user } = useUser();
  const [plan, setPlan] = useState<PlannedWorkout[]>(defaultPlan);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const hasFreshServerDataRef = useRef<boolean>(false);
  const userId = user?.id;

  // The loading flag only shows a placeholder while there is no plan yet; flipping it
  // on every background refresh redrew every screen that uses the plan twice.
  const hasPlanRef = useRef(false);
  hasPlanRef.current = plan.length > 0;

  const refreshPlan = React.useCallback(async () => {
    if (!isAuthenticated) return;
    if (!hasPlanRef.current) setLoading(true);
    try {
      const data = await planApi.getMicroPlan();
      if (data && Array.isArray(data)) {
        hasFreshServerDataRef.current = true;
        setPlan(keepIfSame(data));
        planStorage.setPlan(data, userId).catch(() => {});
      }
      setError(null);
    } catch (err: any) {
      console.log('PlanStore fetch info:', err.message || err);
      // Do not clear existing cached plan on network error
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, userId]);

  const addWorkout = React.useCallback(async (workout: Partial<PlannedWorkout>) => {
    const localId = `w-${Date.now()}`;
    // Optimistic local update
    setPlan((prev) => {
      const next = [...prev, { id: localId, isCompleted: false, ...workout } as PlannedWorkout];
      planStorage.setPlan(next, userId).catch(() => {});
      return next;
    });

    try {
      await planApi.addWorkout(workout);
      await refreshPlan();
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      const isNetworkErr =
        err?.status === 0 ||
        !offlineSync.getStatus().isOnline ||
        errMsg.includes('Network') ||
        errMsg.includes('Failed to fetch');

      if (isNetworkErr) {
        console.log('[PlanStore] Network error; queued addWorkout for offline sync:', workout.title);
        await offlineSync.enqueueMutation('ADD_PLAN_WORKOUT', workout, localId);
        return;
      }
      console.error('Failed to add workout:', err);
    }
  }, [refreshPlan, userId]);

  const updateWorkout = React.useCallback(async (id: string | number, workout: Partial<PlannedWorkout>) => {
    const stringId = String(id);
    let prevPlanSnapshot: PlannedWorkout[] = [];
    setPlan((prev) => {
      prevPlanSnapshot = prev;
      const next = prev.map((w) => (String(w.id) === stringId ? { ...w, ...workout } : w));
      planStorage.setPlan(next, userId).catch(() => {});
      return next;
    });
    try {
      await planApi.updateWorkout(id, workout);
      await refreshPlan();
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      const isNetworkErr =
        err?.status === 0 ||
        !offlineSync.getStatus().isOnline ||
        errMsg.includes('Network') ||
        errMsg.includes('Failed to fetch');

      if (isNetworkErr) {
        console.log('[PlanStore] Network error; queued updateWorkout for offline sync:', id);
        await offlineSync.enqueueMutation('UPDATE_PLAN_WORKOUT', { id, workout }, id);
        return;
      }

      console.error('Failed to update workout, rolling back:', err);
      setPlan(prevPlanSnapshot);
      planStorage.setPlan(prevPlanSnapshot, userId).catch(() => {});
      throw err;
    }
  }, [refreshPlan, userId]);

  const deleteWorkout = React.useCallback(async (id: string | number) => {
    const stringId = String(id);
    let prevPlanSnapshot: PlannedWorkout[] = [];
    setPlan((prev) => {
      prevPlanSnapshot = prev;
      const next = prev.filter((w) => String(w.id) !== stringId);
      planStorage.setPlan(next, userId).catch(() => {});
      return next;
    });
    try {
      await planApi.deleteWorkout(id);
      await refreshPlan();
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      const isNetworkErr =
        err?.status === 0 ||
        !offlineSync.getStatus().isOnline ||
        errMsg.includes('Network') ||
        errMsg.includes('Failed to fetch');

      if (isNetworkErr) {
        console.log('[PlanStore] Network error; queued deleteWorkout for offline sync:', id);
        await offlineSync.enqueueMutation('DELETE_PLAN_WORKOUT', { id }, id);
        return;
      }

      console.error('Failed to delete workout, rolling back:', err);
      setPlan(prevPlanSnapshot);
      planStorage.setPlan(prevPlanSnapshot, userId).catch(() => {});
      throw err;
    }
  }, [refreshPlan, userId]);

  const toggleComplete = React.useCallback((id: string | number) => {
    const stringId = String(id);
    setPlan((prev) => {
      const next = prev.map((w) => (String(w.id) === stringId ? { ...w, isCompleted: !w.isCompleted } : w));
      planStorage.setPlan(next, userId).catch(() => {});
      return next;
    });
  }, [userId]);

  const adaptPlan = React.useCallback(async (params: any) => {
    setLoading(true);
    try {
      await planApi.generatePlan(params);
      await refreshPlan();
    } catch (err: any) {
      console.error('Failed to adapt plan:', err);
    } finally {
      setLoading(false);
    }
  }, [refreshPlan]);

  const pushForward = React.useCallback(async (dateStr: string) => {
    setLoading(true);
    try {
      await planApi.pushForward(dateStr);
      await refreshPlan();
    } catch (err: any) {
      console.error('Failed to push plan forward:', err);
    } finally {
      setLoading(false);
    }
  }, [refreshPlan]);

  // Hydrate from cache immediately upon mounting or user change
  useEffect(() => {
    if (!isAuthenticated) {
      setPlan(defaultPlan);
      hasFreshServerDataRef.current = false;
      return;
    }

    let isMounted = true;
    const hydrateCache = async () => {
      try {
        const cached = await planStorage.getPlan(userId);
        if (isMounted && cached && Array.isArray(cached) && !hasFreshServerDataRef.current) {
          setPlan(cached);
        }
      } catch (e) {
        console.warn('Error hydrating plan cache:', e);
      }
    };

    hydrateCache();
    refreshPlan();

    const unsubPlan = wsService.subscribeToEvent('plan_updated', () => {
      refreshPlan();
    });
    const unsubOfflineSync = offlineSync.onSyncComplete(() => {
      refreshPlan();
    });

    return () => {
      isMounted = false;
      unsubPlan();
      unsubOfflineSync();
    };
  }, [isAuthenticated, userId, refreshPlan]);

  // One object per change of the data, not per render (see useStableFns).
  const stableFns = useStableFns({ refreshPlan, addWorkout, updateWorkout, deleteWorkout, toggleComplete, adaptPlan, pushForward });
  const contextValue = useMemo(
    () => ({ plan, loading, error, ...stableFns }),
    [plan, loading, error, stableFns]
  );

  return (
    <PlanContext.Provider value={contextValue}>
      {children}
    </PlanContext.Provider>
  );
};

export const usePlan = (): PlanContextType => {
  const context = useContext(PlanContext);
  if (!context) {
    throw new Error('usePlan must be used within a PlanStore');
  }
  return context;
};
