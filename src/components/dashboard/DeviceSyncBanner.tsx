import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '@/hooks/use-theme';
import { useUser } from '../../context/UserStore';
import { IntegrationsSheet } from '../integrations/IntegrationsSheet';

const DISMISS_KEY = '@rooka_device_sync_banner_dismissed_until';
const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface DeviceSyncBannerProps {
  className?: string;
}

export const DeviceSyncBanner: React.FC<DeviceSyncBannerProps> = ({ className = 'mx-4 my-2' }) => {
  const theme = useTheme();
  const { user } = useUser();
  const { t } = useLanguage();

  const [isDismissed, setIsDismissed] = useState(true); // default hidden until checked
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  const isConnected = !!(
    user?.garmin_connected ||
    (user as any)?.garmin_username ||
    user?.strava_connected ||
    (user as any)?.strava_athlete_id
  );

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(DISMISS_KEY);
        if (stored) {
          const dismissedUntil = parseInt(stored, 10);
          if (!isNaN(dismissedUntil) && Date.now() < dismissedUntil) {
            if (mounted) setIsDismissed(true);
            return;
          }
        }
        if (mounted) setIsDismissed(false);
      } catch (_) {
        if (mounted) setIsDismissed(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const handleDismiss = async () => {
    Haptics.selectionAsync();
    setIsDismissed(true);
    try {
      const until = Date.now() + DISMISS_DURATION_MS;
      await AsyncStorage.setItem(DISMISS_KEY, until.toString());
    } catch (_) {}
  };

  // If already connected or dismissed, do not render
  if (isConnected || isDismissed) {
    return (
      <IntegrationsSheet
        visible={isSheetOpen}
        onClose={() => setIsSheetOpen(false)}
      />
    );
  }

  return (
    <>
      <View className={`bg-theme-card border border-theme-border rounded-2xl p-3.5 ${className}`}>
        <View className="flex-row items-start justify-between">
          <View className="flex-row items-center gap-2.5 flex-1 mr-2">
            <View className="w-8 h-8 rounded-xl bg-theme-accent/15 items-center justify-center">
              <Ionicons name="watch-outline" size={18} color={theme.tint} />
            </View>
            <View className="flex-1">
              <Text className="text-xs font-extrabold text-theme-text">
                {t('onboarding.syncSmartwatchTitle')}
              </Text>
            </View>
          </View>

          {/* Dismiss button */}
          <Pressable
            hitSlop={8}
            onPress={handleDismiss}
            className="w-6 h-6 items-center justify-center rounded-full bg-theme-bg border border-theme-border"
          >
            <Ionicons name="close" size={13} color={theme.textSecondary} />
          </Pressable>
        </View>

        <Text className="text-[11px] text-theme-muted mt-1.5 leading-relaxed">
          {t('onboarding.syncSmartwatchSubtitle')}
        </Text>

        <View className="flex-row items-center justify-between mt-3 pt-2.5 border-t border-theme-border/40">
          <View className="flex-row items-center gap-1.5">
            <View className="w-2 h-2 rounded-full bg-theme-accent" />
            <Text className="text-[10px] font-bold text-theme-muted uppercase tracking-wider">
              Garmin / Strava
            </Text>
          </View>

          <Pressable
            onPress={() => {
              Haptics.selectionAsync();
              setIsSheetOpen(true);
            }}
            className="px-3 py-1.5 bg-theme-accent-strong rounded-button flex-row items-center gap-1.5"
          >
            <Ionicons name="link-outline" size={12} color="#FFFFFF" />
            <Text className="text-white text-xs font-bold">
              {t('onboarding.connectDeviceBtn')}
            </Text>
          </Pressable>
        </View>
      </View>

      <IntegrationsSheet
        visible={isSheetOpen}
        onClose={() => setIsSheetOpen(false)}
      />
    </>
  );
};
