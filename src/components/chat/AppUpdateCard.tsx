import { BrandColors } from '@/constants/theme';
import { useLanguage } from '@/context/LanguageContext';
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { AppUpdatePayload } from '../../types/chat';
import { reloadIntoUpdate } from '../../services/appUpdates';
import { UPDATE_NOTES } from '../../constants/releaseNotes';
import { formatAppVersion } from '../../utils/appVersion';

/**
 * The coach's message about an over-the-air update: a Reload button while the
 * update waits, and a checkmark with what's new once it's running. The "done"
 * text comes from the new code itself (UPDATE_NOTES), so it describes that update.
 */
export const AppUpdateCard: React.FC<{ payload: AppUpdatePayload }> = ({ payload }) => {
  const { t, language } = useLanguage();
  const [reloading, setReloading] = useState(false);

  if (payload.status === 'done') {
    const notes = UPDATE_NOTES ? UPDATE_NOTES[language] ?? UPDATE_NOTES.en : null;
    return (
      <View className="mt-1">
        <View className="flex-row items-center mb-2">
          <View className="w-9 h-9 rounded-full items-center justify-center border bg-semantic-success/20 border-semantic-success/40">
            <Ionicons name="checkmark-circle" size={18} color="#10B981" />
          </View>
          <View className="ml-2.5 shrink">
            <Text className="text-sm font-extrabold text-theme-text font-rajdhani">{t('appUpdate.doneTitle')}</Text>
            <Text className="text-xs text-theme-muted font-medium">rooka {formatAppVersion()}</Text>
          </View>
        </View>
        <Text className="text-sm text-theme-text leading-5">{notes || t('appUpdate.doneBody')}</Text>
      </View>
    );
  }

  const reload = async () => {
    if (reloading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setReloading(true);
    try {
      await reloadIntoUpdate();
    } catch {
      setReloading(false);
      Alert.alert(t('appUpdate.failed'));
    }
  };

  return (
    <View className="mt-1">
      <View className="flex-row items-center mb-2">
        <View className="w-9 h-9 rounded-full items-center justify-center border bg-theme-accent/20 border-theme-accent/40">
          <Ionicons name="sparkles" size={18} color={BrandColors.primary} />
        </View>
        <Text className="ml-2.5 shrink text-sm font-extrabold text-theme-text font-rajdhani">{t('appUpdate.readyTitle')}</Text>
      </View>
      <Text className="text-sm text-theme-text leading-5 mb-3">{t('appUpdate.readyBody')}</Text>
      <TouchableOpacity
        onPress={reload}
        disabled={reloading}
        activeOpacity={0.8}
        className="bg-theme-accent-strong py-2.5 px-5 rounded-xl items-center justify-center flex-row self-start"
      >
        {reloading ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <>
            <Ionicons name="refresh" size={15} color="#FFFFFF" />
            <Text className="text-xs font-extrabold text-white ml-1.5">{t('appUpdate.reload')}</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
};
