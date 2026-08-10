import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { PhysiqueEntry, NutritionProtocol } from '../types/physique';
import { physiqueApi } from '../services/apiServices';

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
  const [physiqueLogs, setPhysiqueLogs] = useState<PhysiqueEntry[]>([]);
  const [nutrition, setNutrition] = useState<NutritionProtocol>(defaultNutrition);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const refreshPhysique = async () => {
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
        const p = nutritionData.value;
        setNutrition({
          focusTitle: p.title || 'Daily Endurance Protocol',
          rationale: p.rationale || 'Tailored to your body mass and today\'s training load.',
          loggedCarbs: p.loggedCarbs || p.carbs || 0,
          carbsTarget: p.carbsTarget || 300,
          loggedProtein: p.loggedProtein || p.protein || 0,
          proteinTarget: p.proteinTarget || 140,
          loggedFat: p.loggedFat || p.fat || 0,
          fatTarget: p.fatTarget || 65,
          loggedItems: p.loggedItems || [],
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
    refreshPhysique();
  }, []);

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
