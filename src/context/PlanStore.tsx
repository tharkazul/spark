import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { PlannedWorkout } from '../types/plan';
import { planApi } from '../services/apiServices';

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

const defaultPlan: PlannedWorkout[] = [
  {
    id: 'w-today-1',
    day: 'FRI',
    date: '2026-07-24',
    sport: 'SWIM',
    description: 'Sharpening CSS Swim Session',
    target_spark: 24,
    isCompleted: false,
  },
  {
    id: 'w-today-2',
    day: 'FRI',
    date: '2026-07-24',
    sport: 'RUN',
    description: 'Morning Aerobic Maintenance Run',
    target_spark: 32,
    isCompleted: true,
    actualMetrics: '154 avg bpm · 4:48/km pace',
    executionScore: 98,
  },
];

const PlanContext = createContext<PlanContextType | undefined>(undefined);

export const PlanStore: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [plan, setPlan] = useState<PlannedWorkout[]>(defaultPlan);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const refreshPlan = async () => {
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
  };

  const addWorkout = async (workout: Partial<PlannedWorkout>) => {
    try {
      await planApi.addWorkout(workout);
      await refreshPlan();
    } catch (err: any) {
      console.error('Failed to add workout:', err);
      // Fallback local update
      const localId = `w-${Date.now()}`;
      setPlan((prev) => [...prev, { id: localId, target_spark: 30, description: '', sport: 'RUN', date: new Date().toISOString().split('T')[0], ...workout } as PlannedWorkout]);
    }
  };

  const updateWorkout = async (id: string | number, workout: Partial<PlannedWorkout>) => {
    try {
      await planApi.updateWorkout(id, workout);
      await refreshPlan();
    } catch (err: any) {
      console.error('Failed to update workout:', err);
      setPlan((prev) =>
        prev.map((item) => (item.id === id ? { ...item, ...workout } : item))
      );
    }
  };

  const deleteWorkout = async (id: string | number) => {
    try {
      await planApi.deleteWorkout(id);
      await refreshPlan();
    } catch (err: any) {
      console.error('Failed to delete workout:', err);
      setPlan((prev) => prev.filter((item) => item.id !== id));
    }
  };

  const toggleComplete = (id: string | number) => {
    setPlan((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, isCompleted: !item.isCompleted } : item
      )
    );
  };

  const adaptPlan = async (params: any) => {
    setLoading(true);
    try {
      await planApi.generatePlan(params);
      await refreshPlan();
    } catch (err: any) {
      console.error('Adapt plan error:', err);
    } finally {
      setLoading(false);
    }
  };

  const pushForward = async (dateStr: string) => {
    setLoading(true);
    try {
      await planApi.pushForward(dateStr);
      await refreshPlan();
    } catch (err: any) {
      console.error('Push forward error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshPlan();
  }, []);

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
