import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { API_BASE_URL } from '../constants/api';
import { activitiesApi, healthApi, planApi } from './apiServices';
import { setOnNetworkErrorHandler } from './apiClient';
import { useState, useEffect } from 'react';

export type MutationType =
  | 'LOG_ACTIVITY'
  | 'SAVE_NIGGLE'
  | 'RESOLVE_NIGGLE'
  | 'ADD_PLAN_WORKOUT'
  | 'UPDATE_PLAN_WORKOUT'
  | 'DELETE_PLAN_WORKOUT'
  | 'UPDATE_DAY_WORKOUTS'
  | 'PUSH_FORWARD';

export interface QueuedMutation<T = any> {
  id: string;
  type: MutationType;
  payload: T;
  tempId?: string | number;
  createdAt: number;
  retryCount: number;
  lastError?: string;
}

export interface OfflineSyncStatus {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  lastSyncTime: number | null;
}

type SyncEventListener = (status: OfflineSyncStatus) => void;
type SyncCompleteCallback = (count: number) => void;

const QUEUE_STORAGE_KEY = '@rooka_offline_mutation_queue';
const MAX_RETRIES = 3;

class OfflineSyncService {
  private queue: QueuedMutation[] = [];
  private isOnline: boolean = true;
  private isSyncing: boolean = false;
  private isFlushing: boolean = false;
  private lastSyncTime: number | null = null;
  private initialized: boolean = false;

  private listeners: Set<SyncEventListener> = new Set();
  private completeCallbacks: Set<SyncCompleteCallback> = new Set();
  private heartbeatTimer: any = null;

  constructor() {
    this.init();
  }

