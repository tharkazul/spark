import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Niggle } from '../types/health';
import { healthApi } from '../services/apiServices';

interface HealthContextType {
  niggles: Niggle[];
  loading: boolean;
  error: string | null;
  refreshNiggles: () => Promise<void>;
  saveNiggle: (niggle: Partial<Niggle>) => Promise<void>;
  resolveNiggle: (id: number | string) => Promise<void>;
}

const defaultNiggles: Niggle[] = [
  {
    id: 1,
    body_part: 'left_ankle_foot',
    severity: 1,
    notes: 'Mild tightness in left plantar arch after long Sunday run.',
    status: 'active',
  },
];

const HealthContext = createContext<HealthContextType | undefined>(undefined);

export const HealthStore: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [niggles, setNiggles] = useState<Niggle[]>(defaultNiggles);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const refreshNiggles = async () => {
    setLoading(true);
    try {
      const data = await healthApi.getActiveNiggles();
      if (data && Array.isArray(data)) {
        setNiggles(data);
      }
      setError(null);
    } catch (err: any) {
      console.log('HealthStore fetch info:', err.message || err);
    } finally {
      setLoading(false);
    }
  };

  const saveNiggle = async (niggle: Partial<Niggle>) => {
    const existingIndex = niggles.findIndex(
      (n) => n.id === niggle.id || n.body_part === niggle.body_part
    );

    const updatedNiggle: Niggle = {
      id: niggle.id || Date.now(),
      body_part: niggle.body_part || 'left_calf',
      severity: niggle.severity || 1,
      notes: niggle.notes || '',
      status: 'active',
    };

    if (existingIndex >= 0) {
      setNiggles((prev) =>
        prev.map((n, idx) => (idx === existingIndex ? updatedNiggle : n))
      );
    } else {
      setNiggles((prev) => [...prev, updatedNiggle]);
    }

    try {
      await healthApi.saveNiggle(niggle);
    } catch (err) {
      console.error('Save niggle sync error:', err);
    }
  };

  const resolveNiggle = async (id: number | string) => {
    setNiggles((prev) => prev.filter((n) => n.id !== id));
    try {
      await healthApi.resolveNiggle(id);
    } catch (err) {
      console.error('Resolve niggle sync error:', err);
    }
  };

  useEffect(() => {
    refreshNiggles();
  }, []);

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
