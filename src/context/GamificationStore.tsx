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
  claimQuest: (id: number | string) => void;
}

const defaultQuests: Quest[] = [
  {
    id: 1,
    description: 'Complete 3 Threshold Runs this week',
    target_metric: 'runs',
    target_value: 3,
    reward_points: 150,
    status: 'active',
    target_sport: 'RUN',
    progress: 2,
  },
  {
    id: 2,
    description: 'Log 50km total cycling distance',
    target_metric: 'distance_km',
    target_value: 50,
    reward_points: 200,
    status: 'completed',
    target_sport: 'BIKE',
    progress: 50,
  },
];

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
      const newQuest = await gamificationApi.generateQuest();
      if (newQuest) {
        setQuests((prev) => [...prev, newQuest]);
      }
    } catch (err) {
      console.error('Generate quest error:', err);
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
