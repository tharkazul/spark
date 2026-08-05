import * as SecureStore from 'expo-secure-store';
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
        raw = await SecureStore.getItemAsync(CHAT_KEY);
      }
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  },

  async setChatHistory(messages: any[]): Promise<void> {
    try {
      const recentMessages = Array.isArray(messages) ? messages.slice(-20) : [];
      let data = JSON.stringify(recentMessages);
      if (data.length > 2000) {
        data = JSON.stringify(recentMessages.slice(-10));
      }
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem(CHAT_KEY, data);
        }
      } else {
        await SecureStore.setItemAsync(CHAT_KEY, data);
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
        await SecureStore.deleteItemAsync(CHAT_KEY);
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
        raw = await SecureStore.getItemAsync(BRIEFING_KEY);
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
        await SecureStore.setItemAsync(BRIEFING_KEY, data);
      }
    } catch (e) {}
  },
};
