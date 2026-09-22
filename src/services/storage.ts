import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { PlannedWorkout } from '../types/plan';
import { Activity } from '../types/activity';
import { Quest, UserTitle } from '../types/gamification';
import { Niggle } from '../types/health';

const TOKEN_KEY = 'rooka_auth_token';

export const tokenStorage = {
  async getToken(): Promise<string | null> {
    try {
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined' && window.localStorage) {
          return window.localStorage.getItem(TOKEN_KEY);
        }
        return null;
      }
      // Check AsyncStorage first
      let token = await AsyncStorage.getItem(TOKEN_KEY);
      if (!token) {
        // Fallback: migrate from SecureStore if present
        token = await SecureStore.getItemAsync(TOKEN_KEY).catch(() => null);
        if (token) {
          await AsyncStorage.setItem(TOKEN_KEY, token).catch(() => {});
          await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {});
        }
      }
      return token;
    } catch (error) {
      console.error('Error reading auth token:', error);
      return null;
    }
  },

  async setToken(token: string): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem(TOKEN_KEY, token);
        }
        return;
      }
      await AsyncStorage.setItem(TOKEN_KEY, token);
    } catch (error) {
      console.error('Error saving auth token:', error);
    }
  },

  async removeToken(): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.removeItem(TOKEN_KEY);
        }
        return;
      }
      await AsyncStorage.removeItem(TOKEN_KEY);
      await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {});
    } catch (error) {
      console.error('Error removing auth token:', error);
    }
  },
};

const PROFILE_KEY = 'rooka_user_profile';

export const profileStorage = {
  async getProfile(): Promise<any | null> {
    try {
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined' && window.localStorage) {
          const raw = window.localStorage.getItem(PROFILE_KEY);
          return raw ? JSON.parse(raw) : null;
        }
        return null;
      }
      const raw = await AsyncStorage.getItem(PROFILE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  },

  async setProfile(profile: any): Promise<void> {
    try {
      const data = JSON.stringify(profile);
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem(PROFILE_KEY, data);
        }
        return;
      }
      await AsyncStorage.setItem(PROFILE_KEY, data);
    } catch (e) {}
  },

  async removeProfile(): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.removeItem(PROFILE_KEY);
        }
        return;
      }
      await AsyncStorage.removeItem(PROFILE_KEY);
    } catch (e) {}
  },
};

const LANG_KEY = 'rooka_app_language';

export const languageStorage = {
  async getLanguage(): Promise<string | null> {
    try {
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined' && window.localStorage) {
          return window.localStorage.getItem(LANG_KEY);
        }
        return null;
      }
      return await AsyncStorage.getItem(LANG_KEY);
    } catch (error) {
      return null;
    }
  },

  async setLanguage(lang: string): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem(LANG_KEY, lang);
        }
        return;
      }
      await AsyncStorage.setItem(LANG_KEY, lang);
    } catch (error) {}
  },
};

const CHAT_KEY = 'rooka_chat_history';

export const chatStorage = {
  async getChatHistory(userId?: string | number): Promise<any[] | null> {
    const key = userId ? `${CHAT_KEY}_${userId}` : CHAT_KEY;
    try {
      let raw: string | null = null;
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined' && window.localStorage) {
          raw = window.localStorage.getItem(key);
        }
      } else {
        raw = await AsyncStorage.getItem(key);
        if (!raw && !userId) {
          // Fallback check legacy SecureStore key and migrate
          raw = await SecureStore.getItemAsync(CHAT_KEY).catch(() => null);
          if (raw) {
            await AsyncStorage.setItem(CHAT_KEY, raw).catch(() => {});
            await SecureStore.deleteItemAsync(CHAT_KEY).catch(() => {});
          }
        }
      }
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  },

  async setChatHistory(messages: any[], userId?: string | number): Promise<void> {
    const key = userId ? `${CHAT_KEY}_${userId}` : CHAT_KEY;
    try {
      const recentMessages = Array.isArray(messages) ? messages.slice(-50) : [];
      const data = JSON.stringify(recentMessages);
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem(key, data);
        }
      } else {
        await AsyncStorage.setItem(key, data);
      }
    } catch (e) {}
  },

  async clearChatHistory(userId?: string | number): Promise<void> {
    const key = userId ? `${CHAT_KEY}_${userId}` : CHAT_KEY;
    try {
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.removeItem(key);
          if (userId) window.localStorage.removeItem(CHAT_KEY);
        }
      } else {
        await AsyncStorage.removeItem(key);
        if (userId) await AsyncStorage.removeItem(CHAT_KEY);
        await SecureStore.deleteItemAsync(CHAT_KEY).catch(() => {});
      }
    } catch (e) {}
  },
};

const BRIEFING_KEY = 'rooka_daily_briefing';

