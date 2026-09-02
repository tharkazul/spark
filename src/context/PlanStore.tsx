import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { PlannedWorkout } from '../types/plan';
import { planApi } from '../services/apiServices';
import { useUser } from './UserStore';

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
  const { isAuthenticated } = useUser();
  const [plan, setPlan] = useState<PlannedWorkout[]>(defaultPlan);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const refreshPlan = React.useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    try {
      const data = await planApi.getMicroPlan();
      if (data && Array.isArray(data)) {
        setPlan(data);
      }
      setError(null);
    } catch (err: any) {
      console.log('PlanStore fetch info:', err.message || err);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  const addWorkout = React.useCallback(async (workout: Partial<PlannedWorkout>) => {
    try {
      await planApi.addWorkout(workout);
      await refreshPlan();
    } catch (err: any) {
      console.error('Failed to add workout:', err);
      // Fallback local update
      const localId = `w-${Date.now()}`;
      setPlan((prev) => [...prev, { id: localId, isCompleted: false, ...workout } as PlannedWorkout]);
    }
  }, [refreshPlan]);

  const updateWorkout = React.useCallback(async (id: string | number, workout: Partial<PlannedWorkout>) => {
    setPlan((prev) => prev.map((w) => (w.id === id ? { ...w, ...workout } : w)));
    try {
      await planApi.updateWorkout(id, workout);
    } catch (err: any) {
      console.error('Failed to update workout:', err);
    }
  }, []);

  const deleteWorkout = React.useCallback(async (id: string | number) => {
    setPlan((prev) => prev.filter((w) => w.id !== id));
    try {
      await planApi.deleteWorkout(id);
    } catch (err: any) {
      console.error('Failed to delete workout:', err);
    }
  }, []);

  const toggleComplete = React.useCallback((id: string | number) => {
    setPlan((prev) =>
      prev.map((w) => (w.id === id ? { ...w, isCompleted: !w.isCompleted } : w))
    );
  }, []);

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

  useEffect(() => {
    if (!isAuthenticated) {
      setPlan(defaultPlan);
      return;
    }
    refreshPlan();
  }, [isAuthenticated, refreshPlan]);

  return (
    <PlanContext.Provider
      value={{
        plan,
        loading,
        error,
        refreshPlan,
        addWorkout,
        updateWorkout,
        deleteWorkout,
        toggleComplete,
        adaptPlan,
        pushForward,
      }}
    >
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
