import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { en, TranslationKeys } from '../locales/en';
import { nl } from '../locales/nl';
import { de } from '../locales/de';
import { es } from '../locales/es';
import { fr } from '../locales/fr';
import { languageStorage } from '../services/storage';
import { userApi } from '../services/apiServices';
import { getAuthToken } from '../services/apiClient';

export type Language = 'en' | 'nl' | 'de' | 'es' | 'fr';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => Promise<void>;
  t: (key: string, params?: Record<string, string | number>) => string;
}

export const dictionaries: Record<Language, any> = { en, nl, de, es, fr };

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>('en');

  useEffect(() => {
    (async () => {
      const savedLang = await languageStorage.getLanguage();
      if (savedLang && (['en', 'nl', 'de', 'es', 'fr'] as Language[]).includes(savedLang as Language)) {
        setLanguageState(savedLang as Language);
      }
    })();
  }, []);

  const setLanguage = React.useCallback(async (lang: Language) => {
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
    (path: string, params?: Record<string, string | number>): string => {
      const dict = dictionaries[language] || dictionaries.en;
      const fallbackDict = dictionaries.en;

      const keys = path.split('.');
      let val: any = dict;
      let fallbackVal: any = fallbackDict;

      for (const k of keys) {
        if (val && typeof val === 'object') {
          val = val[k];
        } else {
          val = undefined;
        }

        if (fallbackVal && typeof fallbackVal === 'object') {
          fallbackVal = fallbackVal[k];
        } else {
          fallbackVal = undefined;
        }
      }

      let result = val !== undefined ? val : fallbackVal !== undefined ? fallbackVal : path;

      if (typeof result !== 'string') {
        return path;
      }

      if (params) {
        Object.keys(params).forEach((paramKey) => {
          const regex = new RegExp(`\\{${paramKey}\\}`, 'g');
          result = result.replace(regex, String(params[paramKey]));
        });
      }

      return result;
    },
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
