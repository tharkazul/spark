import React, { useMemo, useState, useRef } from 'react';
import {
  ScrollView,
  View,
  Text,
  useWindowDimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Animated,
  TouchableOpacity
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { OverviewSubTab } from '../../components/progress/OverviewSubTab';
import { FitnessSubTab } from '../../components/progress/FitnessSubTab';
import { BodySubTab } from '../../components/progress/BodySubTab';
import { MyLogSubTab } from '../../components/social/MyLogSubTab';
import { NutritionTab } from '../../components/progress/NutritionTab';
import { BottomSheetModal, BottomSheetHeader } from '../../components/ui/BottomSheetModal';
import { ScreenHeaderTitleRow } from '../../components/ui/ScreenHeaderTitleRow';

import { useTabBar } from '../../context/TabBarContext';
import { useTabBarInset } from '../../hooks/useTabBarInset';
import { useLanguage } from '../../context/LanguageContext';
import { PagerLockContext } from '../../context/PagerLockContext';

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
  const scrollX = useRef(new Animated.Value(0)).current;
  const [segmentedWidth, setSegmentedWidth] = useState<number>(SCREEN_WIDTH - 40);

  const tabWidth = useMemo(() => {
    const w = segmentedWidth > 0 ? segmentedWidth : SCREEN_WIDTH - 40;
    return (w - 8) / TABS.length;
  }, [segmentedWidth, SCREEN_WIDTH]);

  const indicatorLeft = scrollX.interpolate({
    inputRange: TABS.map((_, i) => i * SCREEN_WIDTH),
    outputRange: TABS.map((_, i) => 4 + tabWidth * i),
    extrapolate: 'clamp',
  });

  const handleHorizontalScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { x: scrollX } } }],
    {
      useNativeDriver: false,
      listener: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
        const offsetX = event.nativeEvent.contentOffset.x;
        const pageIndex = Math.round(offsetX / SCREEN_WIDTH);
        const newTab = TABS[pageIndex];
        if (newTab && newTab !== activeTab) {
          setActiveTab(newTab);
        }
      },
    }
  );

  const [isNutritionModalOpen, setIsNutritionModalOpen] = useState(false);
  const [isPagerLocked, setIsPagerLocked] = useState(false);

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

  return (
    <View className="flex-1 bg-theme-bg" style={{ paddingTop: insets.top }}>
      {/* TOP HEADER MATCHING DASHBOARD EXACT POSITIONING */}
      <View className="px-5 pt-3 pb-2 bg-theme-bg">
        <ScreenHeaderTitleRow title={t('tabs.progress', 'Progress')} />

        
        {/* 4-SEGMENT SUB-TAB SWITCHER (D-03) */}
        <View
          onLayout={(e) => {
            const w = e.nativeEvent.layout.width;
            if (w > 0 && w !== segmentedWidth) {
              setSegmentedWidth(w);
            }
          }}
          className="relative flex-row bg-theme-inset rounded-tile p-1 overflow-hidden mt-1"
        >
          {/* Smooth Real-time Animated Indicator Bubble */}
          <Animated.View
            className="absolute top-1 bottom-1 bg-theme-accent-strong rounded-button"
            style={{
              left: indicatorLeft,
              width: tabWidth,
            }}
          />

          {TABS.map((tab, i) => {
            const textColor = scrollX.interpolate({
              inputRange: [(i - 0.5) * SCREEN_WIDTH, i * SCREEN_WIDTH, (i + 0.5) * SCREEN_WIDTH],
              outputRange: ['#8E8E93', '#FFFFFF', '#8E8E93'],
              extrapolate: 'clamp',
            });

            const labelMap: Record<TabType, string> = {
              overview: t('progress.overview') || 'Overview',
              fitness: t('progress.fitness') || 'Fitness',
              body: t('progress.body') || 'Body',
              history: t('progress.history') || 'History',
            };
            const label = labelMap[tab];

            return (
              <TouchableOpacity
                key={tab}
                onPress={() => handleTabPress(tab)}
                activeOpacity={0.8}
                className="flex-1 py-2.5 items-center justify-center z-10"
              >
                <Animated.Text
                  className="text-sm font-extrabold"
                  style={{ color: textColor }}
                >
                  {label}
                </Animated.Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* SWIPABLE HORIZONTAL PAGER VIEW */}
      <PagerLockContext.Provider value={setIsPagerLocked}>
      <Animated.ScrollView
        ref={horizontalScrollViewRef}
        horizontal
        pagingEnabled
        scrollEnabled={!isPagerLocked}
        showsHorizontalScrollIndicator={false}
        bounces={false}
        overScrollMode="never"
        onScroll={handleHorizontalScroll}
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

        {/* PAGE 1: FITNESS (PMC METRICS) */}
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
            <BodySubTab onOpenNutrition={() => setIsNutritionModalOpen(true)} />
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
      </Animated.ScrollView>
      </PagerLockContext.Provider>

      {/* NUTRITION MODAL SHEET */}
      <BottomSheetModal
        visible={isNutritionModalOpen}
        onClose={() => setIsNutritionModalOpen(false)}
        showHandle
        header={
          <View className="flex-row items-center justify-between pb-3 border-b border-theme-border/40 mb-3">
            <Text className="text-base font-extrabold text-theme-text font-jakarta">{t('progress.fuelingNutrition', 'Daily Fueling & Nutrition')}</Text>
          </View>
        }
      >
        <View className="max-h-[80vh] pb-6">
          <ScrollView showsVerticalScrollIndicator={false}>
            {isNutritionModalOpen && <NutritionTab />}
          </ScrollView>
        </View>
      </BottomSheetModal>
    </View>
  );
}
