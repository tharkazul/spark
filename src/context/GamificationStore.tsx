import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Quest, UserTitle } from '../types/gamification';
import { gamificationApi } from '../services/apiServices';
import { wsService } from '../services/websocket';
import { useUser } from './UserStore';

interface GamificationContextType {
  quests: Quest[];
  titles: UserTitle[];
  loading: boolean;
  error: string | null;
  refreshGamification: () => Promise<void>;
  generateQuest: () => Promise<void>;
  swapQuest: (questId?: number | string) => Promise<void>;
  claimQuest: (id: number | string) => void;
}

const defaultQuests: Quest[] = [];

const GamificationContext = createContext<GamificationContextType | undefined>(undefined);

export const GamificationStore: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useUser();
  const [quests, setQuests] = useState<Quest[]>(defaultQuests);
  const [titles, setTitles] = useState<UserTitle[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const refreshGamification = async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    try {
      const data = await gamificationApi.getGamificationData();
      if (data && data.quests && Array.isArray(data.quests)) {
        setQuests(data.quests);
      }
      if (data && data.titles) {
        setTitles(data.titles);
      }
      setError(null);
    } catch (err: any) {
      console.log('GamificationStore fetch info:', err.message || err);
    } finally {
      setLoading(false);
    }
  };

  const generateQuest = async () => {
    setLoading(true);
    try {
      // Check if user already has an active quest; if so, swap/refresh it instead of failing
      const activeQuest = quests.find((q) => q.status === 'active');
      if (activeQuest) {
        await swapQuest(activeQuest.id);
        return;
      }

      const res = await gamificationApi.generateQuest();
      if (res && res.quest) {
        setQuests((prev) => [res.quest, ...prev.filter((q) => q.id !== res.quest.id)]);
      }
      await refreshGamification();
    } catch (err: any) {
      console.error('Generate quest error:', err.message || err);
      // If error indicates active quest exists, fallback to refresh
      const activeQuest = quests.find((q) => q.status === 'active');
      if (activeQuest && err.message?.includes('already have an active quest')) {
        await swapQuest(activeQuest.id);
      }
    } finally {
      setLoading(false);
    }
  };

  const swapQuest = async (questId?: number | string) => {
    setLoading(true);
    try {
      const activeQ = quests.find((q) => q.status === 'active');
      const targetId = questId || activeQ?.id || 0;
      const res = await gamificationApi.refreshQuest(targetId);
      if (res && res.quest) {
        setQuests((prev) => [res.quest, ...prev.filter((q) => q.id !== res.quest.id && q.id !== targetId)]);
      }
      await refreshGamification();
    } catch (err: any) {
      console.warn('Swap quest warning:', err.message || err);
      try {
        const res = await gamificationApi.generateQuest();
        if (res && res.quest) {
          setQuests((prev) => [res.quest, ...prev.filter((q) => q.id !== res.quest.id)]);
        }
        await refreshGamification();
      } catch (_) {}
    } finally {
      setLoading(false);
    }
  };

  const claimQuest = (id: number | string) => {
    setQuests((prev) =>
      prev.map((q) => (q.id === id ? { ...q, status: 'claimed' } : q))
    );
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    refreshGamification();

    const unsubQuestUpdated = wsService.subscribeToEvent('quest_updated', () => refreshGamification());
    const unsubQuestCompleted = wsService.subscribeToEvent('quest_completed', () => refreshGamification());
    const unsubTitleUnlocked = wsService.subscribeToEvent('title_unlocked', () => refreshGamification());

    return () => {
      unsubQuestUpdated();
      unsubQuestCompleted();
      unsubTitleUnlocked();
    };
  }, [isAuthenticated]);

  return (
    <GamificationContext.Provider
      value={{
        quests,
        titles,
        loading,
        error,
        refreshGamification,
        generateQuest,
        swapQuest,
        claimQuest,
      }}
    >
      {children}
    </GamificationContext.Provider>
  );
};

export const useGamification = (): GamificationContextType => {
  const context = useContext(GamificationContext);
  if (!context) {
    throw new Error('useGamification must be used within a GamificationStore');
  }
  return context;
};
