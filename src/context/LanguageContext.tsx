import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import {
  Language,
  dictionaries,
  isLanguage,
  setCurrentLanguage,
  translateFor,
} from '../locales/i18n';
import { languageStorage } from '../services/storage';
import { userApi } from '../services/apiServices';
import { getAuthToken } from '../services/apiClient';

export type { Language } from '../locales/i18n';
export { dictionaries } from '../locales/i18n';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => Promise<void>;
  t: (key: string, fallbackOrParams?: string | Record<string, string | number>, params?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>('en');

  useEffect(() => {
    (async () => {
      const savedLang = await languageStorage.getLanguage();
      if (isLanguage(savedLang)) {
        setCurrentLanguage(savedLang);
        setLanguageState(savedLang);
      }
    })();
  }, []);

  const setLanguage = React.useCallback(async (lang: Language) => {
    setCurrentLanguage(lang);
    setLanguageState(lang);
    await languageStorage.setLanguage(lang);
    if (getAuthToken()) {
      try {
        await userApi.updateSettings({ language: lang } as any);
      } catch (e) {
        // Ignore network errors or unauthenticated state
      }
    }
  }, []);

  const t = React.useCallback(
    (path: string, fallbackOrParams?: string | Record<string, string | number>, paramsObj?: Record<string, string | number>): string =>
      translateFor(language, path, fallbackOrParams, paramsObj),
    [language]
  );

  const contextValue = React.useMemo(
    () => ({ language, setLanguage, t }),
    [language, setLanguage, t]
  );

  return (
    <LanguageContext.Provider value={contextValue}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
