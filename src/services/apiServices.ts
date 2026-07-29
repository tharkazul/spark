import { apiClient } from './apiClient';
import { UserProfile } from '../types/user';
import { Activity } from '../types/activity';
import { PlannedWorkout } from '../types/plan';
import { PhysiqueEntry, NutritionProtocol } from '../types/physique';
import { Quest, UserTitle } from '../types/gamification';
import { Niggle } from '../types/health';
import { ChatMessage, TokenUsage } from '../types/chat';

export const authApi = {
  login: (credentials: { email?: string; username?: string; password: string }) =>
    apiClient<{ token: string; message: string; user?: UserProfile }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    }),
  register: (data: { email?: string; username?: string; password: string }) =>
    apiClient<{ token: string; message: string; user?: UserProfile }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

export const userApi = {
  getProfile: () => apiClient<UserProfile>('/api/user/settings'),
  updateSettings: (data: Partial<UserProfile>) =>
    apiClient<{ success: boolean }>('/api/user/settings', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  trackSparkPlusClick: () =>
    apiClient<{ success: boolean }>('/api/track-spark-plus-click', { method: 'POST' }),
};

export const activitiesApi = {
  getActivities: () => apiClient<Activity[]>('/api/history'),
  getDashboardData: () => apiClient<any>('/api/dashboard-data'),
  syncGarmin: (workouts?: any[]) => apiClient<{ success: boolean; message?: string }>('/api/sync-garmin', { method: 'POST', body: JSON.stringify({ workouts }) }),
  syncStrava: () => apiClient<{ success: boolean; message?: string; count?: number }>('/api/sync-strava', { method: 'POST' }),
};

export const integrationsApi = {
  saveGarminCredentials: (credentials: { garminUsername: string; garminPassword: string }) =>
    apiClient<{ success?: boolean; message: string }>('/api/user/settings/garmin', {
      method: 'POST',
      body: JSON.stringify(credentials),
    }),
  disconnectGarmin: () =>
    apiClient<{ success?: boolean; message: string }>('/api/user/disconnect/garmin', {
      method: 'POST',
    }),
  exchangeStravaCode: (code: string) =>
    apiClient<{ success?: boolean; message: string }>('/api/user/settings/strava-exchange', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),
  saveStravaRefreshToken: (stravaRefreshToken: string) =>
    apiClient<{ success?: boolean; message: string }>('/api/user/settings/strava', {
      method: 'POST',
      body: JSON.stringify({ stravaRefreshToken }),
    }),
  disconnectStrava: () =>
    apiClient<{ success?: boolean; message: string }>('/api/user/disconnect/strava', {
      method: 'POST',
    }),
  syncGarmin: (workouts?: any[]) =>
    apiClient<{ success: boolean; message?: string }>('/api/sync-garmin', {
      method: 'POST',
      body: JSON.stringify({ workouts }),
    }),
  syncStrava: () =>
    apiClient<{ success: boolean; message?: string; count?: number }>('/api/sync-strava', {
      method: 'POST',
    }),
};

export const planApi = {
  getMicroPlan: () => apiClient<PlannedWorkout[]>('/api/micro-plan'),
  generatePlan: (params: any) =>
    apiClient<{ reply?: string; mood?: string; planUpdated?: boolean }>('/api/generate-plan', {
      method: 'POST',
      body: JSON.stringify(params),
    }),
  pushForward: (dateStr: string) =>
    apiClient<{ success: boolean; message?: string }>('/api/micro-plan/push-forward', {
      method: 'POST',
      body: JSON.stringify({ date: dateStr }),
    }),
  addWorkout: (data: Partial<PlannedWorkout>) =>
    apiClient<{ success: boolean }>('/api/micro-plan', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateWorkout: (id: string | number, data: Partial<PlannedWorkout>) =>
    apiClient<{ success: boolean }>(`/api/micro-plan/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteWorkout: (id: string | number) =>
    apiClient<{ success: boolean }>(`/api/micro-plan/${id}`, {
      method: 'DELETE',
    }),
  updateDayWorkouts: (date: string, workouts: Partial<PlannedWorkout>[]) =>
    apiClient<{ success: boolean }>('/api/micro-plan/day', {
      method: 'POST',
      body: JSON.stringify({ date, workouts }),
    }),
  acceptSuggestion: (plan: any[]) =>
    apiClient<{ success: boolean; message?: string }>('/api/micro-plan/accept-suggestion', {
      method: 'POST',
      body: JSON.stringify({ plan }),
    }),
};

export const physiqueApi = {
  getPhysiqueLogs: () => apiClient<PhysiqueEntry[]>('/api/physique'),
  getNutritionProtocol: () =>
    apiClient<{ title?: string; rationale?: string; carbs?: number; protein?: number; fat?: number }>('/api/physique/nutrition'),
  logWeight: (data: Partial<PhysiqueEntry>) =>
    apiClient<{ success: boolean }>('/api/weight', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  logPhysique: (data: Partial<PhysiqueEntry>) =>
    apiClient<{ success: boolean }>('/api/physique', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

export const gamificationApi = {
  getGamificationData: () => apiClient<{ quests: Quest[]; titles: UserTitle[]; total_spark: number }>('/api/gamification'),
  generateQuest: () => apiClient<Quest>('/api/gamification/generate_quest', { method: 'POST' }),
};

export const healthApi = {
  getActiveNiggles: () => apiClient<Niggle[]>('/api/niggles/active'),
  getNiggles: () => apiClient<Niggle[]>('/api/niggles'),
  saveNiggle: (data: Partial<Niggle>) =>
    apiClient<{ success: boolean; id: number }>('/api/niggles', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  resolveNiggle: (id: number | string) =>
    apiClient<{ success: boolean }>(`/api/niggles/${id}/resolve`, { method: 'POST' }),
};

export const chatApi = {
  getHistory: () => apiClient<ChatMessage[] | { history: ChatMessage[]; tokenUsage?: TokenUsage }>('/api/chat/history'),
  sendMessage: (message: string, imagesBase64?: string[]) =>
    apiClient<{ reply: string; mood?: string; planUpdated?: boolean; tokenUsage?: TokenUsage }>('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ message, imagesBase64 }),
    }),
  clearHistory: () =>
    apiClient<{ success: boolean; message?: string }>('/api/chat/clear', {
      method: 'POST',
    }),
  checkin: () => apiClient<{ message: string }>('/api/chat/checkin', { method: 'POST' }),
};
