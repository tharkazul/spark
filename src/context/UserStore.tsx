import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { UserProfile } from '../types/user';
import { userApi, authApi } from '../services/apiServices';
import { ApiError, setAuthToken, setOnUnauthorizedHandler, setOnRateLimitHandler } from '../services/apiClient';
import { tokenStorage, chatStorage, briefingStorage } from '../services/storage';
import { unregisterPushNotificationsAsync } from '../services/notificationService';
import { wsService } from '../services/websocket';
import { realtimeEngine } from '../realtime/realtimeEngine';

interface UserContextType {
  user: UserProfile | null;
  isAuthenticated: boolean;
  loading: boolean;
  error: string | null;
  login: (emailOrUsername: string, password: string) => Promise<void>;
  register: (email: string, password: string, username?: string) => Promise<void>;
  logout: (reason?: string) => Promise<void>;
  refreshUser: () => Promise<void>;
  updateUser: (data: Partial<UserProfile>) => Promise<void>;
  trackRookaPlus: () => Promise<void>;
  isChatMacroStripVisible: boolean;
  toggleChatMacroStrip: () => void;
}

/**
 * Normalises the server profile payload (which mixes camelCase and snake_case)
 * into a UserProfile.
 *
 * There is deliberately no "fallback user" here. Fabricating a profile when the
 * server could not be reached made the app show a signed-in shell with
 * strava_connected/garmin_connected forced to false and a hardcoded id, which
 * is what made working integrations look like they had vanished after a reboot.
 */
