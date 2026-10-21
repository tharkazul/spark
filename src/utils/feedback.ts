import Constants from 'expo-constants';
import { Alert, Platform } from 'react-native';
import { translate } from '../locales/i18n';
import { feedbackApi } from '../services/apiServices';

// "Feedback" in every language rooka speaks. Many athletes use the English word
// whatever their app language, so all of them are checked for everyone.
const FEEDBACK_WORDS = [
  'feedback',
  'terugkoppeling',
  'rückmeldung',
  'rueckmeldung',
  'rétroaction',
  'retroaction',
  'retroalimentación',
  'retroalimentacion',
];

/** True when a chat message mentions feedback and may be meant for the rooka team. */
export const looksLikeFeedback = (text: string): boolean => {
  const lower = text.toLowerCase();
  return FEEDBACK_WORDS.some((word) => lower.includes(word));
};

/**
 * Asks whether the message is feedback for the rooka team. Resolves true for
 * yes; no means the athlete was asking the coach, so the message goes there.
 */
export const confirmFeedback = (): Promise<boolean> =>
  new Promise((resolve) => {
    Alert.alert(
      translate('feedback.confirmTitle'),
      translate('feedback.confirmBody'),
      [
        { text: translate('feedback.no'), style: 'cancel', onPress: () => resolve(false) },
        { text: translate('feedback.yes'), onPress: () => resolve(true) },
      ],
      { cancelable: false }
    );
  });

/** Sends the message to the rooka team, never to the AI coach. Resolves true when it was sent. */
export const submitFeedback = async (message: string, imagesBase64?: string[]): Promise<boolean> => {
  try {
    await feedbackApi.send({
      message,
      imagesBase64,
      platform: Platform.OS,
      osVersion: String(Platform.Version),
      appVersion: Constants.expoConfig?.version,
    });
    Alert.alert(translate('feedback.sentTitle'), translate('feedback.sentBody'));
    return true;
  } catch {
    Alert.alert(translate('feedback.failedTitle'), translate('feedback.failedBody'));
    return false;
  }
};
