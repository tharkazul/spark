import AsyncStorage from '@react-native-async-storage/async-storage';
import { requireOptionalNativeModule } from 'expo';
// React Navigation's own hook, as on Home: expo-router's version subscribes to the navigation state.
import { useFocusEffect } from 'expo-router/react-navigation';
import { useCallback, useMemo } from 'react';
import { AppState } from 'react-native';
import type { PlannedWorkout } from '../types/plan';

/**
 * Asks for an App Store / Google Play rating after a good moment: the athlete has
 * completed their 3rd planned session and is back on Home with nothing else open.
 * A second ask comes after the 25th session, at least 120 days later. Apple and
 * Google also cap how often the sheet really appears, so a call may show nothing.
 */
const MILESTONES = [3, 25];
const MIN_DAYS_BETWEEN_ASKS = 120;
// Let Home settle (data, animations) before the sheet slides up.
const DELAY_MS = 2500;
// Per device, not per account: the rating belongs to the phone's Apple / Google account.
const STORAGE_KEY = 'rooka_review_prompt_v1';

type StoreReviewModule = typeof import('expo-store-review');
type PromptState = { asks: number; lastAskedAt: number | null };

let storeReview: StoreReviewModule | null | undefined;

/**
 * Binaries up to 1.1.1 were built without the ExpoStoreReview native module, and
 * importing expo-store-review there throws. Load it lazily so an OTA update with
 * this code stays safe on those builds; the prompt starts working from the next
 * store build.
 */
function loadStoreReview(): StoreReviewModule | null {
  if (storeReview !== undefined) return storeReview;
  if (!requireOptionalNativeModule('ExpoStoreReview')) {
    storeReview = null;
    return storeReview;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    storeReview = require('expo-store-review') as StoreReviewModule;
  } catch {
    storeReview = null;
  }
  return storeReview;
}

async function readState(): Promise<PromptState> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { asks: Number(parsed.asks) || 0, lastAskedAt: Number(parsed.lastAskedAt) || null };
    }
  } catch {}
  return { asks: 0, lastAskedAt: null };
}

const isRestSession = (w: PlannedWorkout) => String(w.sport || w.type || '').toUpperCase() === 'REST';

export function countCompletedSessions(plan: PlannedWorkout[]): number {
  return plan.filter((w) => Boolean(w.isCompleted) && !isRestSession(w)).length;
}

/** `enabled` is false while Home shows a modal, so the sheet never lands on top of one. */
export function useReviewPrompt(plan: PlannedWorkout[], enabled: boolean) {
  const completed = useMemo(() => countCompletedSessions(plan), [plan]);

  useFocusEffect(
    useCallback(() => {
      if (!enabled || completed < MILESTONES[0]) return;
      let cancelled = false;

      const timer = setTimeout(async () => {
        try {
          if (cancelled || AppState.currentState !== 'active') return;
          const StoreReview = loadStoreReview();
          if (!StoreReview) return;

          const state = await readState();
          const milestone = MILESTONES[state.asks];
          if (milestone === undefined || completed < milestone) return;
          if (state.lastAskedAt && Date.now() - state.lastAskedAt < MIN_DAYS_BETWEEN_ASKS * 86400000) return;
          // False in TestFlight builds and on old Android versions.
          if (!(await StoreReview.isAvailableAsync()) || cancelled) return;

          // Saved before asking, so a crash or a killed app never leads to a second ask.
          await AsyncStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({ asks: state.asks + 1, lastAskedAt: Date.now() }),
          );
          await StoreReview.requestReview();
        } catch (err: any) {
          console.log('Review prompt skipped:', err?.message || err);
        }
      }, DELAY_MS);

      return () => {
        cancelled = true;
        clearTimeout(timer);
      };
    }, [enabled, completed]),
  );
}