export const briefingStorage = {
  async getDailyBriefing(dateStr: string): Promise<string | null> {
    try {
      let raw: string | null = null;
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined' && window.localStorage) {
          raw = window.localStorage.getItem(BRIEFING_KEY);
        }
      } else {
        raw = await AsyncStorage.getItem(BRIEFING_KEY);
      }
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.date === dateStr && parsed.text) {
          return parsed.text;
        }
      }
      return null;
    } catch (e) {
      return null;
    }
  },

  async setDailyBriefing(dateStr: string, text: string): Promise<void> {
    try {
      const data = JSON.stringify({ date: dateStr, text });
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem(BRIEFING_KEY, data);
        }
      } else {
        await AsyncStorage.setItem(BRIEFING_KEY, data);
      }
    } catch (e) {}
  },

  async clearBriefing(): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.removeItem(BRIEFING_KEY);
        }
      } else {
        await AsyncStorage.removeItem(BRIEFING_KEY);
      }
    } catch (e) {}
  },
};

const CHAT_READ_KEY = 'rooka_chat_last_read_timestamp';

export const chatReadStorage = {
  async getLastReadTimestamp(userId?: string | number): Promise<number> {
    const key = userId ? `${CHAT_READ_KEY}_${userId}` : CHAT_READ_KEY;
    try {
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined' && window.localStorage) {
          const raw = window.localStorage.getItem(key);
          return raw ? parseInt(raw, 10) : 0;
        }
        return 0;
      }
      const raw = await AsyncStorage.getItem(key);
      return raw ? parseInt(raw, 10) : 0;
    } catch (e) {
      return 0;
    }
  },

  async setLastReadTimestamp(timestamp: number, userId?: string | number): Promise<void> {
    const key = userId ? `${CHAT_READ_KEY}_${userId}` : CHAT_READ_KEY;
    try {
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem(key, timestamp.toString());
        }
        return;
      }
      await AsyncStorage.setItem(key, timestamp.toString());
    } catch (e) {}
  },
};

const GOALS_KEY = 'rooka_user_goals';

export const goalsStorage = {
  async getGoals(userId?: string | number): Promise<any[] | null> {
    if (!userId) return null;
    const key = `${GOALS_KEY}_${userId}`;
    try {
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined' && window.localStorage) {
          const raw = window.localStorage.getItem(key);
          return raw ? JSON.parse(raw) : null;
        }
        return null;
      }
      const raw = await AsyncStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  },

  async setGoals(goals: any[], userId?: string | number): Promise<void> {
    if (!userId) return;
    const key = `${GOALS_KEY}_${userId}`;
    try {
      const data = JSON.stringify(goals || []);
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem(key, data);
          window.localStorage.removeItem(GOALS_KEY);
        }
        return;
      }
      await AsyncStorage.setItem(key, data);
      await AsyncStorage.removeItem(GOALS_KEY).catch(() => {});
    } catch (e) {}
  },

  async clearGoals(userId?: string | number): Promise<void> {
    const key = userId ? `${GOALS_KEY}_${userId}` : GOALS_KEY;
    try {
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.removeItem(key);
          if (userId) window.localStorage.removeItem(GOALS_KEY);
        }
      } else {
        await AsyncStorage.removeItem(key);
        if (userId) await AsyncStorage.removeItem(GOALS_KEY);
      }
    } catch (e) {}
  },
};

const PLAN_CACHE_KEY = 'rooka_plan_cache';

export const planStorage = {
  async getPlan(userId?: string | number): Promise<PlannedWorkout[] | null> {
    const key = userId ? `${PLAN_CACHE_KEY}_${userId}` : PLAN_CACHE_KEY;
    try {
      let raw: string | null = null;
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined' && window.localStorage) {
          raw = window.localStorage.getItem(key);
        }
      } else {
        raw = await AsyncStorage.getItem(key);
      }
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : null;
    } catch (e) {
      console.warn('planStorage read error:', e);
      return null;
    }
  },

  async setPlan(plan: PlannedWorkout[], userId?: string | number): Promise<void> {
    const key = userId ? `${PLAN_CACHE_KEY}_${userId}` : PLAN_CACHE_KEY;
    try {
      const data = JSON.stringify(plan || []);
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem(key, data);
        }
        return;
      }
      await AsyncStorage.setItem(key, data);
    } catch (e) {
      console.warn('planStorage save error:', e);
    }
  },

  async clearPlan(userId?: string | number): Promise<void> {
    const key = userId ? `${PLAN_CACHE_KEY}_${userId}` : PLAN_CACHE_KEY;
    try {
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.removeItem(key);
          if (userId) window.localStorage.removeItem(PLAN_CACHE_KEY);
        }
        return;
      }
      await AsyncStorage.removeItem(key);
      if (userId) await AsyncStorage.removeItem(PLAN_CACHE_KEY);
    } catch {}
  },
};

const ACTIVITY_CACHE_KEY = 'rooka_activity_cache';

