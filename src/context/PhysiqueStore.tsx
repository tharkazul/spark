import React, { useMemo, useRef, createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { AppState } from 'react-native';
import { useStableFns } from '../hooks/useStableFns';
import { keepIfSame } from '../utils/keepIfSame';
import { translate as tr } from '../locales/i18n';
import { PhysiqueEntry, NutritionProtocol } from '../types/physique';
import { physiqueApi } from '../services/apiServices';
import { nutritionStorage } from '../services/storage';
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

// The server's day (logged food resets at midnight Amsterdam time), which keys the local copy.
const nutritionDay = () => {
  const now = new Date();
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam' }).format(now);
  } catch {
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }
};

export const PhysiqueStore: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isAuthenticated, user } = useUser();
  // Nutrition targets come from the AI coach, so they're only fetched with consent.
  const aiEnabled = user?.aiConsent === true;
  const userId = user?.id;
  const [physiqueLogs, setPhysiqueLogs] = useState<PhysiqueEntry[]>([]);
  const [nutrition, setNutrition] = useState<NutritionProtocol>(defaultNutrition);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Placeholder only while empty (see PlanStore).
  const hasLogsRef = useRef(false);
  hasLogsRef.current = physiqueLogs.length > 0;
  // Set once the server answered, so a late read of the local copy can't overwrite it.
  const hasFreshNutritionRef = useRef(false);

  const refreshPhysique = React.useCallback(async () => {
    if (!isAuthenticated) return;
    if (!hasLogsRef.current) setLoading(true);
    try {
      const [logsData, nutritionData] = await Promise.allSettled([
        physiqueApi.getPhysiqueLogs(),
        aiEnabled ? physiqueApi.getNutritionProtocol() : Promise.resolve(null),
      ]);
      if (!aiEnabled) setNutrition(defaultNutrition);

      if (logsData.status === 'fulfilled' && Array.isArray(logsData.value) && logsData.value.length > 0) {
        setPhysiqueLogs(keepIfSame(logsData.value));
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

        const next: NutritionProtocol = {
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
        };
        hasFreshNutritionRef.current = true;
        setNutrition(keepIfSame<NutritionProtocol>(next));
        nutritionStorage.set(userId, nutritionDay(), next).catch(() => {});
      }
      setError(null);
    } catch (err: any) {
      console.log('PhysiqueStore fetch info:', err.message || err);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, aiEnabled, userId]);

  const logPhysique = React.useCallback(async (entry: Partial<PhysiqueEntry>) => {
    // Always a local calendar day (YYYY-MM-DD): the server matches it against
    // the plan for that day, and a UTC timestamp matched nothing.
    const now = new Date();
    const localDay = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const newEntry: PhysiqueEntry = {
      id: Date.now(),
      weight_kg: entry.weight_kg || 74.0,
      ...entry,
      date: entry.date && /^\d{4}-\d{2}-\d{2}$/.test(entry.date) ? entry.date : localDay,
    };
    setPhysiqueLogs((prev) => [newEntry, ...prev]);
    try {
      await physiqueApi.logPhysique({ ...entry, date: newEntry.date });
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
      hasFreshNutritionRef.current = false;
      return;
    }
    // Show today's food as last loaded straight away. Without it the card read zero at every
    // launch until the server answered, and stayed at zero when that one request failed
    // (no connection), which looked like the logged food had been deleted.
    if (aiEnabled) {
      nutritionStorage
        .get<NutritionProtocol>(userId, nutritionDay())
        .then((cached) => {
          if (cached && !hasFreshNutritionRef.current) setNutrition(keepIfSame<NutritionProtocol>(cached));
        })
        .catch(() => {});
    }
    refreshPhysique();
  }, [isAuthenticated, aiEnabled, userId, refreshPhysique]);

  // Back in the foreground: a fetch that failed offline gets another go, and a new day starts empty.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshPhysique();
    });
    return () => sub.remove();
  }, [refreshPhysique]);

  // One object per change of the data, not per render (see useStableFns).
  const stableFns = useStableFns({ refreshPhysique, logPhysique, clearLoggedNutrition });
  const contextValue = useMemo(
    () => ({ physiqueLogs, nutrition, loading, error, ...stableFns }),
    [physiqueLogs, nutrition, loading, error, stableFns]
  );

  return (
    <PhysiqueContext.Provider value={contextValue}>
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
