/**
 * Framework-free i18n core.
 *
 * Components use `useLanguage().t` (re-renders on language change). Code that runs outside
 * React components (services, utils, stores, Alert helpers) uses `translate()` /
 * `getCurrentLanguage()`, which always reflect the language selected in the app.
 */
import { en } from './en';
import { nl } from './nl';
import { de } from './de';
import { es } from './es';
import { fr } from './fr';

export type Language = 'en' | 'nl' | 'de' | 'es' | 'fr';
export const SUPPORTED_LANGUAGES: Language[] = ['en', 'nl', 'de', 'es', 'fr'];

export const dictionaries: Record<Language, any> = { en, nl, de, es, fr };

/** BCP-47 locale per app language, for Intl / toLocale*String. */
export const LOCALE_TAGS: Record<Language, string> = {
  en: 'en-GB',
  nl: 'nl-NL',
  de: 'de-DE',
  es: 'es-ES',
  fr: 'fr-FR',
};

let currentLanguage: Language = 'en';

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (SUPPORTED_LANGUAGES as string[]).includes(value);
}

export function setCurrentLanguage(lang: Language) {
  currentLanguage = lang;
}

export function getCurrentLanguage(): Language {
  return currentLanguage;
}

/** Locale tag for the current (or given) app language, e.g. 'nl-NL'. */
export function getLocaleTag(lang: Language = currentLanguage): string {
  return LOCALE_TAGS[lang] || LOCALE_TAGS.en;
}

type Params = Record<string, string | number>;

export function translateFor(
  lang: Language,
  path: string,
  fallbackOrParams?: string | Params,
  paramsObj?: Params
): string {
  const defaultFallback = typeof fallbackOrParams === 'string' ? fallbackOrParams : undefined;
  const params = typeof fallbackOrParams === 'object' ? fallbackOrParams : paramsObj;

  const lookup = (dict: any) =>
    path.split('.').reduce((acc: any, k) => (acc && typeof acc === 'object' ? acc[k] : undefined), dict);

  const val = lookup(dictionaries[lang] || dictionaries.en);
  const fallbackVal = lookup(dictionaries.en);
  let result = val !== undefined ? val : fallbackVal !== undefined ? fallbackVal : defaultFallback !== undefined ? defaultFallback : path;

  if (typeof result !== 'string') {
    return defaultFallback !== undefined ? defaultFallback : path;
  }

  if (params) {
    Object.keys(params).forEach((paramKey) => {
      result = result.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(params[paramKey]));
    });
  }
  return result;
}

/** Translate using the language currently selected in the app (for non-component code). */
export function translate(path: string, fallbackOrParams?: string | Params, paramsObj?: Params): string {
  return translateFor(currentLanguage, path, fallbackOrParams, paramsObj);
}
