import type { Language } from '../locales/i18n';

/**
 * What's new in this over-the-air update. The coach shows it in the success
 * card after the athlete reloads into the update, so it ships with the new code.
 *
 * Edit before every `eas update`, or set to null to show only the generic
 * "you're up to date" message. Languages left out fall back to English.
 */
export const UPDATE_NOTES: Partial<Record<Language, string>> | null = null;
