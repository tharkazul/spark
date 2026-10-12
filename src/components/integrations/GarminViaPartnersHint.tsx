import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Platform, Text, View } from 'react-native';

import { useLanguage } from '../../context/LanguageContext';

/**
 * Shown in place of the Garmin login while GARMIN_DIRECT_LOGIN_ENABLED is off:
 * Garmin Connect can share workouts with Apple Health (iOS) and Strava, both of
 * which rooka already reads, so Garmin athletes still get their data in.
 * Renders only the inner row, so callers wrap it in their own card style.
 */
export const GarminViaPartnersHint: React.FC = () => {
  const { t } = useLanguage();

  return (
    <View className="flex-row items-start gap-3">
      <View className="w-10 h-10 rounded-xl bg-sky-500/10 items-center justify-center">
        <Ionicons name="watch-outline" size={20} color="#0EA5E9" />
      </View>
      <View className="flex-1">
        <Text className="text-sm font-bold text-theme-text font-jakarta">{t('connections.garminViaTitle')}</Text>
        <Text className="text-xs text-theme-muted mt-0.5 leading-relaxed">
          {Platform.OS === 'ios' ? t('connections.garminViaBodyIos') : t('connections.garminViaBodyAndroid')}
        </Text>
      </View>
    </View>
  );
};
