import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance } from 'react-native';
import * as Updates from 'expo-updates';

// Over-the-air updates (EAS Update) download in the background. Instead of
// waiting for the athlete to restart the app, the coach posts a card with a
// Reload button; after the reload the same card turns into a success message.
// The card lives on this device only (never on the server).

const STORAGE_KEY = 'rooka.appUpdateCard';
const DONE_CARD_TTL_MS = 3 * 24 * 60 * 60 * 1000;
const FOREGROUND_CHECK_INTERVAL_MS = 30 * 60 * 1000;

export interface AppUpdateCardState {
  /** The downloaded update the card offers. */
  updateId: string;
  createdAt: string;
  status: 'ready' | 'done';
}

export const updatesSupported = (): boolean => Updates.isEnabled && !__DEV__;

export const loadAppUpdateCard = async (): Promise<AppUpdateCardState | null> => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AppUpdateCardState) : null;
  } catch {
    return null;
  }
};

export const saveAppUpdateCard = (card: AppUpdateCardState | null): Promise<void> =>
  (card ? AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(card)) : AsyncStorage.removeItem(STORAGE_KEY)).catch(() => {});

/**
 * Works out what the stored card should show on this launch:
 * the update it offered is now running → success; an old success card → gone.
 */
export const resolveCardOnLaunch = (card: AppUpdateCardState | null): AppUpdateCardState | null => {
  if (!card) return null;
  if (card.status === 'ready' && Updates.updateId === card.updateId) {
    // A fresh timestamp moves the card to the bottom of the chat and makes it
    // unread, so the Coach badge leads the athlete back to the success message.
    return { ...card, status: 'done', createdAt: new Date().toISOString() };
  }
  if (card.status === 'done' && Date.now() - new Date(card.createdAt).getTime() > DONE_CARD_TTL_MS) {
    return null;
  }
  return card;
};

let lastForegroundCheck = 0;

/**
 * Checks for and downloads a new update. The app already does this on launch;
 * this covers athletes who keep rooka open in the background for days.
 */
export const checkForUpdateInBackground = async (force = false): Promise<void> => {
  if (!updatesSupported()) return;
  if (!force && Date.now() - lastForegroundCheck < FOREGROUND_CHECK_INTERVAL_MS) return;
  lastForegroundCheck = Date.now();
  try {
    const result = await Updates.checkForUpdateAsync();
    if (result.isAvailable) await Updates.fetchUpdateAsync();
  } catch {
    // Offline or rate limited: try again on a later foreground.
  }
};

/** Restarts into the downloaded update behind a rooka splash instead of a blank screen. */
export const reloadIntoUpdate = (): Promise<void> => {
  const dark = Appearance.getColorScheme() === 'dark';
  return Updates.reloadAsync({
    reloadScreenOptions: {
      backgroundColor: dark ? '#0F172A' : '#F8FAFC',
      image: dark
        ? require('../../assets/images/splash-icon-update.png')
        : require('../../assets/images/splash-icon-black.png'),
      imageResizeMode: 'contain',
      fade: true,
      spinner: { enabled: true, color: '#0284C7', size: 'small' },
    },
  });
};
