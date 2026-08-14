import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { PhysiqueEntry, NutritionProtocol } from '../types/physique';
import { physiqueApi } from '../services/apiServices';
import { useUser } from './UserStore';

interface PhysiqueContextType {
  physiqueLogs: PhysiqueEntry[];
  nutrition: NutritionProtocol;
  loading: boolean;
  error: string | null;
  refreshPhysique: () => Promise<void>;
  logPhysique: (entry: Partial<PhysiqueEntry>) => Promise<void>;
  clearLoggedNutrition: () => Promise<void>;
}

const defaultNutrition: NutritionProtocol = {
  focusTitle: 'Threshold Run Fuel & Muscle Recovery',
  rationale:
    'Based on your high 24 Spark Points load yesterday, prioritize complex carbs and quick protein synthesis to restore glycogen stores.',
  loggedCarbs: 320,
  carbsTarget: 350,
  loggedProtein: 160,
  proteinTarget: 170,
  loggedFat: 65,
  fatTarget: 70,
};

const defaultLogs: PhysiqueEntry[] = [];

const PhysiqueContext = createContext<PhysiqueContextType | undefined>(undefined);

export const PhysiqueStore: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useUser();
  const [physiqueLogs, setPhysiqueLogs] = useState<PhysiqueEntry[]>([]);
  const [nutrition, setNutrition] = useState<NutritionProtocol>(defaultNutrition);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const refreshPhysique = async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    try {
      const [logsData, nutritionData] = await Promise.allSettled([
        physiqueApi.getPhysiqueLogs(),
        physiqueApi.getNutritionProtocol(),
      ]);

      if (logsData.status === 'fulfilled' && Array.isArray(logsData.value) && logsData.value.length > 0) {
        setPhysiqueLogs(logsData.value);
      }

      if (nutritionData.status === 'fulfilled' && nutritionData.value) {
        const p: any = nutritionData.value;
        const suggested = p.suggested || p;
        const intake = p.intake || {};

        const carbsTarget = Number(suggested.carbs || p.carbsTarget || p.carbs || 300);
        const proteinTarget = Number(suggested.protein || p.proteinTarget || p.protein || 140);
        const fatTarget = Number(suggested.fat || p.fatTarget || p.fat || 65);

        const loggedCarbs = Number(p.loggedCarbs ?? intake.carbs ?? 0);
        const loggedProtein = Number(p.loggedProtein ?? intake.protein ?? 0);
        const loggedFat = Number(p.loggedFat ?? intake.fat ?? 0);
        const loggedItems = Array.isArray(p.loggedItems)
          ? p.loggedItems
          : (p.items_summary ? p.items_summary.split(',').map((s: string) => s.trim()).filter(Boolean) : []);

        setNutrition({
          focusTitle: suggested.title || p.title || p.focusTitle || 'Daily Endurance Protocol',
          rationale: suggested.rationale || p.rationale || 'Tailored to your body mass and today\'s training load.',
          carbs: carbsTarget,
          carbsTarget: carbsTarget,
          protein: proteinTarget,
          proteinTarget: proteinTarget,
          fat: fatTarget,
          fatTarget: fatTarget,
          loggedCarbs,
          loggedProtein,
          loggedFat,
          loggedItems,
        });
      }
      setError(null);
    } catch (err: any) {
      console.log('PhysiqueStore fetch info:', err.message || err);
    } finally {
      setLoading(false);
    }
  };

  const logPhysique = async (entry: Partial<PhysiqueEntry>) => {
    const newEntry: PhysiqueEntry = {
      id: Date.now(),
      date: new Date().toISOString().split('T')[0],
      weight_kg: entry.weight_kg || 74.0,
      ...entry,
    };
    setPhysiqueLogs((prev) => [newEntry, ...prev]);
    try {
      await physiqueApi.logPhysique(entry);
    } catch (err) {
      console.error('Log physique sync error:', err);
    }
  };

  const clearLoggedNutrition = async () => {
    try {
      await physiqueApi.clearLoggedNutrition();
      await refreshPhysique();
    } catch (err) {
      console.error('Failed to clear logged nutrition:', err);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    refreshPhysique();
  }, [isAuthenticated]);

  return (
    <PhysiqueContext.Provider
      value={{
        physiqueLogs,
        nutrition,
        loading,
        error,
        refreshPhysique,
        logPhysique,
        clearLoggedNutrition,
      }}
    >
      {children}
    </PhysiqueContext.Provider>
  );
};

export const usePhysique = (): PhysiqueContextType => {
  const context = useContext(PhysiqueContext);
  if (!context) {
    throw new Error('usePhysique must be used within a PhysiqueStore');
  }
  return context;
};
