import React from 'react';
import { View, Text, Animated, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLanguage } from '../../context/LanguageContext';
import { useUser } from '../../context/UserStore';
import { useHeaderLayout } from '../../context/HeaderLayoutContext';
import { ScreenHeaderTitleRow } from '../ui/ScreenHeaderTitleRow';

export function DashboardSharedHeader({ position }: { position: Animated.AnimatedInterpolation<number> }) {
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { user } = useUser();
  const { setHeaderHeight } = useHeaderLayout();

  const now = new Date();
  const dayOfWeekShort = now.toLocaleDateString('en-US', { weekday: 'short' });
  const monthShort = now.toLocaleDateString('en-US', { month: 'short' });
  const dayNum = now.getDate();
  const dateBadgeStr = `${dayOfWeekShort}, ${monthShort} ${dayNum}`;

  return (
    <View 
      className="absolute top-0 left-0 right-0 z-50 bg-theme-bg" 
      pointerEvents="box-none"
      style={{ paddingTop: insets.top }}
      onLayout={(e) => {
        const h = e.nativeEvent.layout.height;
        if (h > 0) {
          requestAnimationFrame(() => {
            setHeaderHeight(h);
          });
        }
      }}
    >
      <View className="px-5 pt-3 pb-2 bg-theme-bg" pointerEvents="box-none">
        <ScreenHeaderTitleRow>
          <View className="flex-row items-center justify-between flex-1">
            <Text className="text-2xl font-extrabold text-theme-text tracking-tight">
              Planning
            </Text>
            
            <View className="flex-row items-center gap-2">
              <View className="bg-theme-card border border-theme-border px-3 py-1.5 rounded-full flex-row items-center gap-1.5 shadow-xs">
                <Ionicons name="calendar-outline" size={13} color="#FF5F3B" />
                <Text className="text-xs font-bold text-theme-text">{dateBadgeStr}</Text>
              </View>
            </View>
          </View>
        </ScreenHeaderTitleRow>
      </View>
    </View>
  );
}
