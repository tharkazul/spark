import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  useWindowDimensions,
  Animated,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { FeedSubTab } from '../../components/social/FeedSubTab';
import { MyLogSubTab } from '../../components/social/MyLogSubTab';
import { LeaderboardSubTab } from '../../components/social/LeaderboardSubTab';
import { ActivityDetailModal } from '../../components/social/ActivityDetailModal';
import { useTabBar } from '../../context/TabBarContext';
import { useLanguage } from '../../context/LanguageContext';
import { Activity } from '../../types/activity';
import { ScreenHeaderTitleRow } from '../../components/ui/ScreenHeaderTitleRow';

const TABS = ['feed', 'mylog', 'leaderboard'] as const;
type TabType = typeof TABS[number];

export default function SocialScreen() {
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const { notifyScroll, tabBarOccupied } = useTabBar();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();

  const horizontalScrollViewRef = useRef<ScrollView>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const [activeTab, setActiveTab] = useState<TabType>('feed');

  // Modal State
  const [modalVisible, setModalVisible] = useState<boolean>(false);
  const [selectedActivityId, setSelectedActivityId] = useState<string | number | null>(null);
  const [selectedInitialActivity, setSelectedInitialActivity] = useState<Partial<Activity> | undefined>(undefined);

  const handleOpenActivityModal = (id: string | number, initialAct?: Partial<Activity>) => {
    Haptics.selectionAsync();
    setSelectedActivityId(id);
    setSelectedInitialActivity(initialAct);
    setModalVisible(true);
  };

  const handleCloseActivityModal = () => {
    setModalVisible(false);
    setSelectedActivityId(null);
    setSelectedInitialActivity(undefined);
  };

  const segmentWidth = (SCREEN_WIDTH - 40 - 8) / 3;

  const indicatorTranslateX = scrollX.interpolate({
    inputRange: [0, SCREEN_WIDTH, 2 * SCREEN_WIDTH],
    outputRange: [0, segmentWidth, 2 * segmentWidth],
    extrapolate: 'clamp',
  });

  const feedWhiteOpacity = scrollX.interpolate({
    inputRange: [0, SCREEN_WIDTH],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });
  const feedGreyOpacity = scrollX.interpolate({
    inputRange: [0, SCREEN_WIDTH],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const logWhiteOpacity = scrollX.interpolate({
    inputRange: [0, SCREEN_WIDTH, 2 * SCREEN_WIDTH],
    outputRange: [0, 1, 0],
    extrapolate: 'clamp',
  });
  const logGreyOpacity = scrollX.interpolate({
    inputRange: [0, SCREEN_WIDTH, 2 * SCREEN_WIDTH],
    outputRange: [1, 0, 1],
    extrapolate: 'clamp',
  });

  const leaderboardWhiteOpacity = scrollX.interpolate({
    inputRange: [SCREEN_WIDTH, 2 * SCREEN_WIDTH],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const leaderboardGreyOpacity = scrollX.interpolate({
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
      {/* HEADER WITH TITLE AND SUB-TAB SWITCHER */}
      <View className="px-5 pt-3 pb-2 bg-theme-bg">
        <ScreenHeaderTitleRow title="Social" />

        {/* 3-SEGMENT SUB-TAB PILL SWITCHER */}
        <View className="relative flex-row bg-theme-card rounded-2xl p-1 overflow-hidden mt-1">
          <Animated.View
            className="absolute top-1 bottom-1 bg-theme-accent rounded-xl"
            style={{ left: 4, width: segmentWidth, transform: [{ translateX: indicatorTranslateX }] }}
          />

          {/* FEED PILL */}
          <TouchableOpacity
            onPress={() => handleTabPress('feed')}
            className="flex-1 py-2.5 items-center justify-center z-10"
          >
            <View className="relative items-center justify-center">
              <Animated.Text style={{ opacity: feedWhiteOpacity }} className="text-sm font-extrabold text-white absolute">
                Feed
              </Animated.Text>
              <Animated.Text style={{ opacity: feedGreyOpacity }} className="text-sm font-extrabold text-[#6F6F79]">
                Feed
              </Animated.Text>
            </View>
          </TouchableOpacity>

          {/* MY LOG PILL */}
          <TouchableOpacity
            onPress={() => handleTabPress('mylog')}
            className="flex-1 py-2.5 items-center justify-center z-10"
          >
            <View className="relative items-center justify-center">
              <Animated.Text style={{ opacity: logWhiteOpacity }} className="text-sm font-extrabold text-white absolute">
                My Log
              </Animated.Text>
              <Animated.Text style={{ opacity: logGreyOpacity }} className="text-sm font-extrabold text-[#6F6F79]">
                My Log
              </Animated.Text>
            </View>
          </TouchableOpacity>

          {/* LEADERBOARD PILL */}
          <TouchableOpacity
            onPress={() => handleTabPress('leaderboard')}
            className="flex-1 py-2.5 items-center justify-center z-10"
          >
            <View className="relative items-center justify-center">
              <Animated.Text style={{ opacity: leaderboardWhiteOpacity }} className="text-sm font-extrabold text-white absolute">
                Leaderboard
              </Animated.Text>
              <Animated.Text style={{ opacity: leaderboardGreyOpacity }} className="text-sm font-extrabold text-[#6F6F79]">
                Leaderboard
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
        {/* FEED PAGE */}
        <View style={{ width: SCREEN_WIDTH }} className="flex-1">
          <ScrollView
            className="flex-1 px-5 pt-2"
            contentContainerStyle={{ paddingBottom: tabBarOccupied + 20 }}
            showsVerticalScrollIndicator={false}
            onScrollBeginDrag={notifyScroll}
          >
            <FeedSubTab onOpenActivityModal={handleOpenActivityModal} />
          </ScrollView>
        </View>

        {/* MY LOG PAGE */}
        <View style={{ width: SCREEN_WIDTH }} className="flex-1">
          <ScrollView
            className="flex-1 px-5 pt-2"
            contentContainerStyle={{ paddingBottom: tabBarOccupied + 20 }}
            showsVerticalScrollIndicator={false}
            onScrollBeginDrag={notifyScroll}
          >
            <MyLogSubTab onOpenActivityModal={handleOpenActivityModal} />
          </ScrollView>
        </View>

        {/* LEADERBOARD PAGE */}
        <View style={{ width: SCREEN_WIDTH }} className="flex-1">
          <ScrollView
            className="flex-1 px-5 pt-2"
            contentContainerStyle={{ paddingBottom: tabBarOccupied + 20 }}
            showsVerticalScrollIndicator={false}
            onScrollBeginDrag={notifyScroll}
          >
            <LeaderboardSubTab />
          </ScrollView>
        </View>
      </Animated.ScrollView>

      {/* ACTIVITY DETAIL MODAL */}
      <ActivityDetailModal
        visible={modalVisible}
        activityId={selectedActivityId}
        initialActivity={selectedInitialActivity}
        onClose={handleCloseActivityModal}
      />
    </View>
  );
}
