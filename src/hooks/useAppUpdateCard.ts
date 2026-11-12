import { useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import * as Updates from 'expo-updates';
import {
  AppUpdateCardState,
  checkForUpdateInBackground,
  loadAppUpdateCard,
  resolveCardOnLaunch,
  saveAppUpdateCard,
  updatesSupported,
} from '../services/appUpdates';
import { ChatMessage } from '../types/chat';

/**
 * The coach's "new version ready" / "you're up to date" card, as a chat
 * message the coach screen renders like any other. Null when there's nothing
 * to show (including in development builds, where updates are off).
 */
export const useAppUpdateCard = (): ChatMessage | null => {
  const { isUpdatePending, downloadedUpdate } = Updates.useUpdates();
  // What was stored from an earlier session, resolved for this launch.
  const [storedCard, setStoredCard] = useState<AppUpdateCardState | null>(null);

  // On launch: turn a "ready" card into "done" once its update is running.
  useEffect(() => {
    if (!updatesSupported()) return;
    let cancelled = false;
    loadAppUpdateCard().then((stored) => {
      const resolved = resolveCardOnLaunch(stored);
      if (resolved !== stored) saveAppUpdateCard(resolved);
      if (!cancelled) setStoredCard(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // An update that finished downloading and isn't running yet.
  const pendingUpdateId =
    updatesSupported() &&
    isUpdatePending &&
    downloadedUpdate?.type === Updates.UpdateInfoType.NEW &&
    downloadedUpdate.updateId !== Updates.updateId
      ? downloadedUpdate.updateId
      : null;

  const card = useMemo<AppUpdateCardState | null>(() => {
    if (!pendingUpdateId) return storedCard;
    if (storedCard?.updateId === pendingUpdateId && storedCard.status === 'ready') return storedCard;
    return { updateId: pendingUpdateId, createdAt: new Date().toISOString(), status: 'ready' };
  }, [pendingUpdateId, storedCard]);

  // Remember a new "ready" card, so the next launch can turn it into "done".
  useEffect(() => {
    if (card?.status === 'ready' && card !== storedCard) saveAppUpdateCard(card);
  }, [card, storedCard]);

  // Check again when the athlete comes back to the app (throttled).
  useEffect(() => {
    if (!updatesSupported()) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkForUpdateInBackground();
    });
    return () => sub.remove();
  }, []);

  return useMemo(
    () =>
      card
        ? {
            id: `app-update-${card.updateId}`,
            role: 'coach',
            content: '',
            timestamp: card.createdAt,
            payload_json: { type: 'app_update', status: card.status, updateId: card.updateId },
          }
        : null,
    [card],
  );
};
