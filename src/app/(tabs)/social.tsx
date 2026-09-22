import React, { useState, useRef, useEffect } from 'react';
import { useTheme } from '@/hooks/use-theme';
import {
  View,
  ScrollView,
  TouchableOpacity,
  useWindowDimensions,
  Animated,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { Ionicons } from '@expo/vector-icons';
import { FeedSubTab } from '../../components/social/FeedSubTab';
import { LeaderboardSubTab } from '../../components/social/LeaderboardSubTab';
import { AddFriendsModal } from '../../components/social/AddFriendsModal';
import { useTabBar } from '../../context/TabBarContext';
import { useLanguage } from '../../context/LanguageContext';
import { useUser } from '../../context/UserStore';
import { canAccessLeaderboard } from '../../utils/permissions';
import { socialApi } from '../../services/apiServices';
import { LeaderboardEntry } from '../../types/social';
import { ScreenHeaderTitleRow } from '../../components/ui/ScreenHeaderTitleRow';

const TABS = ['feed', 'leaderboard'] as const;
type TabType = typeof TABS[number];

export default function SocialScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const { notifyScroll, notifyScrollEnd, tabBarOccupied } = useTabBar();
  const { t } = useLanguage();
  const { user } = useUser();
  const insets = useSafeAreaInsets();

  const horizontalScrollViewRef = useRef<ScrollView>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const [activeTab, setActiveTab] = useState<TabType>('feed');

  // Leaderboard data
  const hasLeaderboardAccess = canAccessLeaderboard(user?.subscription_tier);
  const [leaderboardLoading, setLeaderboardLoading] = useState<boolean>(true);
  const [rookaLeaderboard, setRookaLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [questLeaderboard, setQuestLeaderboard] = useState<LeaderboardEntry[]>([]);

  useEffect(() => {
    if (!hasLeaderboardAccess) {
      setLeaderboardLoading(false);
      return;
    }

    let isMounted = true;
    socialApi
      .getLeaderboard()
      .then((res) => {
        if (!isMounted) return;
        if (res?.leaderboard && Array.isArray(res.leaderboard)) {
          setRookaLeaderboard(res.leaderboard.map((item, idx) => ({ ...item, rank: idx + 1 })));
        }
        if (res?.questLeaderboard && Array.isArray(res.questLeaderboard)) {
          setQuestLeaderboard(res.questLeaderboard.map((item, idx) => ({ ...item, rank: idx + 1 })));
        }
      })
      .catch((err) => console.log('Leaderboard fetch error:', err))
      .finally(() => {
        if (isMounted) setLeaderboardLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [hasLeaderboardAccess]);

  // Modal State (Add Friends is a creation/search modal sheet)
  const [addFriendsModalVisible, setAddFriendsModalVisible] = useState<boolean>(false);

  // Push Navigation Drill-Downs (WWDC22 Guidance: slide-in push transitions for browsing)
  const handleOpenActivity = (id: string | number) => {
    Haptics.selectionAsync();
    router.push({ pathname: '/activity/[id]', params: { id: String(id) } });
  };

  const handleOpenAthleteProfile = (userId: number | string) => {
    Haptics.selectionAsync();
    router.push({ pathname: '/athlete/[id]', params: { id: String(userId) } });
  };

  // 2-tab segmented control calculations
  const segmentWidth = (SCREEN_WIDTH - 40 - 8) / 2;

  const indicatorTranslateX = scrollX.interpolate({
    inputRange: [0, SCREEN_WIDTH],
    outputRange: [0, segmentWidth],
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

  const leaderboardWhiteOpacity = scrollX.interpolate({
    inputRange: [0, SCREEN_WIDTH],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const leaderboardGreyOpacity = scrollX.interpolate({
    inputRange: [0, SCREEN_WIDTH],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  const handleTabPress = (tabId: TabType) => {
    Haptics.selectionAsync();
    setActiveTab(tabId);
    const targetIndex = tabId === 'feed' ? 0 : 1;

    if (horizontalScrollViewRef.current) {
      horizontalScrollViewRef.current.scrollTo({
        x: targetIndex * SCREEN_WIDTH,
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

  const bottomInsetPadding = Math.max(tabBarOccupied + 48, 120);

  return (
    <View className="flex-1 bg-theme-bg" style={{ paddingTop: insets.top }}>
      {/* HEADER WITH TITLE AND 2-SEGMENT SUB-TAB SWITCHER */}
      <View className="px-5 pt-3 pb-2 bg-theme-bg">
        <ScreenHeaderTitleRow
          title="Social"
          rightElement={
            <TouchableOpacity
              onPress={() => {
                Haptics.selectionAsync();
                setAddFriendsModalVisible(true);
              }}
              activeOpacity={0.7}
              className="p-1.5 items-center justify-center mr-0.5"
            >
              <Ionicons name="person-add-outline" size={18} color={theme.tint} />
            </TouchableOpacity>
          }
        />

        {/* 2-SEGMENT SUB-TAB PILL SWITCHER */}
        <View className="relative flex-row bg-theme-bg dark:bg-slate-800 rounded-xl p-1 overflow-hidden mt-1 border border-theme-border">
          <Animated.View
            className="absolute top-1 bottom-1 bg-theme-accent rounded-lg shadow-xs"
            style={{ left: 4, width: segmentWidth, transform: [{ translateX: indicatorTranslateX }] }}
          />

          {/* FEED PILL */}
          <TouchableOpacity
            onPress={() => handleTabPress('feed')}
            className="flex-1 py-2 items-center justify-center z-10"
          >
            <View className="relative items-center justify-center">
              <Animated.Text
                style={{ opacity: feedWhiteOpacity }}
                className="text-xs font-semibold text-white absolute"
              >
                Feed
              </Animated.Text>
              <Animated.Text
                style={{ opacity: feedGreyOpacity }}
                className="text-xs font-medium text-theme-muted"
              >
                Feed
              </Animated.Text>
            </View>
          </TouchableOpacity>

          {/* LEADERBOARD PILL */}
          <TouchableOpacity
            onPress={() => handleTabPress('leaderboard')}
            className="flex-1 py-2 items-center justify-center z-10"
          >
            <View className="relative items-center justify-center">
              <Animated.Text
                style={{ opacity: leaderboardWhiteOpacity }}
                className="text-xs font-semibold text-white absolute"
              >
                Leaderboard
              </Animated.Text>
              <Animated.Text
                style={{ opacity: leaderboardGreyOpacity }}
                className="text-xs font-medium text-theme-muted"
              >
                Leaderboard
              </Animated.Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>

      {/* SWIPABLE HORIZONTAL PAGER VIEW (Clean 2-page secondary layer) */}
      <Animated.ScrollView
        ref={horizontalScrollViewRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        overScrollMode="never"
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false, listener: handleHorizontalScroll }
        )}
        scrollEventThrottle={16}
        className="flex-1"
      >
        {/* PAGE 0: FEED */}
        <View style={{ width: SCREEN_WIDTH }} className="flex-1">
          <ScrollView
            className="flex-1 px-5 pt-2"
            contentContainerStyle={{ paddingBottom: bottomInsetPadding }}
            showsVerticalScrollIndicator={false}
            onScrollBeginDrag={notifyScroll}
            onScrollEndDrag={notifyScrollEnd}
            onMomentumScrollEnd={notifyScrollEnd}
          >
            <FeedSubTab
              onOpenActivityModal={handleOpenActivity}
              onOpenAthleteProfile={handleOpenAthleteProfile}
              onOpenAddFriends={() => {
                Haptics.selectionAsync();
                setAddFriendsModalVisible(true);
              }}
            />
          </ScrollView>
        </View>

        {/* PAGE 1: LEADERBOARD (In-place switcher between Rooka Score & 7-Day Quests) */}
        <View style={{ width: SCREEN_WIDTH }} className="flex-1">
          <ScrollView
            className="flex-1 px-5 pt-2"
            contentContainerStyle={{ paddingBottom: bottomInsetPadding }}
            showsVerticalScrollIndicator={false}
            onScrollBeginDrag={notifyScroll}
            onScrollEndDrag={notifyScrollEnd}
            onMomentumScrollEnd={notifyScrollEnd}
          >
            <LeaderboardSubTab
              loading={leaderboardLoading}
              rookaLeaderboard={rookaLeaderboard}
              questLeaderboard={questLeaderboard}
              hasAccess={hasLeaderboardAccess}
              onOpenAthleteProfile={handleOpenAthleteProfile}
              showSwitcher={true}
            />
          </ScrollView>
        </View>
      </Animated.ScrollView>

      {/* ADD / SEARCH FRIENDS MODAL (Action sheet for finding connections) */}
      <AddFriendsModal
        visible={addFriendsModalVisible}
        onClose={() => setAddFriendsModalVisible(false)}
        onOpenAthleteProfile={handleOpenAthleteProfile}
      />
    </View>
  );
}