const normalizeProfile = (data: any, prev?: UserProfile | null): UserProfile => ({
  ...(data as UserProfile),
  total_rooka: data.total_rooka ?? data.totalRooka ?? prev?.total_rooka ?? 0,
  subscription_tier:
    data.subscriptionTier ?? data.subscription_tier ?? prev?.subscription_tier ?? 'free',
  daily_token_usage: data.dailyTokenUsage ?? data.daily_token_usage ?? prev?.daily_token_usage ?? 0,
  daily_token_limit:
    data.dailyTokenLimit ?? data.daily_token_limit ?? prev?.daily_token_limit ?? 50000,
  athlete_context: data.athleteContext ?? data.athlete_context ?? prev?.athlete_context,
  coach_tone: data.coachTone ?? data.coach_tone ?? prev?.coach_tone,
  coach_name: data.coachName ?? data.coach_name ?? 'Rooka',
  coach_context: data.coachContext ?? data.coach_context ?? '',
  coach_avatar_neutral: data.coachAvatarNeutral ?? data.coach_avatar_neutral,
  coach_avatar_hype: data.coachAvatarHype ?? data.coach_avatar_hype,
  coach_avatar_disappointed: data.coachAvatarDisappointed ?? data.coach_avatar_disappointed,
  profile_picture_url:
    data.profilePictureUrl ?? data.profile_picture_url ?? prev?.profile_picture_url,
  garmin_connected: data.hasGarmin ?? data.garmin_connected ?? false,
  strava_connected: data.hasStrava ?? data.strava_connected ?? false,
  onboarding_completed: Boolean(
    data.onboardingCompleted ?? data.onboarding_completed ?? prev?.onboarding_completed ?? true
  ),
});

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserStore: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isChatMacroStripVisible, setIsChatMacroStripVisible] = useState<boolean>(false);
  const loggingOutRef = useRef<boolean>(false);

  const toggleChatMacroStrip = () => {
    setIsChatMacroStripVisible((prev) => !prev);
  };

  const logout = async (reason?: string) => {
    // A 401 arriving while we are already tearing the session down must not
    // start a second logout.
    if (loggingOutRef.current) return;
    loggingOutRef.current = true;

    // Detach this device from the account so it stops receiving this phone's
    // daily notifications. Best-effort and time-boxed: signing out must never
    // wait on (or be blocked by) the network — the endpoint may not even exist
    // on an older server build, which simply 404s.
    try {
      await Promise.race([
        unregisterPushNotificationsAsync(),
        new Promise((resolve) => setTimeout(resolve, 2000)),
      ]);
    } catch (_) {}

    wsService.disconnect();
    setAuthToken(null);
    await tokenStorage.removeToken();
    if (chatStorage.clearChatHistory) await chatStorage.clearChatHistory();
    if (briefingStorage.clearBriefing) await briefingStorage.clearBriefing();
    setUser(null);
    setIsAuthenticated(false);
    setError(reason ?? null);
    loggingOutRef.current = false;
  };

  const login = async (emailOrUsername: string, password: string) => {
    setLoading(true);
    setError(null);
    const identifier = emailOrUsername.trim();
    try {
      // No implicit account creation here. Auto-registering on "Athlete not
      // found" quietly produced a second, empty account whenever the identifier
      // was typed differently, which reads as "my Strava connection and
      // workouts disappeared". Registration is an explicit action on the login
      // screen.
      const res = await authApi.login({ username: identifier, password });

      if (!res || !res.token) {
        throw new Error('Sign in failed: no session token returned.');
      }

      setAuthToken(res.token);

      // Load the profile *before* persisting the token, so a token that cannot
      // actually authenticate is never written to storage.
      const profileData = await userApi.getProfile();
      await tokenStorage.setToken(res.token);

      setUser(normalizeProfile(profileData));
      setIsAuthenticated(true);
    } catch (err: any) {
      // Never fabricate a session. A fake token guarantees a 401 on the next
      // request, which wipes the stored token and sends the user back to the
      // login screen on every launch.
      setAuthToken(null);
      setUser(null);
      setIsAuthenticated(false);
      const message = err?.message || 'Sign in failed. Please try again.';
      setError(message);
      throw err instanceof Error ? err : new Error(message);
    } finally {
      setLoading(false);
    }
  };

  const register = async (email: string, password: string, username?: string) => {
    setLoading(true);
    setError(null);
    const targetUsername = (username || email.split('@')[0]).trim();
    try {
      await authApi.register({ username: targetUsername, password });
    } catch (err: any) {
      // Only an existing username falls through to sign-in. A network failure
      // must surface as a failed registration rather than silently attempting a
      // login against an account that may never have been created.
      if (err.message && err.message.toLowerCase().includes('already exist')) {
        console.log('Register notice, account exists — proceeding to sign in...');
      } else {
        setError(err.message || 'Registration failed.');
        setLoading(false);
        throw err;
      }
    }

    try {
      await login(targetUsername, password);
    } catch (loginErr: any) {
      setError(loginErr.message || 'Auto-login failed.');
      throw loginErr;
    } finally {
      setLoading(false);
    }
  };

  const refreshUser = async () => {
    try {
      const data = await userApi.getProfile();
      if (data) {
        setUser((prev) => normalizeProfile(data, prev));
      }
      setError(null);
    } catch (err: any) {
      // A transient refresh failure must not clobber the profile we already
      // hold — that is what used to flip garmin_connected/strava_connected
      // back to false and make live connections look disconnected.
      console.log('UserStore refreshUser info:', err.message || err);
    }
  };

  const updateUser = async (data: Partial<UserProfile>) => {
    setUser((prev) => (prev ? { ...prev, ...data } : prev));
    try {
      await userApi.updateSettings(data);
    } catch (err: any) {
      console.warn('Failed to sync user settings:', err?.message || err);
    }
  };

  const trackRookaPlus = async () => {
    try {
      await userApi.trackRookaPlusClick();
    } catch (err) {
      console.log('Track Rooka+ error:', err);
    }
  };

  useEffect(() => {
    // Only a genuine rejection of the session ends it. Anything else (server
    // down, flaky network) must leave the stored token alone, otherwise a
    // single failed request signs the user out for good.
    setOnUnauthorizedHandler((reason) => {
      const message =
        reason === 'ACCOUNT_DELETED'
          ? 'This account has been deleted.'
          : 'Your session has expired. Please sign in again.';
      logout(message);
    });

    setOnRateLimitHandler((msg) => {
      console.warn('[Rate Limit Warning]', msg);
    });

    const initAuth = async () => {
      setLoading(true);
      try {
        const storedToken = await tokenStorage.getToken();
        if (!storedToken) {
          return;
        }

        setAuthToken(storedToken);

        try {
          // A cold start can race the network coming up. Retry transient
          // failures a couple of times before giving up, so a slow first
          // request does not drop the user back onto the login screen.
          let profile: UserProfile | null = null;
          let lastErr: any = null;
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              profile = await userApi.getProfile();
              lastErr = null;
              break;
            } catch (attemptErr: any) {
              lastErr = attemptErr;
              // An outright rejection by the server is final — do not retry it.
              if (attemptErr instanceof ApiError) break;
              await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
            }
          }
          if (lastErr) throw lastErr;

          setUser(normalizeProfile(profile));
          setIsAuthenticated(true);
        } catch (err: any) {
          if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
            // Session really is dead (expired, or the account was deleted).
            // The 401 interceptor has already run logout(); this is just the
            // explicit, readable path.
            await logout(
              err.data?.code === 'ACCOUNT_DELETED'
                ? 'This account has been deleted.'
                : 'Your session has expired. Please sign in again.'
            );
            return;
          }

          // Could not reach the server. Keep the token so the next launch can
          // restore the session, and stay signed out for now instead of
          // inventing a profile with every integration reported as missing.
          console.log('Auth initialization deferred (server unreachable):', err?.message || err);
          setAuthToken(null);
          setError('Could not reach Rooka. Check your connection and try again.');
        }
      } catch (err) {
        console.log('Auth initialization failed:', err);
      } finally {
        setLoading(false);
      }
    };

    initAuth();
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      realtimeEngine.cleanup();
      return;
    }

    tokenStorage.getToken().then((token) => {
      realtimeEngine.init(token || undefined);
    });

    const unsubRooka = realtimeEngine.subscribe('rooka_updated', (data: any) => {
      const added = typeof data.rooka === 'number' ? data.rooka : typeof data.points === 'number' ? data.points : 0;
      const total = typeof data.total_rooka === 'number' ? data.total_rooka : undefined;
      setUser((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          total_rooka: total !== undefined ? total : prev.total_rooka + added,
        };
      });
    });

    const unsubLevel = realtimeEngine.subscribe('level_up', (data: any) => {
      const newLevel = data.level || data.new_level;
      if (newLevel) {
        setUser((prev) => (prev ? { ...prev, level: newLevel } : null));
      }
    });

    return () => {
      unsubRooka();
      unsubLevel();
    };
  }, [isAuthenticated]);

  return (
    <UserContext.Provider
      value={{
        user,
        isAuthenticated,
        loading,
        error,
        login,
        register,
        logout,
        refreshUser,
        updateUser,
        trackRookaPlus,
        isChatMacroStripVisible,
        toggleChatMacroStrip,
      }}
    >
      {children}
    </UserContext.Provider>
  );
};

export const useUser = (): UserContextType => {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUser must be used within a UserStore');
  }
  return context;
};