  private async init() {
    if (this.initialized) return;
    this.initialized = true;

    // 1. Load queue from AsyncStorage
    await this.loadQueue();

    // 2. Register apiClient network error interceptor
    setOnNetworkErrorHandler(() => {
      this.handleNetworkFailure();
    });

    // 3. Register AppState listener (check connectivity & flush on foreground resume)
    AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        this.checkOnlineStatus().then((online) => {
          if (online && this.queue.length > 0) {
            this.flushQueue();
          }
        });
      }
    });

    // 4. Web window online / offline listeners
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.setOnlineState(true);
        this.flushQueue();
      });
      window.addEventListener('offline', () => {
        this.setOnlineState(false);
      });
      if (typeof navigator !== 'undefined' && navigator.onLine !== undefined) {
        this.isOnline = navigator.onLine;
      }
    }

    // 5. Initial connection check
    this.checkOnlineStatus().then((online) => {
      if (online && this.queue.length > 0) {
        this.flushQueue();
      }
    });

    // 6. Periodic heartbeat when mutations are pending
    this.startHeartbeat();
  }

  private async loadQueue(): Promise<void> {
    try {
      const raw = await AsyncStorage.getItem(QUEUE_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.queue = parsed;
          this.notifyListeners();
        }
      }
    } catch (e) {
      console.warn('[OfflineSync] Failed to load queue from storage:', e);
    }
  }

  private async persistQueue(): Promise<void> {
    try {
      await AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(this.queue));
    } catch (e) {
      console.warn('[OfflineSync] Failed to persist queue to storage:', e);
    }
    this.notifyListeners();
  }

  private notifyListeners() {
    const status: OfflineSyncStatus = {
      isOnline: this.isOnline,
      isSyncing: this.isSyncing,
      pendingCount: this.queue.length,
      lastSyncTime: this.lastSyncTime,
    };
    this.listeners.forEach((listener) => {
      try {
        listener(status);
      } catch (err) {
        console.error('[OfflineSync] Listener error:', err);
      }
    });
  }

  private startHeartbeat() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    // Periodically check status if queue has pending items
    this.heartbeatTimer = setInterval(() => {
      if (this.queue.length > 0 && !this.isFlushing) {
        this.checkOnlineStatus().then((online) => {
          if (online) {
            this.flushQueue();
          }
        });
      }
    }, 25000);
  }

  /**
   * Directly called by apiClient when a fetch throws a network-level error.
   */
  public handleNetworkFailure() {
    if (this.isOnline) {
      console.log('[OfflineSync] Network failure intercepted; transitioning to offline state.');
      this.setOnlineState(false);
    }
  }

  /**
   * Updates online state and notifies listeners if changed.
   */
  public setOnlineState(online: boolean) {
    if (this.isOnline !== online) {
      this.isOnline = online;
      console.log(`[OfflineSync] Connection state changed: ${online ? 'ONLINE' : 'OFFLINE'}`);
      this.notifyListeners();
      if (online && this.queue.length > 0) {
        this.flushQueue();
      }
    }
  }

  /**
   * Actively checks if backend is reachable by pinging /status endpoint.
   */
  public async checkOnlineStatus(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);

      const res = await fetch(`${API_BASE_URL}/status`, {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const reachable = res.status >= 200 && res.status < 500;
      this.setOnlineState(reachable);
      return reachable;
    } catch (_) {
      this.setOnlineState(false);
      return false;
    }
  }

  /**
   * Enqueue a mutation for offline sync.
   * Performs deduplication and coalescing where applicable.
   */
  public async enqueueMutation<T>(
    type: MutationType,
    payload: T,
    tempId?: string | number
  ): Promise<QueuedMutation<T>> {
    // 1. Conflict resolution / coalescing
    if (type === 'DELETE_PLAN_WORKOUT') {
      // If there is an unsynced ADD_PLAN_WORKOUT with the same tempId, remove both
      const pendingAddIdx = this.queue.findIndex(
        (m) => m.type === 'ADD_PLAN_WORKOUT' && m.tempId && String(m.tempId) === String(tempId || (payload as any)?.id)
      );
      if (pendingAddIdx >= 0) {
        this.queue.splice(pendingAddIdx, 1);
        await this.persistQueue();
        return {
          id: `cancelled_${Date.now()}`,
          type,
          payload,
          tempId,
          createdAt: Date.now(),
          retryCount: 0,
        };
      }
    }

    if (type === 'UPDATE_PLAN_WORKOUT') {
      const targetId = String((payload as any)?.id || tempId);
      // Coalesce with existing pending update for same workout
      const existingUpdate = this.queue.find(
        (m) => m.type === 'UPDATE_PLAN_WORKOUT' && String((m.payload as any)?.id || m.tempId) === targetId
      );
      if (existingUpdate) {
        existingUpdate.payload = {
          ...existingUpdate.payload,
          workout: {
            ...(existingUpdate.payload as any)?.workout,
            ...(payload as any)?.workout,
          },
        };
        existingUpdate.createdAt = Date.now();
        await this.persistQueue();
        return existingUpdate;
      }
    }

    if (type === 'RESOLVE_NIGGLE') {
      const targetId = String((payload as any)?.id || tempId);
      const pendingSaveIdx = this.queue.findIndex(
        (m) => m.type === 'SAVE_NIGGLE' && String(m.tempId || (m.payload as any)?.id) === targetId
      );
      if (pendingSaveIdx >= 0) {
        // If it was created offline and resolved offline before syncing, cancel both
        this.queue.splice(pendingSaveIdx, 1);
        await this.persistQueue();
        return {
          id: `cancelled_${Date.now()}`,
          type,
          payload,
          tempId,
          createdAt: Date.now(),
          retryCount: 0,
        };
      }
    }

    // 2. Create new mutation entry
    const mutation: QueuedMutation<T> = {
      id: `mut_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      type,
      payload,
      tempId,
      createdAt: Date.now(),
      retryCount: 0,
    };

    this.queue.push(mutation);
    await this.persistQueue();

    // If we believe we are online, trigger an immediate flush attempt
    if (this.isOnline && !this.isFlushing) {
      this.flushQueue();
    }

    return mutation;
  }

  /**
   * Sequentially flushes all queued mutations in FIFO order.
   */
  public async flushQueue(): Promise<{ synced: number; remaining: number }> {
    if (this.isFlushing) {
      return { synced: 0, remaining: this.queue.length };
    }

    if (this.queue.length === 0) {
      return { synced: 0, remaining: 0 };
    }

    this.isFlushing = true;
    this.isSyncing = true;
    this.notifyListeners();

    let syncedCount = 0;

    try {
      while (this.queue.length > 0) {
        const item = this.queue[0];
        let succeeded = false;
        let isNetworkError = false;

        try {
          await this.executeMutation(item);
          succeeded = true;
        } catch (err: any) {
          const errMsg = err?.message || String(err);
          console.warn(`[OfflineSync] Error executing mutation ${item.type}:`, errMsg);

          // Check if failure was due to network disconnection
          if (
            errMsg.includes('Network request failed') ||
            errMsg.includes('Failed to fetch') ||
            errMsg.includes('Network Error') ||
            errMsg.includes('Aborted') ||
            err?.status === 0 ||
            !err?.status
          ) {
            isNetworkError = true;
          }

          item.retryCount++;
          item.lastError = errMsg;
        }

        if (succeeded) {
          syncedCount++;
          // Remove processed item from queue
          this.queue.shift();
          await this.persistQueue();
        } else if (isNetworkError) {
          // Connection lost; pause flush and retain queue in current state
          this.setOnlineState(false);
          await this.persistQueue();
          break;
        } else {
          // Client or server error (e.g. 400 Bad Request, 404, 500)
          if (item.retryCount >= MAX_RETRIES) {
            console.error(
              `[OfflineSync] Dropping permanently failed mutation ${item.type} after ${MAX_RETRIES} attempts:`,
              item.lastError
            );
            this.queue.shift();
            await this.persistQueue();
          } else {
            // Move item to back of queue to avoid blocking other mutations
            this.queue.shift();
            this.queue.push(item);
            await this.persistQueue();
          }
        }
      }

      if (syncedCount > 0) {
        this.lastSyncTime = Date.now();
        this.setOnlineState(true);
        this.completeCallbacks.forEach((cb) => {
          try {
            cb(syncedCount);
          } catch (e) {}
        });
      }
    } finally {
      this.isFlushing = false;
      this.isSyncing = false;
      this.notifyListeners();
    }

    return { synced: syncedCount, remaining: this.queue.length };
  }

  /**
   * Dispatches a single mutation to the corresponding apiServices endpoint.
   */
  private async executeMutation(mutation: QueuedMutation): Promise<any> {
    switch (mutation.type) {
      case 'LOG_ACTIVITY':
        return await activitiesApi.logActivity(mutation.payload);

      case 'SAVE_NIGGLE':
        return await healthApi.saveNiggle(mutation.payload);

      case 'RESOLVE_NIGGLE': {
        const id = mutation.payload?.id || mutation.payload;
        return await healthApi.resolveNiggle(id);
      }

      case 'ADD_PLAN_WORKOUT':
        return await planApi.addWorkout(mutation.payload);

      case 'UPDATE_PLAN_WORKOUT': {
        const { id, workout } = mutation.payload;
        return await planApi.updateWorkout(id, workout);
      }

      case 'DELETE_PLAN_WORKOUT': {
        const id = mutation.payload?.id || mutation.payload;
        return await planApi.deleteWorkout(id);
      }

      case 'UPDATE_DAY_WORKOUTS': {
        const { date, workouts } = mutation.payload;
        return await planApi.updateDayWorkouts(date, workouts);
      }

      case 'PUSH_FORWARD': {
        const date = mutation.payload?.date || mutation.payload;
        return await planApi.pushForward(date);
      }

      default:
        console.warn(`[OfflineSync] Unknown mutation type: ${mutation.type}`);
        return Promise.resolve();
    }
  }

  public getStatus(): OfflineSyncStatus {
    return {
      isOnline: this.isOnline,
      isSyncing: this.isSyncing,
      pendingCount: this.queue.length,
      lastSyncTime: this.lastSyncTime,
    };
  }

  public getQueue(): QueuedMutation[] {
    return [...this.queue];
  }

  public async clearQueue(): Promise<void> {
    this.queue = [];
    await this.persistQueue();
  }

  public subscribe(listener: SyncEventListener): () => void {
    this.listeners.add(listener);
    listener(this.getStatus());
    return () => {
      this.listeners.delete(listener);
    };
  }

  public onSyncComplete(callback: SyncCompleteCallback): () => void {
    this.completeCallbacks.add(callback);
    return () => {
      this.completeCallbacks.delete(callback);
    };
  }
}

export const offlineSync = new OfflineSyncService();

/**
 * React hook to observe offline sync status in components.
 */
export function useOfflineSync() {
  const [status, setStatus] = useState<OfflineSyncStatus>(offlineSync.getStatus());

  useEffect(() => {
    return offlineSync.subscribe((newStatus) => {
      setStatus(newStatus);
    });
  }, []);

  return {
    ...status,
    flushQueue: () => offlineSync.flushQueue(),
    checkOnlineStatus: () => offlineSync.checkOnlineStatus(),
  };
}
