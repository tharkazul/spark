import { Alert, Linking } from 'react-native';

type Translate = (path: string, fallbackOrParams?: string | Record<string, string | number>, paramsObj?: Record<string, string | number>) => string;
type SetAiConsent = (consent: boolean) => Promise<void>;

export const PRIVACY_POLICY_URL = 'https://rooka.io/privacy';

/** The full disclosure shown wherever an athlete can turn AI processing on. */
export const aiDisclosureText = (t: Translate): string =>
  [t('aiConsent.cardIntro'), t('aiConsent.cardData'), t('aiConsent.cardPromise')].join('\n\n');

const save = async (setAiConsent: SetAiConsent, consent: boolean, t: Translate) => {
  try {
    await setAiConsent(consent);
  } catch {
    Alert.alert(t('aiConsent.updateFailed'));
  }
};

/** Asks for explicit consent (with the full disclosure) before turning AI processing on. */
export const confirmEnableAi = (t: Translate, setAiConsent: SetAiConsent) => {
  Alert.alert(t('aiConsent.enableTitle'), aiDisclosureText(t), [
    { text: t('aiConsent.privacyLink'), onPress: () => Linking.openURL(PRIVACY_POLICY_URL).catch(() => {}) },
    { text: t('aiConsent.dontAllow'), style: 'cancel' },
    { text: t('aiConsent.allow'), onPress: () => save(setAiConsent, true, t) },
  ]);
};

export const confirmDisableAi = (t: Translate, setAiConsent: SetAiConsent) => {
  Alert.alert(t('aiConsent.disableTitle'), t('aiConsent.disableBody'), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('aiConsent.turnOff'), style: 'destructive', onPress: () => save(setAiConsent, false, t) },
  ]);
};
