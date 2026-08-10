import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const TOKEN_KEY = 'spark_auth_token';

export const tokenStorage = {
  async getToken(): Promise<string | null> {
    try {
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined' && window.localStorage) {
          return window.localStorage.getItem(TOKEN_KEY);
        }
        return null;
      }
      return await SecureStore.getItemAsync(TOKEN_KEY);
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
      await SecureStore.setItemAsync(TOKEN_KEY, token);
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
      await SecureStore.deleteItemAsync(TOKEN_KEY);
    } catch (error) {
      console.error('Error removing auth token:', error);
    }
  },
};

const LANG_KEY = 'spark_app_language';

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

const CHAT_KEY = 'spark_chat_history';

export const chatStorage = {
  async getChatHistory(): Promise<any[] | null> {
    try {
      let raw: string | null = null;
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined' && window.localStorage) {
          raw = window.localStorage.getItem(CHAT_KEY);
        }
      } else {
        raw = await AsyncStorage.getItem(CHAT_KEY);
        if (!raw) {
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

  async setChatHistory(messages: any[]): Promise<void> {
    try {
      const recentMessages = Array.isArray(messages) ? messages.slice(-50) : [];
      const data = JSON.stringify(recentMessages);
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem(CHAT_KEY, data);
        }
      } else {
        await AsyncStorage.setItem(CHAT_KEY, data);
      }
    } catch (e) {}
  },

  async clearChatHistory(): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.removeItem(CHAT_KEY);
        }
      } else {
        await AsyncStorage.removeItem(CHAT_KEY);
        await SecureStore.deleteItemAsync(CHAT_KEY).catch(() => {});
      }
    } catch (e) {}
  },
};

const BRIEFING_KEY = 'spark_daily_briefing';

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
};
