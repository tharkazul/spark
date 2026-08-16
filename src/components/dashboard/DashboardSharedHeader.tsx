import React from 'react';
import { View, Text, TouchableOpacity, Animated, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useLanguage } from '../../context/LanguageContext';
import { useHeaderLayout } from '../../context/HeaderLayoutContext';
import { ScreenHeaderTitleRow } from '../ui/ScreenHeaderTitleRow';

export function DashboardSharedHeader({ position }: { position: Animated.AnimatedInterpolation<number> }) {
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useLanguage();
  const { setHeaderHeight } = useHeaderLayout();

  // Container width is SCREEN_WIDTH - 40 (px-5 padding). Inside is p-1 padding (8px total).
  const segmentWidth = (SCREEN_WIDTH - 40 - 8) / 2;

  const indicatorTranslateX = position.interpolate({
    inputRange: [0, 1],
    outputRange: [0, segmentWidth],
    extrapolate: 'clamp',
  });

  const headerTranslateX = position.interpolate({
    inputRange: [0, 1, 2],
    outputRange: [0, 0, -SCREEN_WIDTH],
    extrapolate: 'clamp',
  });

  const opacity = position.interpolate({
    inputRange: [0, 1, 1.99, 2],
    outputRange: [1, 1, 1, 0],
    extrapolate: 'clamp',
  });

  // Animated Title Opacity
  const dashboardTitleOpacity = position.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 0, 0],
    extrapolate: 'clamp',
  });

  const planningTitleOpacity = position.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, 0, 1],
    extrapolate: 'clamp',
  });

  // Animated Pill Label Opacity
  const dashboardWhiteOpacity = position.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });
  const dashboardGreyOpacity = position.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const planningWhiteOpacity = position.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const planningGreyOpacity = position.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  return (
    <View 
      className="absolute top-0 left-0 right-0 z-50" 
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
      <Animated.View style={{ transform: [{ translateX: headerTranslateX }], opacity }} className="px-5 pt-3 pb-2 bg-theme-bg" pointerEvents="box-none">
        <ScreenHeaderTitleRow>
          <View className="relative justify-center flex-1">
            <Animated.Text style={{ opacity: dashboardTitleOpacity }} className="text-2xl font-extrabold text-theme-text tracking-tight absolute">
              {t('nav.dashboard') === 'nav.dashboard' ? 'Dashboard' : t('nav.dashboard')}
            </Animated.Text>
            <Animated.Text style={{ opacity: planningTitleOpacity }} className="text-2xl font-extrabold text-theme-text tracking-tight">
              {t('nav.planning') === 'nav.planning' ? 'Planning' : t('nav.planning')}
            </Animated.Text>
          </View>
        </ScreenHeaderTitleRow>

        {/* Header Indicator */}
        <View className="relative flex-row bg-theme-card rounded-2xl p-1 overflow-hidden" pointerEvents="auto">
          <Animated.View 
            className="absolute top-1 bottom-1 bg-theme-accent rounded-xl" 
            style={{ left: 4, width: segmentWidth, transform: [{ translateX: indicatorTranslateX }] }} 
          />
          <TouchableOpacity onPress={() => router.navigate('/(tabs)')} className="flex-1 py-2.5 items-center justify-center z-10">
            <View className="relative items-center justify-center">
              <Animated.Text style={{ opacity: dashboardWhiteOpacity }} className="text-sm font-extrabold text-white absolute">Dashboard</Animated.Text>
              <Animated.Text style={{ opacity: dashboardGreyOpacity }} className="text-sm font-extrabold text-[#6F6F79]">Dashboard</Animated.Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.navigate('/(tabs)/planning')} className="flex-1 py-2.5 items-center justify-center z-10">
            <View className="relative items-center justify-center">
              <Animated.Text style={{ opacity: planningWhiteOpacity }} className="text-sm font-extrabold text-white absolute">Planning</Animated.Text>
              <Animated.Text style={{ opacity: planningGreyOpacity }} className="text-sm font-extrabold text-[#6F6F79]">Planning</Animated.Text>
            </View>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
}
