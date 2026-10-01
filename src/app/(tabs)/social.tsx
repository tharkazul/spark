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
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { useTabBarInset } from '../../hooks/useTabBarInset';

const TABS = ['feed', 'leaderboard'] as const;
type TabType = typeof TABS[number];

const SOCIAL_SEGMENTS = [
  { key: 'feed', label: 'Feed' },
  { key: 'leaderboard', label: 'Leaderboard' },
];

export default function SocialScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const { notifyScroll, notifyScrollEnd } = useTabBar();
  const { t } = useLanguage();
  const { user } = useUser();
  const insets = useSafeAreaInsets();
  const bottomInset = useTabBarInset();

  const horizontalScrollViewRef = useRef<ScrollView>(null);
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

  const handleTabPress = (tabId: string) => {
    const tabKey = tabId as TabType;
    setActiveTab(tabKey);
    const targetIndex = tabKey === 'feed' ? 0 : 1;

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
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              className="p-1.5 items-center justify-center mr-0.5"
            >
              <Ionicons name="person-add-outline" size={20} color={theme.tint} />
            </TouchableOpacity>
          }
        />

        {/* 2-SEGMENT SUB-TAB SWITCHER USING SHARED COMPONENT */}
        <View className="mt-1">
          <SegmentedControl
            items={SOCIAL_SEGMENTS}
            value={activeTab}
            onChange={handleTabPress}
            size="md"
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
        {/* PAGE 0: FEED */}
        <View style={{ width: SCREEN_WIDTH }} className="flex-1">
          <ScrollView
            className="flex-1 px-5 pt-2"
            contentContainerStyle={{ paddingBottom: bottomInset }}
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

        {/* PAGE 1: LEADERBOARD */}
        <View style={{ width: SCREEN_WIDTH }} className="flex-1">
          <ScrollView
            className="flex-1 px-5 pt-2"
            contentContainerStyle={{ paddingBottom: bottomInset }}
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
      </ScrollView>

      {/* ADD / SEARCH FRIENDS MODAL (Action sheet for finding connections) */}
      <AddFriendsModal
        visible={addFriendsModalVisible}
        onClose={() => setAddFriendsModalVisible(false)}
        onOpenAthleteProfile={handleOpenAthleteProfile}
      />
    </View>
  );
}
