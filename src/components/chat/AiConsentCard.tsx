import { BrandColors } from '@/constants/theme';
import { useLanguage } from '@/context/LanguageContext';
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Linking, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useUser } from '../../context/UserStore';
import { PRIVACY_POLICY_URL } from '../../utils/aiConsent';

/**
 * The coach's first message: asks the athlete whether rooka may send their
 * data to the AI service. Reads the live answer from the user profile, so it
 * reflects a later change made in Profile as well.
 */
export const AiConsentCard: React.FC = () => {
  const { t } = useLanguage();
  const { user, setAiConsent } = useUser();
  const [saving, setSaving] = useState<boolean | null>(null);
  const consent = user?.aiConsent;

  const answer = async (value: boolean) => {
    if (saving !== null) return;
    Haptics.impactAsync(value ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
    setSaving(value);
    try {
      await setAiConsent(value);
      if (value) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(t('aiConsent.updateFailed'));
    } finally {
      setSaving(null);
    }
  };

  if (consent === true) {
    return (
      <View className="mt-1 flex-row items-center">
        <View className="w-9 h-9 rounded-full items-center justify-center border bg-semantic-success/20 border-semantic-success/40">
          <Ionicons name="checkmark-circle" size={18} color="#10B981" />
        </View>
        {/* shrink, not flex-1: the chat bubble sizes to its content, so a
            flex-1 child here has no width to grow into and collapses. */}
        <View className="ml-2.5 shrink">
          <Text className="text-sm font-extrabold text-theme-text font-rajdhani">{t('aiConsent.acceptedTitle')}</Text>
          <Text className="text-xs text-theme-muted font-medium">{t('aiConsent.acceptedBody')}</Text>
        </View>
      </View>
    );
  }

  const declined = consent === false;

  return (
    <View className="mt-1">
      <View className="flex-row items-center mb-2">
        <View
          className={`w-9 h-9 rounded-full items-center justify-center border ${
            declined ? 'bg-theme-inset border-theme-border' : 'bg-theme-accent/20 border-theme-accent/40'
          }`}
        >
          <Ionicons name={declined ? 'pause-circle' : 'shield-checkmark'} size={18} color={declined ? '#9CA3AF' : BrandColors.primary} />
        </View>
        <Text className="ml-2.5 shrink text-sm font-extrabold text-theme-text font-rajdhani">
          {declined ? t('aiConsent.declinedTitle') : t('aiConsent.cardTitle')}
        </Text>
      </View>

      <Text className="text-sm text-theme-text leading-5 mb-2">{t('aiConsent.cardIntro')}</Text>
      <Text className="text-sm text-theme-text leading-5 mb-2">{t('aiConsent.cardData')}</Text>
      <Text className="text-sm text-theme-text leading-5 mb-2">{t('aiConsent.cardPromise')}</Text>
      <Text className="text-xs text-theme-muted leading-4 mb-2">
        {declined ? t('aiConsent.declinedBody') : t('aiConsent.cardDeclineNote')}
      </Text>

      <TouchableOpacity onPress={() => Linking.openURL(PRIVACY_POLICY_URL).catch(() => {})} activeOpacity={0.7} className="mb-3 self-start">
        <Text className="text-xs font-bold text-theme-accent">{t('aiConsent.privacyLink')}</Text>
      </TouchableOpacity>

      <View className="flex-row items-center gap-2">
        <TouchableOpacity
          onPress={() => answer(true)}
          activeOpacity={0.8}
          disabled={saving !== null}
          className="flex-1 bg-theme-accent-strong py-2.5 rounded-xl items-center justify-center flex-row"
        >
          {saving === true ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text className="text-xs font-extrabold text-white">{declined ? t('aiConsent.turnOn') : t('aiConsent.allow')}</Text>
          )}
        </TouchableOpacity>

        {!declined && (
          <TouchableOpacity
            onPress={() => answer(false)}
            activeOpacity={0.8}
            disabled={saving !== null}
            className="flex-1 bg-theme-card border border-theme-border py-2.5 rounded-xl items-center justify-center flex-row"
          >
            {saving === false ? (
              <ActivityIndicator size="small" color="#9CA3AF" />
            ) : (
              <Text className="text-xs font-bold text-theme-muted">{t('aiConsent.dontAllow')}</Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};
