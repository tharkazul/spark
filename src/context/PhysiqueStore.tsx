import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { translate as tr } from '../locales/i18n';
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
  // Plain English defaults are only placeholders; the UI swaps them for translations (see focusTitle fallback below).
  focusTitle: '',
  rationale: '',
  loggedCarbs: 0,
  carbsTarget: 300,
  loggedProtein: 0,
  proteinTarget: 140,
  loggedFat: 0,
  fatTarget: 65,
  loggedItems: [],
};

const PhysiqueContext = createContext<PhysiqueContextType | undefined>(undefined);

export const PhysiqueStore: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isAuthenticated, user } = useUser();
  // Nutrition targets come from the AI coach, so they're only fetched with consent.
  const aiEnabled = user?.aiConsent === true;
  const [physiqueLogs, setPhysiqueLogs] = useState<PhysiqueEntry[]>([]);
  const [nutrition, setNutrition] = useState<NutritionProtocol>(defaultNutrition);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const refreshPhysique = React.useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    try {
      const [logsData, nutritionData] = await Promise.allSettled([
        physiqueApi.getPhysiqueLogs(),
        aiEnabled ? physiqueApi.getNutritionProtocol() : Promise.resolve(null),
      ]);
      if (!aiEnabled) setNutrition(defaultNutrition);

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
          : (p.items_summary
              ? p.items_summary
                  .split(',')
                  .map((s: string) => s.trim().replace(/^(and\s+a\s+|and\s+|also\s+had\s+|besides\s+that\s+)/i, '').trim())
                  .filter(Boolean)
              : []);

        const rawTiming = suggested.timing || p.timing || suggested.fueling_schedule || p.fueling_schedule;
        const timing = Array.isArray(rawTiming) ? rawTiming : undefined;

        setNutrition({
          focusTitle: suggested.title || p.title || p.focusTitle || tr('coachStore.nutritionTitle'),
          rationale: suggested.rationale || p.rationale || tr('coachStore.nutritionRationale'),
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
          timing,
        });
      }
      setError(null);
    } catch (err: any) {
      console.log('PhysiqueStore fetch info:', err.message || err);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, aiEnabled]);

  const logPhysique = React.useCallback(async (entry: Partial<PhysiqueEntry>) => {
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
  }, []);

  const clearLoggedNutrition = React.useCallback(async () => {
    try {
      await physiqueApi.clearLoggedNutrition();
      await refreshPhysique();
    } catch (err) {
      console.error('Failed to clear logged nutrition:', err);
    }
  }, [refreshPhysique]);

  useEffect(() => {
    if (!isAuthenticated) {
      setPhysiqueLogs([]);
      setNutrition(defaultNutrition);
      return;
    }
    refreshPhysique();
  }, [isAuthenticated, refreshPhysique]);

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
