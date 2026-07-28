import React, { useState, useRef } from 'react';
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { SparkTab } from '../../components/progress/SparkTab';
import { NutritionTab } from '../../components/progress/NutritionTab';
import { HealthTab } from '../../components/progress/HealthTab';
import { DailyLogTab } from '../../components/progress/DailyLogTab';

import { useTabBar } from '../../context/TabBarContext';

const TABS = ['spark', 'nutrition', 'health', 'dailylog'] as const;
type TabType = typeof TABS[number];

export default function ProgressScreen() {
  const { width: screenWidth } = useWindowDimensions();
  const { notifyScroll } = useTabBar();
  const horizontalScrollViewRef = useRef<ScrollView>(null);
  const tabButtonsScrollViewRef = useRef<ScrollView>(null);

  const [activeTab, setActiveTab] = useState<TabType>('spark');

  // Format today's date (e.g. Fri, Jul 24)
  const todayDateStr = new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  const handleTabPress = (tabId: TabType) => {
    Haptics.selectionAsync();
    setActiveTab(tabId);

    const index = TABS.indexOf(tabId);
    if (index !== -1 && horizontalScrollViewRef.current) {
      horizontalScrollViewRef.current.scrollTo({
        x: index * screenWidth,
        animated: true,
      });
    }
  };

  const handleHorizontalScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const pageIndex = Math.round(offsetX / screenWidth);
    const targetTab = TABS[pageIndex];

    if (targetTab && targetTab !== activeTab) {
      Haptics.selectionAsync();
      setActiveTab(targetTab);
    }
  };

  const renderTabButton = (id: TabType, label: string) => {
    const isActive = activeTab === id;
    return (
      <TouchableOpacity
        key={id}
        onPress={() => handleTabPress(id)}
        className={`px-4 py-2.5 mr-2 rounded-full border shadow-sm ${
          isActive
            ? 'bg-theme-accent border-theme-accent'
            : 'border-theme-border bg-theme-bg'
        }`}
      >
        <Text
          className={`text-xs font-extrabold ${
            isActive ? 'text-white' : 'text-theme-muted'
          }`}
        >
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-theme-bg" edges={['top']}>
      {/* SCREEN HEADER */}
      <View className="px-4 mt-4 mb-3 flex-row items-center justify-between">
        <View>
          <Text className="text-theme-text text-3xl font-extrabold tracking-tight">
            Progress
          </Text>
          <Text className="text-theme-muted text-xs mt-0.5">
            Track your overall progress, readiness & health.
          </Text>
        </View>
        <View className="px-3 py-1.5 bg-theme-bg border border-theme-border rounded-xl">
          <Text className="text-xs font-bold text-theme-muted">{todayDateStr}</Text>
        </View>
      </View>

      {/* HORIZONTAL SUB-TAB SELECTOR */}
      <View className="px-4 mb-3">
        <ScrollView
          ref={tabButtonsScrollViewRef}
          horizontal
          showsHorizontalScrollIndicator={false}
        >
          {renderTabButton('spark', 'Spark')}
          {renderTabButton('nutrition', 'Nutrition')}
          {renderTabButton('health', 'Health')}
          {renderTabButton('dailylog', 'Daily Log')}
        </ScrollView>
      </View>

      {/* SWIPABLE HORIZONTAL PAGER VIEW */}
      <ScrollView
        ref={horizontalScrollViewRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleHorizontalScroll}
        scrollEventThrottle={16}
        className="flex-1"
      >
        {/* SPARK PAGE */}
        <View style={{ width: screenWidth }} className="flex-1">
          <ScrollView
            className="flex-1 px-4"
            contentContainerStyle={{ paddingBottom: 110 }}
            showsVerticalScrollIndicator={false}
            onScrollBeginDrag={notifyScroll}
          >
            <SparkTab />
          </ScrollView>
        </View>

        {/* NUTRITION PAGE */}
        <View style={{ width: screenWidth }} className="flex-1">
          <ScrollView
            className="flex-1 px-4"
            contentContainerStyle={{ paddingBottom: 110 }}
            showsVerticalScrollIndicator={false}
            onScrollBeginDrag={notifyScroll}
          >
            <NutritionTab />
          </ScrollView>
        </View>

        {/* HEALTH / INJURY TRACKER PAGE */}
        <View style={{ width: screenWidth }} className="flex-1">
          <ScrollView
            className="flex-1 px-4"
            contentContainerStyle={{ paddingBottom: 110 }}
            showsVerticalScrollIndicator={false}
            onScrollBeginDrag={notifyScroll}
          >
            <HealthTab />
          </ScrollView>
        </View>

        {/* DAILY LOG PAGE */}
        <View style={{ width: screenWidth }} className="flex-1">
          <ScrollView
            className="flex-1 px-4"
            contentContainerStyle={{ paddingBottom: 110 }}
            showsVerticalScrollIndicator={false}
            onScrollBeginDrag={notifyScroll}
          >
            <DailyLogTab />
          </ScrollView>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
