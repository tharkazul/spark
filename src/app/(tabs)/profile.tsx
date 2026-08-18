import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomSheetModal } from '../../components/ui/BottomSheetModal';
import { API_BASE_URL } from '../../constants/api';
import { useActivities } from '../../context/ActivityStore';
import { useLanguage } from '../../context/LanguageContext';
import { useTabBar } from '../../context/TabBarContext';
import { useUser } from '../../context/UserStore';
import { integrationsApi } from '../../services/apiServices';

import { AccountTab } from '../../components/profile/AccountTab';
import { ConnectionsTab } from '../../components/profile/ConnectionsTab';
import { GoalsTab } from '../../components/profile/GoalsTab';
import { ProfileTab } from '../../components/profile/ProfileTab';
import { ScreenHeaderTitleRow } from '../../components/ui/ScreenHeaderTitleRow';
import { hasSubscriptionTier } from '../../utils/permissions';

WebBrowser.maybeCompleteAuthSession();

export type ProfileSubTab = 'profile' | 'goals' | 'connections' | 'account';

export default function ProfileScreen() {
  const { user, logout, refreshUser } = useUser();
  const { t } = useLanguage();
  const { syncStrava, syncGarmin, refreshActivities } = useActivities();
  const { notifyScroll, tabBarOccupied } = useTabBar();
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const TABS: ProfileSubTab[] = ['profile', 'goals', 'connections', 'account'];

  const scrollViewRef = useRef<ScrollView>(null);
  const scrollX = useRef(new Animated.Value(0)).current;

  const [activeTab, setActiveTab] = useState<ProfileSubTab>('profile');

  // Garmin Form State
  const [garminModalVisible, setGarminModalVisible] = useState(false);
  const [garminUser, setGarminUser] = useState('');
  const [garminPass, setGarminPass] = useState('');
  const [garminLoading, setGarminLoading] = useState(false);

  // Strava Form State
  const [stravaModalVisible, setStravaModalVisible] = useState(false);
  const [stravaRefreshToken, setStravaRefreshToken] = useState('');
  const [stravaLoading, setStravaLoading] = useState(false);
  const [showManualStrava, setShowManualStrava] = useState(false);

  const username = user?.username || 'Athlete';
  const email = user?.email;
  const isRookaPlus = hasSubscriptionTier(user?.subscription_tier);

  const isGarminConnected = !!user?.garmin_connected;
  const isStravaConnected = !!user?.strava_connected;

  // Real-time Date Label matching Dashboard header
  const now = new Date();
  const dayOfWeekShort = now.toLocaleDateString('en-US', { weekday: 'short' });
  const monthShort = now.toLocaleDateString('en-US', { month: 'short' });
  const dayNum = now.getDate();
  const headerDateLabel = `${dayOfWeekShort}, ${monthShort} ${dayNum}`;

  // Pill Indicator calculation matching Dashboard
  const containerWidth = SCREEN_WIDTH - 40; // px-5 = 20px padding left & right
  const tabWidth = (containerWidth - 8) / TABS.length; // p-1 = 4px padding inside container

  const indicatorLeft = scrollX.interpolate({
    inputRange: TABS.map((_, i) => i * SCREEN_WIDTH),
    outputRange: TABS.map((_, i) => 4 + tabWidth * i),
    extrapolate: 'clamp',
  });

  const handleTabSwitch = (tab: ProfileSubTab) => {
    Haptics.selectionAsync();
    setActiveTab(tab);
    const index = TABS.indexOf(tab);
    if (index !== -1 && scrollViewRef.current) {
      scrollViewRef.current.scrollTo({ x: index * SCREEN_WIDTH, animated: true });
    }
  };

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const pageIndex = Math.round(offsetX / SCREEN_WIDTH);
    const newTab = TABS[pageIndex];
    if (newTab && newTab !== activeTab) {
      setActiveTab(newTab);
    }
  };

  // Garmin handlers
  const handleConnectGarmin = async () => {
    if (!garminUser.trim() || !garminPass.trim()) {
      return;
    }
    setGarminLoading(true);
    try {
      const res = await integrationsApi.saveGarminCredentials({
        garminUsername: garminUser.trim(),
        garminPassword: garminPass.trim(),
      });
      await refreshUser();
      setGarminUser('');
      setGarminPass('');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setGarminModalVisible(false);
    } catch (err: any) {
      console.error('Garmin connect error:', err);
    } finally {
      setGarminLoading(false);
    }
  };

  const handleDisconnectGarmin = async () => {
    setGarminLoading(true);
    try {
      await integrationsApi.disconnectGarmin();
      await refreshUser();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setGarminModalVisible(false);
    } catch (err: any) {
      console.error('Garmin disconnect error:', err);
    } finally {
      setGarminLoading(false);
    }
  };

  const handleSyncGarmin = async () => {
    setGarminLoading(true);
    try {
      await syncGarmin();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      console.error('Garmin sync error:', err);
    } finally {
      setGarminLoading(false);
    }
  };

  // Strava handlers
  const handleConnectStravaOAuth = async () => {
    setStravaLoading(true);
    try {
      const clientId = '208765';
      const stravaRedirectUri = `${API_BASE_URL}/oauthredirect`;
      const appDeepLink = Linking.createURL('oauthredirect');
      const authUrl = `https://www.strava.com/oauth/mobile/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(
        stravaRedirectUri
      )}&scope=activity:read_all,activity:write&approval_prompt=force`;

      const result = await WebBrowser.openAuthSessionAsync(authUrl, appDeepLink);
      if (result.type === 'success' && result.url) {
        let code: string | undefined;
        try {
          code = new URL(result.url).searchParams.get('code') || undefined;
        } catch (_) {
          const match = result.url.match(/[?&]code=([^&]+)/);
          if (match) code = match[1];
        }
        if (code) {
          await integrationsApi.exchangeStravaCode(code);
          await refreshUser();
          await refreshActivities();
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setStravaModalVisible(false);
        }
      }
    } catch (err: any) {
      console.error('Strava OAuth error:', err);
    } finally {
      setStravaLoading(false);
    }
  };

  const handleSaveStravaManualToken = async () => {
    if (!stravaRefreshToken.trim()) {
      return;
    }
    setStravaLoading(true);
    try {
      await integrationsApi.saveStravaRefreshToken(stravaRefreshToken.trim());
      await refreshUser();
      await refreshActivities();
      setStravaRefreshToken('');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setStravaModalVisible(false);
    } catch (err: any) {
      console.error('Strava token save error:', err);
    } finally {
      setStravaLoading(false);
    }
  };

  const handleDisconnectStrava = async () => {
    setStravaLoading(true);
    try {
      await integrationsApi.disconnectStrava();
      await refreshUser();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setStravaModalVisible(false);
    } catch (err: any) {
      console.error('Strava disconnect error:', err);
    } finally {
      setStravaLoading(false);
    }
  };

  const handleSyncStrava = async () => {
    setStravaLoading(true);
    try {
      await syncStrava();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      console.error('Strava sync error:', err);
    } finally {
      setStravaLoading(false);
    }
  };

  const renderSettingRow = (
    icon: keyof typeof Ionicons.glyphMap,
    title: string,
    value?: React.ReactNode,
    onPress?: () => void
  ) => (
    <TouchableOpacity
      disabled={!onPress}
      onPress={onPress}
      className="flex-row items-center py-4"
    >
      <Ionicons name={icon} size={22} color="#8E8E93" className="mr-4" />
      <Text className="text-theme-text text-base flex-1 ml-3">{title}</Text>
      {value}
    </TouchableOpacity>
  );

  return (
    <View className="flex-1 bg-theme-bg" style={{ paddingTop: insets.top }}>
      {/* Dashboard-style Top Header */}
      <View className="px-5 pt-3 pb-2 bg-theme-bg">
        <ScreenHeaderTitleRow title={t('profile.title') || 'Athlete Profile'} />

        {/* Dashboard-style Sub-tab Navigation Segmented Control */}
        <View className="relative flex-row bg-theme-card rounded-2xl p-1 overflow-hidden">
          {/* Smooth Real-time Animated Indicator Bubble */}
          <Animated.View
            className="absolute top-1 bottom-1 bg-theme-accent rounded-xl"
            style={{
              left: indicatorLeft,
              width: tabWidth,
            }}
          />

          {TABS.map((tab, i) => {
            const opacityWhite = scrollX.interpolate({
              inputRange: [(i - 1) * SCREEN_WIDTH, i * SCREEN_WIDTH, (i + 1) * SCREEN_WIDTH],
              outputRange: [0, 1, 0],
              extrapolate: 'clamp',
            });
            const opacityGrey = scrollX.interpolate({
              inputRange: [(i - 1) * SCREEN_WIDTH, i * SCREEN_WIDTH, (i + 1) * SCREEN_WIDTH],
              outputRange: [1, 0, 1],
              extrapolate: 'clamp',
            });

            const labelMap: Record<ProfileSubTab, string> = {
              profile: t('profile.tabProfile') || 'Profile',
              goals: t('profile.tabGoals') || 'Goals',
              connections: t('profile.tabConnections') || 'Connections',
              account: t('profile.tabAccount') || 'Account',
            };
            const label = labelMap[tab];

            return (
              <TouchableOpacity
                key={tab}
                onPress={() => handleTabSwitch(tab)}
                activeOpacity={0.8}
                className="flex-1 py-2.5 items-center justify-center z-10"
              >
                <View className="relative items-center justify-center">
                  <Animated.Text style={{ opacity: opacityWhite }} className="text-[11px] font-extrabold text-white absolute" numberOfLines={1}>
                    {label}
                  </Animated.Text>
                  <Animated.Text style={{ opacity: opacityGrey }} className="text-[11px] font-extrabold text-theme-muted" numberOfLines={1}>
                    {label}
                  </Animated.Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Swipeable View Pager / ScrollView Container */}
      <ScrollView
        ref={scrollViewRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false, listener: handleScroll }
        )}
        scrollEventThrottle={16}
        className="flex-1"
      >
        {/* PROFILE TAB PAGE */}
        <View style={{ width: SCREEN_WIDTH }} className="flex-1">
          <ScrollView
            className="flex-1 px-4 pt-4"
            contentContainerStyle={{ paddingBottom: tabBarOccupied + 20 }}
            showsVerticalScrollIndicator={false}
            onScrollBeginDrag={notifyScroll}
          >
            <ProfileTab
              username={username}
              email={email}
              isRookaPlus={isRookaPlus}
              renderSettingRow={renderSettingRow}
            />
          </ScrollView>
        </View>

        {/* GOALS TAB PAGE */}
        <View style={{ width: SCREEN_WIDTH }} className="flex-1">
          <ScrollView
            className="flex-1 px-4 pt-4"
            contentContainerStyle={{ paddingBottom: tabBarOccupied + 20 }}
            showsVerticalScrollIndicator={false}
            onScrollBeginDrag={notifyScroll}
          >
            <GoalsTab />
          </ScrollView>
        </View>

        {/* CONNECTIONS TAB PAGE */}
        <View style={{ width: SCREEN_WIDTH }} className="flex-1">
          <ScrollView
            className="flex-1 px-4 pt-4"
            contentContainerStyle={{ paddingBottom: tabBarOccupied + 20 }}
            showsVerticalScrollIndicator={false}
            onScrollBeginDrag={notifyScroll}
          >
            <ConnectionsTab
              onOpenGarminModal={() => setGarminModalVisible(true)}
              onOpenStravaModal={() => setStravaModalVisible(true)}
            />
          </ScrollView>
        </View>

        {/* ACCOUNT TAB PAGE */}
        <View style={{ width: SCREEN_WIDTH }} className="flex-1">
          <ScrollView
            className="flex-1 px-4 pt-4"
            contentContainerStyle={{ paddingBottom: tabBarOccupied + 20 }}
            showsVerticalScrollIndicator={false}
            onScrollBeginDrag={notifyScroll}
          >
            <AccountTab onLogout={logout} isRookaPlus={isRookaPlus} />
          </ScrollView>
        </View>
      </ScrollView>

      {/* GARMIN CONNECTION MODAL */}
      <BottomSheetModal
        visible={garminModalVisible}
        onClose={() => setGarminModalVisible(false)}
        contentClassName="bg-theme-bg p-6 rounded-t-3xl"
      >
        <View className="flex-row items-center justify-between mb-4">
          <View className="flex-row items-center">
            <Ionicons name="watch-outline" size={24} color="#FF5A1F" />
            <Text className="text-xl font-bold text-theme-text ml-2">Garmin Connect</Text>
          </View>
          <TouchableOpacity onPress={() => setGarminModalVisible(false)} className="p-1">
            <Ionicons name="close" size={24} color="#8E8E93" />
          </TouchableOpacity>
        </View>

        <Text className="text-sm text-theme-muted mb-6">
          Connect your Garmin account to automatically push structured micro-plan workouts directly to your Garmin watch.
        </Text>

        {isGarminConnected ? (
          <View className="space-y-4 mb-4">
            <View className="p-4 rounded-xl bg-green-500/10 flex-row items-center mb-2">
              <Ionicons name="checkmark-circle" size={22} color="#10B981" />
              <Text className="text-green-500 font-bold ml-2">Garmin is connected</Text>
            </View>

            <TouchableOpacity
              onPress={handleSyncGarmin}
              disabled={garminLoading}
              className="bg-theme-accent py-3.5 rounded-xl items-center flex-row justify-center mb-3"
            >
              {garminLoading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <Ionicons name="sync" size={18} color="#FFF" />
                  <Text className="text-white font-bold text-base ml-2">Sync Workouts to Garmin</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleDisconnectGarmin}
              disabled={garminLoading}
              className="bg-red-500/10 py-3.5 rounded-xl items-center"
            >
              <Text className="text-red-500 font-bold text-base">Disconnect Garmin</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View className="space-y-4 mb-4">
            <View>
              <Text className="text-xs font-bold text-theme-muted uppercase mb-1">Garmin Username / Email</Text>
              <TextInput
                className="bg-theme-card rounded-xl p-3.5 text-theme-text"
                placeholder="email@example.com"
                placeholderTextColor="#8E8E93"
                value={garminUser}
                onChangeText={setGarminUser}
                autoCapitalize="none"
                keyboardType="email-address"
              />
            </View>

            <View className="mt-3">
              <Text className="text-xs font-bold text-theme-muted uppercase mb-1">Garmin Password</Text>
              <TextInput
                className="bg-theme-card rounded-xl p-3.5 text-theme-text"
                placeholder="••••••••"
                placeholderTextColor="#8E8E93"
                value={garminPass}
                onChangeText={setGarminPass}
                secureTextEntry
              />
            </View>

            <TouchableOpacity
              onPress={handleConnectGarmin}
              disabled={garminLoading}
              className="bg-theme-accent py-4 rounded-xl items-center mt-4"
            >
              {garminLoading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text className="text-white font-bold text-base">Save & Connect Garmin</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </BottomSheetModal>

      {/* STRAVA CONNECTION MODAL */}
      <BottomSheetModal
        visible={stravaModalVisible}
        onClose={() => setStravaModalVisible(false)}
        contentClassName="bg-theme-bg p-6 rounded-t-3xl"
      >
        <View className="flex-row items-center justify-between mb-4">
          <View className="flex-row items-center">
            <Ionicons name="fitness-outline" size={24} color="#FC4C02" />
            <Text className="text-xl font-bold text-theme-text ml-2">Strava Integration</Text>
          </View>
          <TouchableOpacity onPress={() => setStravaModalVisible(false)} className="p-1">
            <Ionicons name="close" size={24} color="#8E8E93" />
          </TouchableOpacity>
        </View>

        <Text className="text-sm text-theme-muted mb-6">
          Connect Strava to automatically sync your completed runs, rides, and swims into Rooka to earn points and inform your AI coach.
        </Text>

        {isStravaConnected ? (
          <View className="space-y-4 mb-4">
            <View className="p-4 rounded-xl bg-orange-500/10 flex-row items-center mb-2">
              <Ionicons name="checkmark-circle" size={22} color="#FC4C02" />
              <Text className="text-orange-500 font-bold ml-2">Strava is connected</Text>
            </View>

            <TouchableOpacity
              onPress={handleSyncStrava}
              disabled={stravaLoading}
              className="bg-[#FC4C02] py-3.5 rounded-xl items-center flex-row justify-center mb-3"
            >
              {stravaLoading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <Ionicons name="sync" size={18} color="#FFF" />
                  <Text className="text-white font-bold text-base ml-2">Sync Activities Now</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleDisconnectStrava}
              disabled={stravaLoading}
              className="bg-red-500/10 py-3.5 rounded-xl items-center"
            >
              <Text className="text-red-500 font-bold text-base">Disconnect Strava</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View className="space-y-4 mb-4">
            <TouchableOpacity
              onPress={handleConnectStravaOAuth}
              disabled={stravaLoading}
              className="bg-[#FC4C02] py-4 rounded-xl items-center flex-row justify-center mb-3"
            >
              {stravaLoading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <Ionicons name="fitness-outline" size={20} color="#FFF" style={{ marginRight: 8 }} />
                  <Text className="text-white font-bold text-base">Connect with Strava</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setShowManualStrava(!showManualStrava)}
              className="py-2 items-center"
            >
              <Text className="text-theme-muted text-xs underline">
                {showManualStrava ? 'Hide manual refresh token input' : 'Enter Strava Refresh Token manually'}
              </Text>
            </TouchableOpacity>

            {showManualStrava && (
              <View className="mt-2 space-y-3">
                <Text className="text-xs font-bold text-theme-muted uppercase mb-1">Strava Refresh Token</Text>
                <TextInput
                  className="bg-theme-card rounded-xl p-3.5 text-theme-text"
                  placeholder="Paste refresh token..."
                  placeholderTextColor="#8E8E93"
                  value={stravaRefreshToken}
                  onChangeText={setStravaRefreshToken}
                  autoCapitalize="none"
                />
                <TouchableOpacity
                  onPress={handleSaveStravaManualToken}
                  disabled={stravaLoading}
                  className="bg-theme-card py-3 rounded-xl items-center mt-2"
                >
                  {stravaLoading ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <Text className="text-theme-text font-bold text-sm">Save Refresh Token</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      </BottomSheetModal>
    </View>
  );
}
