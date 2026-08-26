import React, { useState, useRef, useEffect } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { Ionicons } from '@expo/vector-icons';
import { FeedSubTab } from '../../components/social/FeedSubTab';
import { MyLogSubTab } from '../../components/social/MyLogSubTab';
import {
  LeaderboardSubTab,
  LeaderboardTypeSwitcher,
  LEADERBOARD_SWITCHER_HEIGHT,
} from '../../components/social/LeaderboardSubTab';
import { ActivityDetailModal } from '../../components/social/ActivityDetailModal';
import { AddFriendsModal } from '../../components/social/AddFriendsModal';
import { AthleteProfileModal } from '../../components/social/AthleteProfileModal';
import { useTabBar } from '../../context/TabBarContext';
import { useLanguage } from '../../context/LanguageContext';
import { useUser } from '../../context/UserStore';
import { canAccessLeaderboard } from '../../utils/permissions';
import { socialApi } from '../../services/apiServices';
import { LeaderboardEntry } from '../../types/social';
import { Activity } from '../../types/activity';
import { ScreenHeaderTitleRow } from '../../components/ui/ScreenHeaderTitleRow';

const TABS = ['feed', 'mylog', 'leaderboard'] as const;
type TabType = typeof TABS[number];

export default function SocialScreen() {
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const { notifyScroll, tabBarOccupied } = useTabBar();
  const { t } = useLanguage();
  const { user } = useUser();
  const insets = useSafeAreaInsets();

  const horizontalScrollViewRef = useRef<ScrollView>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const [activeTab, setActiveTab] = useState<TabType>('feed');
  const lastLeaderboardPageIndex = useRef<number>(2);

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

  // Modal State
  const [modalVisible, setModalVisible] = useState<boolean>(false);
  const [selectedActivityId, setSelectedActivityId] = useState<string | number | null>(null);
  const [selectedInitialActivity, setSelectedInitialActivity] = useState<Partial<Activity> | undefined>(undefined);

  const [addFriendsModalVisible, setAddFriendsModalVisible] = useState<boolean>(false);
  const [selectedAthleteId, setSelectedAthleteId] = useState<number | string | null>(null);

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

  const handleOpenAthleteProfile = (userId: number | string) => {
    Haptics.selectionAsync();
    setSelectedAthleteId(userId);
  };

  const segmentWidth = (SCREEN_WIDTH - 40 - 8) / 3;

  const indicatorTranslateX = scrollX.interpolate({
    inputRange: [0, SCREEN_WIDTH, 2 * SCREEN_WIDTH, 3 * SCREEN_WIDTH],
    outputRange: [0, segmentWidth, 2 * segmentWidth, 2 * segmentWidth],
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
    inputRange: [SCREEN_WIDTH, 2 * SCREEN_WIDTH, 3 * SCREEN_WIDTH],
    outputRange: [0, 1, 1],
    extrapolate: 'clamp',
  });
  const leaderboardGreyOpacity = scrollX.interpolate({
    inputRange: [SCREEN_WIDTH, 2 * SCREEN_WIDTH, 3 * SCREEN_WIDTH],
    outputRange: [1, 0, 0],
    extrapolate: 'clamp',
  });

  const handleTabPress = (tabId: TabType) => {
    Haptics.selectionAsync();
    setActiveTab(tabId);

    let targetIndex = 0;
    if (tabId === 'feed') {
      targetIndex = 0;
    } else if (tabId === 'mylog') {
      targetIndex = 1;
    } else if (tabId === 'leaderboard') {
      targetIndex = lastLeaderboardPageIndex.current;
    }

    if (horizontalScrollViewRef.current) {
      horizontalScrollViewRef.current.scrollTo({
        x: targetIndex * SCREEN_WIDTH,
        animated: true,
      });
    }
  };

  const handleLeaderboardSubTabPress = (type: 'rooka' | 'quests') => {
    Haptics.selectionAsync();
    const targetIndex = type === 'rooka' ? 2 : 3;
    lastLeaderboardPageIndex.current = targetIndex;
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
    if (pageIndex === 2 || pageIndex === 3) {
      lastLeaderboardPageIndex.current = pageIndex;
    }
    const newTab = pageIndex >= 2 ? 'leaderboard' : TABS[pageIndex];

    if (newTab && newTab !== activeTab) {
      setActiveTab(newTab);
    }
  };

  // The switcher block reveals itself over the swipe from My Log into the
  // leaderboard, so nothing jumps at the halfway mark.
  const LEADERBOARD_HEADER_BLOCK = LEADERBOARD_SWITCHER_HEIGHT + 12;
  const leaderboardHeaderHeight = scrollX.interpolate({
    inputRange: [SCREEN_WIDTH, 2 * SCREEN_WIDTH],
    outputRange: [0, LEADERBOARD_HEADER_BLOCK],
    extrapolate: 'clamp',
  });
  const leaderboardHeaderOpacity = scrollX.interpolate({
    inputRange: [SCREEN_WIDTH, 2 * SCREEN_WIDTH],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const leaderboardType: 'rooka' | 'quests' =
    lastLeaderboardPageIndex.current === 3 ? 'quests' : 'rooka';

  const bottomInsetPadding = Math.max(tabBarOccupied + 48, 120);

  return (
    <View className="flex-1 bg-theme-bg" style={{ paddingTop: insets.top }}>
      {/* HEADER WITH TITLE AND SUB-TAB SWITCHER */}
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
              <Ionicons name="person-add-outline" size={18} color="#FF5F3B" />
            </TouchableOpacity>
          }
        />

        {/* 3-SEGMENT SUB-TAB PILL SWITCHER */}
        <View className="relative flex-row bg-[#F1F5F9] dark:bg-slate-800 rounded-xl p-1 overflow-hidden mt-1 border border-[#E2E8F0] dark:border-slate-700">
          <Animated.View
            className="absolute top-1 bottom-1 bg-[#FF5F3B] rounded-lg shadow-xs"
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
                className="text-xs font-medium text-[#64748B] dark:text-slate-400"
              >
                Feed
              </Animated.Text>
            </View>
          </TouchableOpacity>

          {/* MY LOG PILL */}
          <TouchableOpacity
            onPress={() => handleTabPress('mylog')}
            className="flex-1 py-2 items-center justify-center z-10"
          >
            <View className="relative items-center justify-center">
              <Animated.Text
                style={{ opacity: logWhiteOpacity }}
                className="text-xs font-semibold text-white absolute"
              >
                My Log
              </Animated.Text>
              <Animated.Text
                style={{ opacity: logGreyOpacity }}
                className="text-xs font-medium text-[#64748B] dark:text-slate-400"
              >
                My Log
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
                className="text-xs font-medium text-[#64748B] dark:text-slate-400"
              >
                Leaderboard
              </Animated.Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* The leaderboard's [Rooka Score | 7-Day Quests] switcher, pinned.
            It used to sit inside each of the two leaderboard pages, so swiping
            between them dragged two copies of the header across the screen.
            Height and opacity are driven off the same scrollX as the pill, so it
            grows in as you swipe toward the leaderboard rather than popping in
            when the page index rounds over — and Feed and My Log keep exactly
            the layout they had. */}
        <Animated.View
          style={{
            height: leaderboardHeaderHeight,
            opacity: leaderboardHeaderOpacity,
            overflow: 'hidden',
          }}
        >
          <View style={{ paddingTop: 12 }}>
            <LeaderboardTypeSwitcher
              scrollX={scrollX}
              currentType={leaderboardType}
              onSwitchType={handleLeaderboardSubTabPress}
            />
          </View>
        </Animated.View>
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
        {/* FEED PAGE */}
        <View style={{ width: SCREEN_WIDTH }} className="flex-1">
          <ScrollView
            className="flex-1 px-5 pt-2"
            contentContainerStyle={{ paddingBottom: bottomInsetPadding }}
            showsVerticalScrollIndicator={false}
            onScrollBeginDrag={notifyScroll}
          >
            <FeedSubTab
              onOpenActivityModal={handleOpenActivityModal}
              onOpenAthleteProfile={handleOpenAthleteProfile}
            />
          </ScrollView>
        </View>

        {/* MY LOG PAGE */}
        <View style={{ width: SCREEN_WIDTH }} className="flex-1">
          <ScrollView
            className="flex-1 px-5 pt-2"
            contentContainerStyle={{ paddingBottom: bottomInsetPadding }}
            showsVerticalScrollIndicator={false}
            onScrollBeginDrag={notifyScroll}
          >
            <MyLogSubTab onOpenActivityModal={handleOpenActivityModal} />
          </ScrollView>
        </View>

        {/* LEADERBOARD - ROOKA SCORE PAGE */}
        <View style={{ width: SCREEN_WIDTH }} className="flex-1">
          <ScrollView
            className="flex-1 px-5 pt-2"
            contentContainerStyle={{ paddingBottom: bottomInsetPadding }}
            showsVerticalScrollIndicator={false}
            onScrollBeginDrag={notifyScroll}
          >
            <LeaderboardSubTab
              type="rooka"
              scrollX={scrollX}
              onSwitchType={handleLeaderboardSubTabPress}
              loading={leaderboardLoading}
              rookaLeaderboard={rookaLeaderboard}
              questLeaderboard={questLeaderboard}
              hasAccess={hasLeaderboardAccess}
              onOpenAthleteProfile={handleOpenAthleteProfile}
              showSwitcher={false}
            />
          </ScrollView>
        </View>

        {/* LEADERBOARD - 7-DAY QUESTS PAGE */}
        <View style={{ width: SCREEN_WIDTH }} className="flex-1">
          <ScrollView
            className="flex-1 px-5 pt-2"
            contentContainerStyle={{ paddingBottom: bottomInsetPadding }}
            showsVerticalScrollIndicator={false}
            onScrollBeginDrag={notifyScroll}
          >
            <LeaderboardSubTab
              type="quests"
              scrollX={scrollX}
              onSwitchType={handleLeaderboardSubTabPress}
              loading={leaderboardLoading}
              rookaLeaderboard={rookaLeaderboard}
              questLeaderboard={questLeaderboard}
              hasAccess={hasLeaderboardAccess}
              onOpenAthleteProfile={handleOpenAthleteProfile}
              showSwitcher={false}
            />
          </ScrollView>
        </View>
      </Animated.ScrollView>

      {/* ACTIVITY DETAIL MODAL */}
      <ActivityDetailModal
        visible={modalVisible}
        activityId={selectedActivityId}
        initialActivity={selectedInitialActivity}
        onClose={handleCloseActivityModal}
        onOpenAthleteProfile={handleOpenAthleteProfile}
      />

      {/* ADD / SEARCH FRIENDS MODAL */}
      <AddFriendsModal
        visible={addFriendsModalVisible}
        onClose={() => setAddFriendsModalVisible(false)}
        onOpenAthleteProfile={handleOpenAthleteProfile}
      />

      {/* ATHLETE PUBLIC PROFILE MODAL */}
      <AthleteProfileModal
        visible={!!selectedAthleteId}
        athleteId={selectedAthleteId}
        onClose={() => setSelectedAthleteId(null)}
        onOpenActivityModal={handleOpenActivityModal}
      />
    </View>
  );
}

