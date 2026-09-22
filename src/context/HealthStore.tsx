import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { Niggle } from '../types/health';
import { healthApi } from '../services/apiServices';
import { useUser } from './UserStore';
import { niggleStorage } from '../services/storage';
import { offlineSync } from '../services/offlineSync';

interface HealthContextType {
  niggles: Niggle[];
  loading: boolean;
  error: string | null;
  refreshNiggles: () => Promise<void>;
  saveNiggle: (niggle: Partial<Niggle>) => Promise<void>;
  resolveNiggle: (id: number | string) => Promise<void>;
}

const defaultNiggles: Niggle[] = [];

const HealthContext = createContext<HealthContextType | undefined>(undefined);

export const HealthStore: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isAuthenticated, user } = useUser();
  const [niggles, setNiggles] = useState<Niggle[]>(defaultNiggles);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const hasFreshServerDataRef = useRef<boolean>(false);
  const userId = user?.id;

  const refreshNiggles = React.useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    try {
      const data = await healthApi.getActiveNiggles();
      if (data && Array.isArray(data)) {
        hasFreshServerDataRef.current = true;
        setNiggles(data);
        niggleStorage.setNiggles(data, userId).catch(() => {});
      }
      setError(null);
    } catch (err: any) {
      console.log('HealthStore fetch info:', err.message || err);
      // Do not wipe cached niggles on network error
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, userId]);

  const saveNiggle = React.useCallback(async (niggle: Partial<Niggle>) => {
    const updatedNiggle: Niggle = {
      id: niggle.id || `niggle_${Date.now()}`,
      body_part: niggle.body_part || 'left_calf',
      severity: niggle.severity || 1,
      notes: niggle.notes || '',
      status: 'active',
    };

    setNiggles((prev) => {
      const existingIndex = prev.findIndex(
        (n) => n.id === niggle.id || n.body_part === niggle.body_part
      );
      let next: Niggle[];
      if (existingIndex >= 0) {
        next = prev.map((n, idx) => (idx === existingIndex ? updatedNiggle : n));
      } else {
        next = [...prev, updatedNiggle];
      }
      niggleStorage.setNiggles(next, userId).catch(() => {});
      return next;
    });

    try {
      await healthApi.saveNiggle(niggle);
      await refreshNiggles();
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      const isNetworkErr =
        err?.status === 0 ||
        !offlineSync.getStatus().isOnline ||
        errMsg.includes('Network') ||
        errMsg.includes('Failed to fetch');

      if (isNetworkErr) {
        console.log('[HealthStore] Network error; queued saveNiggle for offline sync:', updatedNiggle.body_part);
        await offlineSync.enqueueMutation('SAVE_NIGGLE', niggle, updatedNiggle.id);
        return;
      }
      console.error('Save niggle sync error:', err);
    }
  }, [refreshNiggles, userId]);

  const resolveNiggle = React.useCallback(async (id: number | string) => {
    setNiggles((prev) => {
      const next = prev.filter((n) => String(n.id) !== String(id));
      niggleStorage.setNiggles(next, userId).catch(() => {});
      return next;
    });

    try {
      await healthApi.resolveNiggle(id);
      await refreshNiggles();
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      const isNetworkErr =
        err?.status === 0 ||
        !offlineSync.getStatus().isOnline ||
        errMsg.includes('Network') ||
        errMsg.includes('Failed to fetch');

      if (isNetworkErr) {
        console.log('[HealthStore] Network error; queued resolveNiggle for offline sync:', id);
        await offlineSync.enqueueMutation('RESOLVE_NIGGLE', { id }, id);
        return;
      }
      console.error('Resolve niggle sync error:', err);
    }
  }, [refreshNiggles, userId]);

  useEffect(() => {
    if (!isAuthenticated) {
      setNiggles(defaultNiggles);
      hasFreshServerDataRef.current = false;
      return;
    }

    let isMounted = true;
    const hydrateCache = async () => {
      try {
        const cached = await niggleStorage.getNiggles(userId);
        if (isMounted && cached && Array.isArray(cached) && !hasFreshServerDataRef.current) {
          setNiggles(cached);
        }
      } catch (e) {
        console.warn('Error hydrating niggles cache:', e);
      }
    };

    hydrateCache();
    refreshNiggles();

    const unsubOfflineSync = offlineSync.onSyncComplete(() => {
      refreshNiggles();
    });

    return () => {
      isMounted = false;
      unsubOfflineSync();
    };
  }, [isAuthenticated, userId, refreshNiggles]);

  return (
    <HealthContext.Provider
      value={{
        niggles,
        loading,
        error,
        refreshNiggles,
        saveNiggle,
        resolveNiggle,
      }}
    >
      {children}
    </HealthContext.Provider>
  );
};

export const useHealth = (): HealthContextType => {
  const context = useContext(HealthContext);
  if (!context) {
    throw new Error('useHealth must be used within a HealthStore');
  }
  return context;
};
