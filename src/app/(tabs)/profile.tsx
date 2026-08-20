import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import React, { useMemo, useRef, useState } from 'react';
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
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
const TABS: ProfileSubTab[] = ['profile', 'goals', 'connections', 'account'];

export default function ProfileScreen() {
  const { user, logout, refreshUser } = useUser();
  const { t } = useLanguage();
  const { syncStrava, syncGarmin, refreshActivities } = useActivities();
  const { notifyScroll, tabBarOccupied } = useTabBar();
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const scrollViewRef = useRef<ScrollView>(null);
  const scrollX = useRef(new Animated.Value(0)).current;

  const [activeTab, setActiveTab] = useState<ProfileSubTab>('profile');

  // Garmin Form State
  const [garminModalVisible, setGarminModalVisible] = useState(false);
  const [garminUser, setGarminUser] = useState('');
  const [garminPass, setGarminPass] = useState('');
  const [garminLoading, setGarminLoading] = useState(false);

  // Strava State
  const [stravaLoading, setStravaLoading] = useState(false);

  const username = user?.username || 'Athlete';
  const email = user?.email;
  const isRookaPlus = hasSubscriptionTier(user?.subscription_tier);

  const isGarminConnected = !!user?.garmin_connected;
  const isStravaConnected = !!user?.strava_connected;

  // Real-time measured width of the sub-tab container for 100% pixel-perfect centering
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
      Alert.alert('Error', 'Please enter both your Garmin username and password.');
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
      Alert.alert('Garmin Connected', res.message || 'Garmin credentials saved successfully!');
      setGarminModalVisible(false);
    } catch (err: any) {
      Alert.alert('Garmin Error', err.message || 'Failed to save Garmin credentials.');
    } finally {
      setGarminLoading(false);
    }
  };

  const handleDisconnectGarmin = async () => {
    Alert.alert(
      'Disconnect Garmin',
      'Are you sure you want to disconnect Garmin? This will stop Spark from pushing structured workouts to your watch.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            setGarminLoading(true);
            try {
              await integrationsApi.disconnectGarmin();
              await refreshUser();
              Alert.alert('Disconnected', 'Garmin disconnected successfully.');
              setGarminModalVisible(false);
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to disconnect Garmin.');
            } finally {
              setGarminLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleSyncGarmin = async () => {
    setGarminLoading(true);
    try {
      await syncGarmin();
      Alert.alert('Garmin Sync', 'Garmin sync completed successfully!');
    } catch (err: any) {
      Alert.alert('Sync Error', err.message || 'Garmin sync failed.');
    } finally {
      setGarminLoading(false);
    }
  };

  // Strava handlers (Direct OAuth flow without modal)
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
          const res = await integrationsApi.exchangeStravaCode(code);
          await refreshUser();
          await refreshActivities();
          Alert.alert('Strava Connected', res.message || 'Strava connected successfully!');
        } else {
          Alert.alert('Strava Error', 'No authorization code returned from Strava.');
        }
      }
    } catch (err: any) {
      Alert.alert('Strava Error', err.message || 'Failed to complete Strava OAuth.');
    } finally {
      setStravaLoading(false);
    }
  };

  const handleDisconnectStrava = async () => {
    Alert.alert(
      'Disconnect Strava',
      'Are you sure you want to disconnect Strava?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            setStravaLoading(true);
            try {
              await integrationsApi.disconnectStrava();
              await refreshUser();
              Alert.alert('Disconnected', 'Strava disconnected successfully.');
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to disconnect Strava.');
            } finally {
              setStravaLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleSyncStrava = async () => {
    setStravaLoading(true);
    try {
      await syncStrava();
      Alert.alert('Strava Sync', 'Strava activities synced successfully!');
    } catch (err: any) {
      Alert.alert('Sync Error', err.message || 'Strava sync failed.');
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
      className="flex-row items-center py-4 border-b border-theme-border"
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
        <View
          onLayout={(e) => {
            const w = e.nativeEvent.layout.width;
            if (w > 0 && w !== segmentedWidth) {
              setSegmentedWidth(w);
            }
          }}
          className="relative flex-row bg-theme-card rounded-2xl p-1 overflow-hidden"
        >
          {/* Smooth Real-time Animated Indicator Bubble */}
          <Animated.View
            className="absolute top-1 bottom-1 bg-theme-accent rounded-xl"
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
                <Animated.Text
                  style={{ color: textColor }}
                  className="text-[11px] font-extrabold text-center"
                  numberOfLines={1}
                >
                  {label}
                </Animated.Text>
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
              onConnectStrava={handleConnectStravaOAuth}
              onDisconnectStrava={handleDisconnectStrava}
              stravaLoading={stravaLoading}
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
      <Modal
        animationType="slide"
        transparent={true}
        visible={garminModalVisible}
        onRequestClose={() => setGarminModalVisible(false)}
      >
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
          className="flex-1 justify-end bg-black/50"
        >
          <View className="bg-theme-bg px-6 pt-3 pb-6 rounded-t-3xl border-t border-theme-border">
            {/* TOP PULL HANDLE INDICATOR */}
            <View className="items-center pb-4">
              <View className="w-11 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full" />
            </View>

            <View className="flex-row items-center justify-between mb-4">
              <View className="flex-row items-center">
                <Ionicons name="watch-outline" size={24} color="#FF5A1F" />
                <Text className="text-xl font-bold text-theme-text ml-2">Garmin Connect</Text>
              </View>
            </View>

            <Text className="text-sm text-theme-muted mb-6">
              Connect your Garmin account to automatically push structured micro-plan workouts directly to your Garmin watch.
            </Text>

            {isGarminConnected ? (
              <View className="space-y-4 mb-4">
                <View className="p-4 rounded-xl bg-green-500/10 border border-green-500/30 flex-row items-center mb-2">
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
                  className="border border-red-500/40 bg-red-500/10 py-3.5 rounded-xl items-center"
                >
                  <Text className="text-red-500 font-bold text-base">Disconnect Garmin</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View className="space-y-4 mb-4">
                <View>
                  <Text className="text-xs font-bold text-theme-muted uppercase mb-1">Garmin Username / Email</Text>
                  <TextInput
                    className="bg-theme-card border border-theme-border rounded-xl p-3.5 text-theme-text"
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
                    className="bg-theme-card border border-theme-border rounded-xl p-3.5 text-theme-text"
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
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
