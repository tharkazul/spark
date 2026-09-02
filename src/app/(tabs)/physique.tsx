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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { RookaTab } from '../../components/progress/RookaTab';
import { NutritionTab } from '../../components/progress/NutritionTab';
import { HealthTab } from '../../components/progress/HealthTab';

import { useTabBar } from '../../context/TabBarContext';
import { useLanguage } from '../../context/LanguageContext';

import { ScreenHeaderTitleRow } from '../../components/ui/ScreenHeaderTitleRow';

const TABS = ['rooka', 'nutrition', 'health'] as const;
type TabType = typeof TABS[number];

export default function ProgressScreen() {
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const { notifyScroll, notifyScrollEnd, tabBarOccupied } = useTabBar();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();

  const horizontalScrollViewRef = useRef<ScrollView>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const [activeTab, setActiveTab] = useState<TabType>('rooka');

  const segmentWidth = (SCREEN_WIDTH - 40 - 8) / 3;

  const indicatorTranslateX = scrollX.interpolate({
    inputRange: [0, SCREEN_WIDTH, 2 * SCREEN_WIDTH],
    outputRange: [0, segmentWidth, 2 * segmentWidth],
    extrapolate: 'clamp',
  });

  const rookaWhiteOpacity = scrollX.interpolate({
    inputRange: [0, SCREEN_WIDTH],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });
  const rookaGreyOpacity = scrollX.interpolate({
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
    <View className="flex-1 bg-theme-bg" style={{ paddingTop: insets.top }}>
      {/* TOP HEADER MATCHING DASHBOARD EXACT POSITIONING */}
      <View className="px-5 pt-3 pb-2 bg-theme-bg">
        <ScreenHeaderTitleRow title="Progress" />

        {/* 3-SEGMENT SUB-TAB PILL SWITCHER */}
        <View className="relative flex-row bg-theme-card rounded-tile p-1 overflow-hidden">
          <Animated.View
            className="absolute top-1 bottom-1 bg-theme-accent rounded-xl"
            style={{ left: 4, width: segmentWidth, transform: [{ translateX: indicatorTranslateX }] }}
          />

          {/* ROOKA PILL */}
          <TouchableOpacity
            onPress={() => handleTabPress('rooka')}
            className="flex-1 py-2.5 items-center justify-center z-10"
          >
            <View className="relative items-center justify-center">
              <Animated.Text style={{ opacity: rookaWhiteOpacity }} className="text-sm font-extrabold text-white absolute">
                rooka
              </Animated.Text>
              <Animated.Text style={{ opacity: rookaGreyOpacity }} className="text-sm font-extrabold text-theme-muted">
                rooka
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
              <Animated.Text style={{ opacity: nutritionGreyOpacity }} className="text-sm font-extrabold text-theme-muted">
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
              <Animated.Text style={{ opacity: healthGreyOpacity }} className="text-sm font-extrabold text-theme-muted">
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
        // Progress, Social and Profile each own a horizontal sub-tab pager, and
        // the main tabs are now a pager too. Turning off bounce/overscroll is
        // what makes the two cooperate: while this pager can still scroll in the
        // drag direction it keeps the gesture, and once it is at its first or
        // last page it has nowhere to go, so the drag passes up to the tab pager
        // and you cross into the next main tab. With bounce on, the inner pager
        // swallows the drag at its edge and rubber-bands instead.
        bounces={false}
        overScrollMode="never"
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false, listener: handleHorizontalScroll }
        )}
        scrollEventThrottle={16}
        className="flex-1"
      >
        {/* ROOKA PAGE */}
        <View style={{ width: SCREEN_WIDTH }} className="flex-1">
          <ScrollView
            className="flex-1 px-5 pt-0"
            contentContainerStyle={{ paddingBottom: tabBarOccupied + 20 }}
            showsVerticalScrollIndicator={false}
            onScrollBeginDrag={notifyScroll}            onScrollEndDrag={notifyScrollEnd}            onMomentumScrollEnd={notifyScrollEnd}
          >
            <RookaTab />
          </ScrollView>
        </View>

        {/* NUTRITION PAGE */}
        <View style={{ width: SCREEN_WIDTH }} className="flex-1">
          <ScrollView
            className="flex-1 px-5 pt-2"
            contentContainerStyle={{ paddingBottom: tabBarOccupied + 20 }}
            showsVerticalScrollIndicator={false}
            onScrollBeginDrag={notifyScroll}            onScrollEndDrag={notifyScrollEnd}            onMomentumScrollEnd={notifyScrollEnd}
          >
            <NutritionTab />
          </ScrollView>
        </View>

        {/* HEALTH PAGE */}
        <View style={{ width: SCREEN_WIDTH }} className="flex-1">
          <ScrollView
            className="flex-1 px-5 pt-2"
            contentContainerStyle={{ paddingBottom: tabBarOccupied + 20 }}
            showsVerticalScrollIndicator={false}
            onScrollBeginDrag={notifyScroll}            onScrollEndDrag={notifyScrollEnd}            onMomentumScrollEnd={notifyScrollEnd}
          >
            <HealthTab />
          </ScrollView>
        </View>
      </Animated.ScrollView>
    </View>
  );
}
