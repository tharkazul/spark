import { Alert, Linking } from 'react-native';
import { track } from '../services/analytics';

type Translate = (path: string, fallbackOrParams?: string | Record<string, string | number>, paramsObj?: Record<string, string | number>) => string;
type SetAiConsent = (consent: boolean) => Promise<void>;

export const PRIVACY_POLICY_URL = 'https://rooka.io/privacy';

/** The full disclosure shown wherever an athlete can turn AI processing on. */
export const aiDisclosureText = (t: Translate): string =>
  [t('aiConsent.cardIntro'), t('aiConsent.cardData'), t('aiConsent.cardPromise')].join('\n\n');

type ConsentPlace = 'coach' | 'shortcut' | 'settings';

const save = async (setAiConsent: SetAiConsent, consent: boolean, t: Translate, where: ConsentPlace) => {
  track('ai_consent_answered', { answer: consent ? 'allow' : 'off', where });
  try {
    await setAiConsent(consent);
  } catch {
    Alert.alert(t('aiConsent.updateFailed'));
  }
};

/** Asks for explicit consent (with the full disclosure) before turning AI processing on. */
export const confirmEnableAi = (t: Translate, setAiConsent: SetAiConsent, where: ConsentPlace = 'shortcut') => {
  track('ai_consent_shown', { where });
  Alert.alert(t('aiConsent.enableTitle'), aiDisclosureText(t), [
    { text: t('aiConsent.privacyLink'), onPress: () => Linking.openURL(PRIVACY_POLICY_URL).catch(() => {}) },
    { text: t('aiConsent.dontAllow'), style: 'cancel', onPress: () => track('ai_consent_answered', { answer: 'not_now', where }) },
    { text: t('aiConsent.allow'), onPress: () => save(setAiConsent, true, t, where) },
  ]);
};

export const confirmDisableAi = (t: Translate, setAiConsent: SetAiConsent) => {
  Alert.alert(t('aiConsent.disableTitle'), t('aiConsent.disableBody'), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('aiConsent.turnOff'), style: 'destructive', onPress: () => save(setAiConsent, false, t, 'settings') },
  ]);
};