export const activityStorage = {
  async getActivities(userId?: string | number): Promise<Activity[] | null> {
    const key = userId ? `${ACTIVITY_CACHE_KEY}_${userId}` : ACTIVITY_CACHE_KEY;
    try {
      let raw: string | null = null;
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined' && window.localStorage) {
          raw = window.localStorage.getItem(key);
        }
      } else {
        raw = await AsyncStorage.getItem(key);
      }
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : null;
    } catch (e) {
      console.warn('activityStorage read error:', e);
      return null;
    }
  },

  async setActivities(activities: Activity[], userId?: string | number): Promise<void> {
    const key = userId ? `${ACTIVITY_CACHE_KEY}_${userId}` : ACTIVITY_CACHE_KEY;
    try {
      const data = JSON.stringify(activities || []);
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem(key, data);
        }
        return;
      }
      await AsyncStorage.setItem(key, data);
    } catch (e) {
      console.warn('activityStorage save error:', e);
    }
  },

  async clearActivities(userId?: string | number): Promise<void> {
    const key = userId ? `${ACTIVITY_CACHE_KEY}_${userId}` : ACTIVITY_CACHE_KEY;
    try {
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.removeItem(key);
          if (userId) window.localStorage.removeItem(ACTIVITY_CACHE_KEY);
        }
        return;
      }
      await AsyncStorage.removeItem(key);
      if (userId) await AsyncStorage.removeItem(ACTIVITY_CACHE_KEY);
    } catch {}
  },
};

const GAMIFICATION_CACHE_KEY = 'rooka_gamification_cache';

export interface CachedGamification {
  quests: Quest[];
  titles: UserTitle[];
}

export const gamificationStorage = {
  async getGamification(userId?: string | number): Promise<CachedGamification | null> {
    const key = userId ? `${GAMIFICATION_CACHE_KEY}_${userId}` : GAMIFICATION_CACHE_KEY;
    try {
      let raw: string | null = null;
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined' && window.localStorage) {
          raw = window.localStorage.getItem(key);
        }
      } else {
        raw = await AsyncStorage.getItem(key);
      }
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      return {
        quests: Array.isArray(parsed.quests) ? parsed.quests : [],
        titles: Array.isArray(parsed.titles) ? parsed.titles : [],
      };
    } catch (e) {
      console.warn('gamificationStorage read error:', e);
      return null;
    }
  },

  async setGamification(data: CachedGamification, userId?: string | number): Promise<void> {
    const key = userId ? `${GAMIFICATION_CACHE_KEY}_${userId}` : GAMIFICATION_CACHE_KEY;
    try {
      const serialized = JSON.stringify({
        quests: data?.quests || [],
        titles: data?.titles || [],
      });
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem(key, serialized);
        }
        return;
      }
      await AsyncStorage.setItem(key, serialized);
    } catch (e) {
      console.warn('gamificationStorage save error:', e);
    }
  },

  async clearGamification(userId?: string | number): Promise<void> {
    const key = userId ? `${GAMIFICATION_CACHE_KEY}_${userId}` : GAMIFICATION_CACHE_KEY;
    try {
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.removeItem(key);
          if (userId) window.localStorage.removeItem(GAMIFICATION_CACHE_KEY);
        }
        return;
      }
      await AsyncStorage.removeItem(key);
      if (userId) await AsyncStorage.removeItem(GAMIFICATION_CACHE_KEY);
    } catch {}
  },
};

const NIGGLE_CACHE_KEY = 'rooka_niggle_cache';

export const niggleStorage = {
  async getNiggles(userId?: string | number): Promise<Niggle[] | null> {
    const key = userId ? `${NIGGLE_CACHE_KEY}_${userId}` : NIGGLE_CACHE_KEY;
    try {
      let raw: string | null = null;
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined' && window.localStorage) {
          raw = window.localStorage.getItem(key);
        }
      } else {
        raw = await AsyncStorage.getItem(key);
      }
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : null;
    } catch (e) {
      console.warn('niggleStorage read error:', e);
      return null;
    }
  },

  async setNiggles(niggles: Niggle[], userId?: string | number): Promise<void> {
    const key = userId ? `${NIGGLE_CACHE_KEY}_${userId}` : NIGGLE_CACHE_KEY;
    try {
      const data = JSON.stringify(niggles || []);
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem(key, data);
        }
        return;
      }
      await AsyncStorage.setItem(key, data);
    } catch (e) {
      console.warn('niggleStorage save error:', e);
    }
  },

  async clearNiggles(userId?: string | number): Promise<void> {
    const key = userId ? `${NIGGLE_CACHE_KEY}_${userId}` : NIGGLE_CACHE_KEY;
    try {
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.removeItem(key);
          if (userId) window.localStorage.removeItem(NIGGLE_CACHE_KEY);
        }
        return;
      }
      await AsyncStorage.removeItem(key);
      if (userId) await AsyncStorage.removeItem(NIGGLE_CACHE_KEY);
    } catch {}
  },
};

