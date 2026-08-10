import React, { useState, useRef } from 'react';
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  Animated,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { SparkTab } from '../../components/progress/SparkTab';
import { NutritionTab } from '../../components/progress/NutritionTab';
import { HealthTab } from '../../components/progress/HealthTab';

import { useTabBar } from '../../context/TabBarContext';
import { useLanguage } from '../../context/LanguageContext';

const TABS = ['spark', 'nutrition', 'health'] as const;
type TabType = typeof TABS[number];

export default function ProgressScreen() {
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const { notifyScroll } = useTabBar();
  const { t } = useLanguage();

  const horizontalScrollViewRef = useRef<ScrollView>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const [activeTab, setActiveTab] = useState<TabType>('spark');

  const now = new Date();
  const dayOfWeekShort = now.toLocaleDateString('en-US', { weekday: 'short' });
  const monthShort = now.toLocaleDateString('en-US', { month: 'short' });
  const dayNum = now.getDate();
  const headerDateLabel = `${dayOfWeekShort}, ${monthShort} ${dayNum}`;

  // Segment width for 3 equal pills inside bg-theme-card rounded-2xl p-1 (px-5 outer padding = 40px, p-1 inner padding = 8px)
  const segmentWidth = (SCREEN_WIDTH - 40 - 8) / 3;

  const indicatorTranslateX = scrollX.interpolate({
    inputRange: [0, SCREEN_WIDTH, 2 * SCREEN_WIDTH],
    outputRange: [0, segmentWidth, 2 * segmentWidth],
    extrapolate: 'clamp',
  });

  // Opacity interpolations for pill text labels
  const sparkWhiteOpacity = scrollX.interpolate({
    inputRange: [0, SCREEN_WIDTH],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });
  const sparkGreyOpacity = scrollX.interpolate({
    inputRange: [0, SCREEN_WIDTH],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const nutritionWhiteOpacity = scrollX.interpolate({
    inputRange: [0, SCREEN_WIDTH, 2 * SCREEN_WIDTH],
    outputRange: [0, 1, 0],
    extrapolate: 'clamp',
  });
  const nutritionGreyOpacity = scrollX.interpolate({
    inputRange: [0, SCREEN_WIDTH, 2 * SCREEN_WIDTH],
    outputRange: [1, 0, 1],
    extrapolate: 'clamp',
  });

  const healthWhiteOpacity = scrollX.interpolate({
    inputRange: [SCREEN_WIDTH, 2 * SCREEN_WIDTH],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const healthGreyOpacity = scrollX.interpolate({
    inputRange: [SCREEN_WIDTH, 2 * SCREEN_WIDTH],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  const handleTabPress = (tabId: TabType) => {
    Haptics.selectionAsync();
    setActiveTab(tabId);

    const index = TABS.indexOf(tabId);
    if (index !== -1 && horizontalScrollViewRef.current) {
      horizontalScrollViewRef.current.scrollTo({
        x: index * SCREEN_WIDTH,
        animated: true,
      });
    }
  };

  const handleHorizontalScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const pageIndex = Math.round(offsetX / SCREEN_WIDTH);
    const newTab = TABS[pageIndex];

    if (newTab && newTab !== activeTab) {
      setActiveTab(newTab);
    }
  };

  return (
    <View className="flex-1 bg-theme-bg">
      {/* TOP HEADER MATCHING DASHBOARD EXACT POSITIONING */}
      <View className="px-5 pt-3 pb-2 bg-theme-bg">
        <View className="flex-row justify-between items-center mb-3">
          <View>
            <Text className="text-2xl font-extrabold text-theme-text tracking-tight">Progress</Text>
          </View>
          <View className="flex-row items-center gap-1.5 bg-theme-card px-3 py-1.5 rounded-full shadow-sm">
            <Ionicons name="calendar-outline" size={13} color="#FF5F3B" />
            <Text className="text-xs font-bold font-mono text-theme-muted">{headerDateLabel}</Text>
          </View>
        </View>

        {/* 3-SEGMENT SUB-TAB PILL SWITCHER */}
        <View className="relative flex-row bg-theme-card rounded-2xl p-1 overflow-hidden">
          <Animated.View
            className="absolute top-1 bottom-1 bg-theme-accent rounded-xl"
            style={{ left: 4, width: segmentWidth, transform: [{ translateX: indicatorTranslateX }] }}
          />

          {/* SPARK PILL */}
          <TouchableOpacity
            onPress={() => handleTabPress('spark')}
            className="flex-1 py-2.5 items-center justify-center z-10"
          >
            <View className="relative items-center justify-center">
              <Animated.Text style={{ opacity: sparkWhiteOpacity }} className="text-sm font-extrabold text-white absolute">
                Spark
              </Animated.Text>
              <Animated.Text style={{ opacity: sparkGreyOpacity }} className="text-sm font-extrabold text-[#6F6F79]">
                Spark
              </Animated.Text>
            </View>
          </TouchableOpacity>

          {/* NUTRITION PILL */}
          <TouchableOpacity
            onPress={() => handleTabPress('nutrition')}
            className="flex-1 py-2.5 items-center justify-center z-10"
          >
            <View className="relative items-center justify-center">
              <Animated.Text style={{ opacity: nutritionWhiteOpacity }} className="text-sm font-extrabold text-white absolute">
                Nutrition
              </Animated.Text>
              <Animated.Text style={{ opacity: nutritionGreyOpacity }} className="text-sm font-extrabold text-[#6F6F79]">
                Nutrition
              </Animated.Text>
            </View>
          </TouchableOpacity>

          {/* HEALTH PILL */}
          <TouchableOpacity
            onPress={() => handleTabPress('health')}
            className="flex-1 py-2.5 items-center justify-center z-10"
          >
            <View className="relative items-center justify-center">
              <Animated.Text style={{ opacity: healthWhiteOpacity }} className="text-sm font-extrabold text-white absolute">
                Health
              </Animated.Text>
              <Animated.Text style={{ opacity: healthGreyOpacity }} className="text-sm font-extrabold text-[#6F6F79]">
                Health
              </Animated.Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>

      {/* SWIPABLE HORIZONTAL PAGER VIEW */}
      <Animated.ScrollView
        ref={horizontalScrollViewRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false, listener: handleHorizontalScroll }
        )}
        scrollEventThrottle={16}
        className="flex-1"
      >
        {/* SPARK PAGE */}
        <View style={{ width: SCREEN_WIDTH }} className="flex-1">
          <ScrollView
            className="flex-1 px-5 pt-2"
            contentContainerStyle={{ paddingBottom: 120 }}
            showsVerticalScrollIndicator={false}
            onScrollBeginDrag={notifyScroll}
          >
            <SparkTab />
          </ScrollView>
        </View>

        {/* NUTRITION PAGE */}
        <View style={{ width: SCREEN_WIDTH }} className="flex-1">
          <ScrollView
            className="flex-1 px-5 pt-2"
            contentContainerStyle={{ paddingBottom: 120 }}
            showsVerticalScrollIndicator={false}
            onScrollBeginDrag={notifyScroll}
          >
            <NutritionTab />
          </ScrollView>
        </View>

        {/* HEALTH PAGE */}
        <View style={{ width: SCREEN_WIDTH }} className="flex-1">
          <ScrollView
            className="flex-1 px-5 pt-2"
            contentContainerStyle={{ paddingBottom: 120 }}
            showsVerticalScrollIndicator={false}
            onScrollBeginDrag={notifyScroll}
          >
            <HealthTab />
          </ScrollView>
        </View>
      </Animated.ScrollView>
    </View>
  );
}
