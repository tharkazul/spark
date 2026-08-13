import { apiClient } from './apiClient';
import { UserProfile } from '../types/user';
import { Activity } from '../types/activity';
import { PlannedWorkout } from '../types/plan';
import { PhysiqueEntry, NutritionProtocol } from '../types/physique';
import { Quest, UserTitle } from '../types/gamification';
import { Niggle } from '../types/health';
import { ChatMessage, TokenUsage } from '../types/chat';
import { SocialFeedActivity, ActivityComment, SocialConnection, LeaderboardResponse } from '../types/social';

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
    apiClient<{ success: boolean }>('/api/user/settings/coach', {
      method: 'POST',
      body: JSON.stringify({
        coachTone: data.coach_tone,
        coachName: data.coach_name,
        coachContext: data.coach_context,
        athleteContext: data.athlete_context,
        targetEvent: data.target_event,
        eventDate: data.event_date,
        targetCtl: data.target_ctl,
        onboardingCompleted: data.onboarding_completed,
      }),
      skipAuthInterceptor: true,
    }),
  uploadCoachAvatar: async (mood: string, fileUri: string) => {
    const formData = new FormData();
    const filename = fileUri.split('/').pop() || `avatar_${mood}.jpg`;
    const match = /\.(\w+)$/.exec(filename);
    const type = match ? `image/${match[1]}` : 'image/jpeg';

    formData.append('photo', { uri: fileUri, name: filename, type } as any);
    formData.append('mood', mood);

    return apiClient<{ success: boolean; url: string; mood: string }>('/api/settings/coach-avatar', {
      method: 'POST',
      body: formData,
    });
  },
  trackSparkPlusClick: () =>
    apiClient<{ success: boolean }>('/api/track-spark-plus-click', { method: 'POST' }),
  requestAccountData: () =>
    apiClient<{ success: boolean; message: string }>('/api/request-account-data', { method: 'POST' }),
  deleteAccount: () =>
    apiClient<{ success: boolean; message: string }>('/api/user/account', { method: 'DELETE' }),
};

export const activitiesApi = {
  getActivities: () => apiClient<Activity[]>('/api/history'),
  getActivityDetail: (id: string | number) => apiClient<Activity>(`/api/activity/${id}`),
  getDashboardData: () => apiClient<any>('/api/dashboard-data'),
  syncGarmin: (workouts?: any[]) => apiClient<{ success: boolean; message?: string }>('/api/sync-garmin', { method: 'POST', body: JSON.stringify({ workouts }) }),
  syncStrava: () => apiClient<{ success: boolean; message?: string; count?: number }>('/api/sync-strava', { method: 'POST' }),
  getComments: (activityId: string | number) => apiClient<{ comments: ActivityComment[] }>(`/api/activities/${activityId}/comments`),
  postComment: (activityId: string | number, comment: string) =>
    apiClient<{ success: boolean; comment: ActivityComment }>(`/api/activities/${activityId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ comment }),
    }),
  deleteComment: (activityId: string | number, commentId: string | number) =>
    apiClient<{ success: boolean; deletedId: string | number }>(`/api/activities/${activityId}/comments/${commentId}`, {
      method: 'DELETE',
    }),
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
    apiClient<{
      title?: string;
      rationale?: string;
      carbs?: number;
      protein?: number;
      fat?: number;
      carbsTarget?: number;
      proteinTarget?: number;
      fatTarget?: number;
      loggedCarbs?: number;
      loggedProtein?: number;
      loggedFat?: number;
      loggedItems?: string[];
    }>('/api/physique/nutrition'),
  clearLoggedNutrition: () =>
    apiClient<{ success: boolean }>('/api/physique/nutrition/clear', {
      method: 'POST',
    }),
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
  logCycleStart: (cycleStartDate: string) =>
    apiClient<{ success: boolean }>('/api/user/cycle/log', {
      method: 'POST',
      body: JSON.stringify({ cycleStartDate }),
    }),
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

export const adminApi = {
  getUsage: () => apiClient<any[]>('/api/admin/usage'),
  simulate24h: () => apiClient<{ success: boolean; message?: string }>('/api/admin/simulate-24h', { method: 'POST' }),
  triggerMorning: () => apiClient<{ success: boolean; message?: string }>('/api/admin/trigger-morning', { method: 'POST' }),
  addTokens: (targetUsername: string) =>
    apiClient<{ success: boolean; message?: string }>('/api/admin/add-tokens', {
      method: 'POST',
      body: JSON.stringify({ targetUsername }),
    }),
  setTier: (targetUsername: string, tier: string) =>
    apiClient<{ success: boolean; message?: string }>('/api/admin/set-tier', {
      method: 'POST',
      body: JSON.stringify({ targetUsername, tier }),
    }),
  deleteUser: (targetUsername: string) =>
    apiClient<{ success: boolean; message?: string }>(`/api/admin/delete-user/${encodeURIComponent(targetUsername)}`, {
      method: 'DELETE',
    }),
};

export const socialApi = {
  getFeed: () => apiClient<{ activities: SocialFeedActivity[] }>('/api/social/feed'),
  toggleKudos: (activityId: string | number) =>
    apiClient<{ success: boolean; added: boolean }>('/api/social/kudos', {
      method: 'POST',
      body: JSON.stringify({ activityId }),
    }),
  getLeaderboard: () => apiClient<LeaderboardResponse>('/api/social/leaderboard'),
  getConnections: () => apiClient<{ connections: SocialConnection[] }>('/api/social/connections'),
  searchUser: (username: string) =>
    apiClient<{ found: boolean; user?: { id: number; username: string; status?: string } }>('/api/social/search', {
      method: 'POST',
      body: JSON.stringify({ username }),
    }),
  connectUser: (friendId: number | string) =>
    apiClient<{ success: boolean }>('/api/social/connect', {
      method: 'POST',
      body: JSON.stringify({ friendId }),
    }),
  acceptUser: (friendId: number | string) =>
    apiClient<{ success: boolean }>('/api/social/accept', {
      method: 'POST',
      body: JSON.stringify({ friendId }),
    }),
  getProfile: (userId: number | string) => apiClient<any>(`/api/social/profile/${userId}`),
  acceptInvite: (inviteId: number | string) =>
    apiClient<{ success: boolean; message?: string }>(`/api/social/invite/${inviteId}/accept`, {
      method: 'POST',
    }),
  declineInvite: (inviteId: number | string) =>
    apiClient<{ success: boolean; message?: string }>(`/api/social/invite/${inviteId}/decline`, {
      method: 'POST',
    }),
};


