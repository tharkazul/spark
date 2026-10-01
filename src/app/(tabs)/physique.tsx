import React, { useState, useRef } from 'react';
import {
  ScrollView,
  View,
  Text,
  useWindowDimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { OverviewSubTab } from '../../components/progress/OverviewSubTab';
import { FitnessSubTab } from '../../components/progress/FitnessSubTab';
import { BodySubTab } from '../../components/progress/BodySubTab';
import { MyLogSubTab } from '../../components/social/MyLogSubTab';
import { NutritionTab } from '../../components/progress/NutritionTab';
import { BottomSheetModal } from '../../components/ui/BottomSheetModal';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { ScreenHeaderTitleRow } from '../../components/ui/ScreenHeaderTitleRow';

import { useTabBar } from '../../context/TabBarContext';
import { useTabBarInset } from '../../hooks/useTabBarInset';
import { useLanguage } from '../../context/LanguageContext';

const TABS = ['overview', 'fitness', 'body', 'history'] as const;
type TabType = typeof TABS[number];

export default function ProgressScreen() {
  const router = useRouter();
  const { t } = useLanguage();
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const { notifyScroll, notifyScrollEnd } = useTabBar();
  const tabBarInset = useTabBarInset();
  const insets = useSafeAreaInsets();

  const progressSegments = [
    { key: 'overview', label: t('progress.overview', 'Overview') },
    { key: 'fitness', label: t('progress.fitness', 'Fitness') },
    { key: 'body', label: t('progress.body', 'Body') },
    { key: 'history', label: t('progress.history', 'History') },
  ];

  const horizontalScrollViewRef = useRef<ScrollView>(null);
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [isNutritionModalOpen, setIsNutritionModalOpen] = useState(false);

  const handleOpenActivity = (id: string | number) => {
    Haptics.selectionAsync();
    router.push({ pathname: '/activity/[id]', params: { id: String(id) } });
  };

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
    <View className="flex-1 bg-theme-bg" style={{ paddingTop: insets.top }}>
      {/* TOP HEADER MATCHING DASHBOARD EXACT POSITIONING */}
      <View className="px-5 pt-3 pb-2 bg-theme-bg">
        <ScreenHeaderTitleRow title={t('tabs.progress', 'Progress')} />

        {/* 4-SEGMENT SUB-TAB SWITCHER (D-03) */}
        <View className="mt-1">
          <SegmentedControl
            items={progressSegments}
            value={activeTab}
            onChange={(key) => handleTabPress(key as TabType)}
          />
        </View>
      </View>

      {/* SWIPABLE HORIZONTAL PAGER VIEW */}
      <ScrollView
        ref={horizontalScrollViewRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        overScrollMode="never"
        onMomentumScrollEnd={handleHorizontalScroll}
        scrollEventThrottle={16}
        className="flex-1"
      >
        {/* PAGE 0: OVERVIEW */}
        <View style={{ width: SCREEN_WIDTH }} className="flex-1">
          <ScrollView
            className="flex-1 px-5 pt-2"
            contentContainerStyle={{ paddingBottom: tabBarInset }}
            showsVerticalScrollIndicator={false}
            onScrollBeginDrag={notifyScroll}
            onScrollEndDrag={notifyScrollEnd}
            onMomentumScrollEnd={notifyScrollEnd}
          >
            <OverviewSubTab onOpenNutrition={() => setIsNutritionModalOpen(true)} />
          </ScrollView>
        </View>

        {/* PAGE 1: FITNESS (PMC + TRAINING READINESS) */}
        <View style={{ width: SCREEN_WIDTH }} className="flex-1">
          <ScrollView
            className="flex-1 px-5 pt-2"
            contentContainerStyle={{ paddingBottom: tabBarInset }}
            showsVerticalScrollIndicator={false}
            onScrollBeginDrag={notifyScroll}
            onScrollEndDrag={notifyScrollEnd}
            onMomentumScrollEnd={notifyScrollEnd}
          >
            <FitnessSubTab />
          </ScrollView>
        </View>

        {/* PAGE 2: BODY (HEALTH, NIGGLES, SLEEP, VITALS, CYCLE) */}
        <View style={{ width: SCREEN_WIDTH }} className="flex-1">
          <ScrollView
            className="flex-1 px-5 pt-2"
            contentContainerStyle={{ paddingBottom: tabBarInset }}
            showsVerticalScrollIndicator={false}
            onScrollBeginDrag={notifyScroll}
            onScrollEndDrag={notifyScrollEnd}
            onMomentumScrollEnd={notifyScrollEnd}
          >
            <BodySubTab />
          </ScrollView>
        </View>

        {/* PAGE 3: HISTORY (MY LOG ACTIVITY FEED) */}
        <View style={{ width: SCREEN_WIDTH }} className="flex-1">
          <ScrollView
            className="flex-1 px-5 pt-2"
            contentContainerStyle={{ paddingBottom: tabBarInset }}
            showsVerticalScrollIndicator={false}
            onScrollBeginDrag={notifyScroll}
            onScrollEndDrag={notifyScrollEnd}
            onMomentumScrollEnd={notifyScrollEnd}
          >
            <MyLogSubTab onOpenActivityModal={handleOpenActivity} />
          </ScrollView>
        </View>
      </ScrollView>

      {/* NUTRITION MODAL SHEET */}
      <BottomSheetModal
        visible={isNutritionModalOpen}
        onClose={() => setIsNutritionModalOpen(false)}
        showHandle
      >
        <View className="max-h-[80vh] pb-6">
          <View className="flex-row items-center justify-between pb-3 border-b border-theme-border/40 mb-3">
            <Text className="text-base font-extrabold text-theme-text font-jakarta">{t('progress.fuelingNutrition', 'Daily Fueling & Nutrition')}</Text>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            <NutritionTab />
          </ScrollView>
        </View>
      </BottomSheetModal>
    </View>
  );
}
