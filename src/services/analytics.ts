import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';

import { API_BASE_URL } from '../constants/api';
import { getAuthToken } from './apiClient';
import { getAppVersionInfo } from '../utils/appVersion';

/**
 * Usage statistics: which screens athletes open and which buttons they press, never what
 * they type or any health or workout data. Sent to rooka's own server only. The server
 * keeps a fixed list of events and values (server/services/usageAnalytics.js) and drops
 * anything else, so an event added here also has to be added there.
 *
 * Events wait in memory (never on the phone's storage) and go out in one request every
 * 30 seconds and when the app goes to the background. Athletes can turn this off at the
 * bottom of Profile; the server also refuses events for them.
 * Plan and privacy reasoning: docs/usage-analytics-plan.md.
 */

export type UsageEventName =
  | 'app_opened'
  | 'session_ended'
  | 'tab_viewed'
  | 'subtab_viewed'
  | 'screen_viewed'
  | 'push_opened'
  | 'login_viewed'
  | 'signup_started'
  | 'signup_completed'
  | 'login_completed'
  | 'onboarding_step_viewed'
  | 'onboarding_completed'
  | 'ai_consent_shown'
  | 'ai_consent_answered'
  | 'notifications_answered'
  | 'integration_connect_started'
  | 'integration_connected'
  | 'integration_failed'
  | 'integration_disconnected'
  | 'workout_opened'
  | 'why_this_workout_opened'
  | 'adapt_opened'
  | 'adapt_submitted'
  | 'plan_shifted'
  | 'workout_added'
  | 'workout_sent_to_device'
  | 'activity_logged_manually'
  | 'partner_invited'
  | 'coach_message_sent'
  | 'proposal_answered'
  | 'out_of_messages_shown'
  | 'app_update_reloaded'
  | 'paywall_shown'
  | 'paywall_closed'
  | 'discount_code_tried'
  | 'friend_request_sent'
  | 'kudos_given'
  | 'setting_changed';

type Props = Record<string, string | number | boolean | null | undefined>;

const FLUSH_EVERY_MS = 30 * 1000;
const NEW_SESSION_AFTER_MS = 30 * 60 * 1000;
const MAX_QUEUE = 300;

const newSessionId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

let sessionId = newSessionId();
let sessionStartedAt = Date.now();
let backgroundedAt: number | null = null;
let queue: { name: UsageEventName; props: Props }[] = [];
/** null until the signed-in athlete's choice is known; anonymous events (before login) always go. */
let enabled: boolean | null = null;
let started = false;

/** Follows the athlete's switch. Called by UserStore whenever the profile changes. */
export const setUsageStatsEnabled = (value: boolean | null) => {
  enabled = value;
  if (value === false) queue = [];
};

export const track = (name: UsageEventName, props: Props = {}) => {
  if (enabled === false) return;
  queue.push({ name, props });
  if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);
};

const trackedOnce = new Set<string>();
/** Like track, but at most once per app session for the same key (cards that re-render or re-mount). */
export const trackOnce = (key: string, name: UsageEventName, props: Props = {}) => {
  if (trackedOnce.has(key)) return;
  trackedOnce.add(key);
  track(name, props);
};

const flush = async () => {
  if (!queue.length) return;
  const token = getAuthToken();
  // Signed in but the profile (and with it the athlete's choice) hasn't loaded yet: wait.
  if (token && enabled === null) return;
  if (enabled === false) {
    queue = [];
    return;
  }
  const events = queue;
  queue = [];
  if (__DEV__) {
    // Development builds talk to the production server; keep their clicks out of the charts.
    console.log('[usage]', events.map((e) => `${e.name} ${JSON.stringify(e.props)}`).join('\n'));
    return;
  }
  const info = getAppVersionInfo();
  try {
    await fetch(`${API_BASE_URL}/api/usage-events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        session_id: sessionId,
        platform: Platform.OS,
        app_version: info.build ? `${info.version} (${info.build})` : info.version,
        update_id: info.updateId,
        events,
      }),
    });
  } catch {
    // Offline: these events are lost, which is fine.
  }
};

const onAppStateChange = (state: AppStateStatus) => {
  if (state === 'background') {
    backgroundedAt = Date.now();
    track('session_ended', { seconds: Math.round((Date.now() - sessionStartedAt) / 1000) });
    flush();
  } else if (state === 'active' && backgroundedAt !== null) {
    if (Date.now() - backgroundedAt >= NEW_SESSION_AFTER_MS) {
      sessionId = newSessionId();
      sessionStartedAt = Date.now();
      trackedOnce.clear();
    }
    backgroundedAt = null;
    track('app_opened', { cold: false });
  }
};

/** Sends what's queued now, e.g. right before the app reloads itself. */
export const flushUsageStats = () => flush();

/** Once, from the root layout. */
export const startUsageStats = () => {
  if (started) return;
  started = true;
  track('app_opened', { cold: true });
  AppState.addEventListener('change', onAppStateChange);
  setInterval(flush, FLUSH_EVERY_MS);
};

/** rooka sport names to the families the server groups by. */
export const sportFamily = (sport?: string | null): string => {
  const s = String(sport || '').toLowerCase();
  if (/run|jog|treadmill/.test(s)) return 'run';
  if (/ride|bike|cycl|spin/.test(s)) return 'bike';
  if (/swim/.test(s)) return 'swim';
  if (/strength|gym|weight|crossfit|core|mobility|yoga|pilates/.test(s)) return 'strength';
  if (/walk/.test(s)) return 'walk';
  if (/hike/.test(s)) return 'hike';
  if (/rest/.test(s)) return 'rest';
  return 'other';
};

/** Records a sub-tab switch inside one of the main tabs; the sub-tab a screen opens on isn't counted. */
export const useTrackSubtab = (tab: string, subtab: string) => {
  const firstRef = useRef(true);
  useEffect(() => {
    if (firstRef.current) {
      firstRef.current = false;
      return;
    }
    track('subtab_viewed', { tab, subtab });
  }, [tab, subtab]);
};

/** Records that a screen outside the tabs was opened. */
export const useTrackScreen = (screen: 'activities' | 'activity_detail' | 'athlete_profile') => {
  useEffect(() => {
    track('screen_viewed', { screen });
  }, [screen]);
};
