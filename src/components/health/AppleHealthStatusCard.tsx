import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Alert, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Card } from '../ui/Card';
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
      Alert.alert('Not Supported', 'Apple Health integration is only available on iOS devices.');
      return;
    }

    if (!isAvailable) {
      Alert.alert('Unavailable', 'Apple Health is not available on this device.');
      return;
    }

    setSyncing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      // Step 1: Prompt for full permissions
      const granted = await requestFullHealthKitPermissions();
      if (!granted) {
        Alert.alert(
          'Permissions Note',
          'Please ensure Health permissions are enabled in iPhone Settings > Health > Data Access & Devices > Rooka.'
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
          'Apple Health Synced! 🎉',
          res.message ||
            `Synced ${res.biometricsSynced || 0} daily biometric records and ${res.workoutsSynced || 0} workout(s) from Apple Health.`
        );
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert('Sync Incomplete', res.message || 'HealthKit sync finished with notes.');
      }
    } catch (err: any) {
      console.error('[AppleHealthStatusCard] Sync error:', err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Sync Error', err?.message || 'Failed to sync with Apple Health.');
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
              <Text className="text-sm font-bold text-theme-text">Apple Health Sync</Text>
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
                  {hasData ? 'Active' : 'Pending Authorization'}
                </Text>
              </View>
            </View>
            <Text className="text-xs text-theme-muted mt-0.5">
              {hasData
                ? 'Pulling HRV, Resting HR, Sleep, Steps & Workouts'
                : 'Authorize Rooka to read HealthKit metrics & show recovery trends'}
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
                {hasData ? 'Sync' : 'Connect'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </Card>
  );
};
