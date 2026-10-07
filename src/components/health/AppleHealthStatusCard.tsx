import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Alert, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Card } from '../ui/Card';
import { useLanguage } from '../../context/LanguageContext';
import {
  isHealthKitAvailable,
  requestFullHealthKitPermissions,
  syncAppleHealthData,
  AppleHealthDailyBiometrics,
} from '../../services/appleHealthService';

interface AppleHealthStatusCardProps {
  biometrics: AppleHealthDailyBiometrics | null;
  onSyncCompleted: (freshBiometrics: AppleHealthDailyBiometrics | null) => void;
}

export const AppleHealthStatusCard: React.FC<AppleHealthStatusCardProps> = ({
  biometrics,
  onSyncCompleted,
}) => {
  const [syncing, setSyncing] = useState(false);
  const { t } = useLanguage();
  const isIos = Platform.OS === 'ios';
  const isAvailable = isIos && isHealthKitAvailable();
  const hasData = Boolean(
    biometrics &&
      (biometrics.resting_hr ||
        biometrics.hrv_sdnn ||
        biometrics.sleep_minutes ||
        biometrics.steps ||
        biometrics.active_calories)
  );

  const handleConnectOrSync = async () => {
    if (!isIos) {
      Alert.alert(t('healthConnect.notSupportedTitle'), t('healthConnect.healthIosOnly'));
      return;
    }

    if (!isAvailable) {
      Alert.alert(t('healthConnect.unavailableTitle'), t('healthConnect.healthUnavailable'));
      return;
    }

    setSyncing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      // Step 1: Prompt for full permissions
      const granted = await requestFullHealthKitPermissions();
      if (!granted) {
        Alert.alert(
          t('healthConnect.permissionsNoteTitle'),
          t('healthConnect.permissionsNoteBody')
        );
      }

      // Step 2: Sync 7 days of biometrics and workouts
      const res = await syncAppleHealthData(7);

      if (res.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        // Refresh local state via callback
        const { getCachedTodayBiometrics } = require('../../services/appleHealthService');
        const fresh = await getCachedTodayBiometrics();
        onSyncCompleted(fresh);

        Alert.alert(
          t('healthConnect.syncedTitle'),
          res.message || t('healthConnect.syncedBody', { bio: res.biometricsSynced || 0, workouts: res.workoutsSynced || 0 })
        );
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert(t('healthConnect.syncIncompleteTitle'), res.message || t('healthConnect.syncIncompleteBody'));
      }
    } catch (err: any) {
      console.error('[AppleHealthStatusCard] Sync error:', err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(t('integrationMsgs.syncErrorTitle'), err?.message || t('healthConnect.syncFailed'));
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Card className="mb-4 bg-theme-card p-4 border border-theme-border">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-x-3 flex-1 pr-2">
          <View className="w-10 h-10 rounded-2xl bg-red-500/15 items-center justify-center">
            <Ionicons name="heart" size={22} color="#EF4444" />
          </View>
          <View className="flex-1">
            <View className="flex-row items-center gap-x-2">
              <Text className="text-sm font-bold text-theme-text">{t('healthConnect.cardTitle')}</Text>
              <View
                className={`px-2 py-0.5 rounded-full ${
                  hasData ? 'bg-emerald-500/15' : 'bg-amber-500/15'
                }`}
              >
                <Text
                  className={`text-[10px] font-bold ${
                    hasData ? 'text-emerald-500' : 'text-amber-500'
                  }`}
                >
                  {hasData ? t('common.active') : t('healthConnect.pendingAuth')}
                </Text>
              </View>
            </View>
            <Text className="text-xs text-theme-muted mt-0.5">
              {hasData
                ? t('healthConnect.pullingData')
                : t('healthConnect.authorizePrompt')}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={handleConnectOrSync}
          disabled={syncing}
          activeOpacity={0.8}
          className="px-3.5 py-2 rounded-xl bg-theme-accent flex-row items-center gap-x-1.5 shadow-xs"
        >
          {syncing ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="sync-outline" size={14} color="#FFFFFF" />
              <Text className="text-xs font-bold text-white">
                {hasData ? t('healthConnect.sync') : t('healthConnect.connect')}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </Card>
  );
};
