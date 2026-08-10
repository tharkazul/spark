import React, { useState, useRef } from 'react';
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
  Animated,
  useWindowDimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';

import { useUser } from '../../context/UserStore';
import { useActivities } from '../../context/ActivityStore';
import { useTabBar } from '../../context/TabBarContext';
import { useLanguage } from '../../context/LanguageContext';
import { integrationsApi } from '../../services/apiServices';

import { isAdmin } from '../../utils/permissions';

import { ProfileTab } from '../../components/profile/ProfileTab';
import { GoalsTab } from '../../components/profile/GoalsTab';
import { ConnectionsTab } from '../../components/profile/ConnectionsTab';
import { AccountTab } from '../../components/profile/AccountTab';
import { AdminTab } from '../../components/profile/AdminTab'; // I will create this

WebBrowser.maybeCompleteAuthSession();

export type ProfileSubTab = 'profile' | 'goals' | 'connections' | 'account' | 'admin';

export default function ProfileScreen() {
  const { user, logout, refreshUser } = useUser();
  const { t } = useLanguage();
  const { syncStrava, syncGarmin, refreshActivities } = useActivities();
  const { notifyScroll } = useTabBar();
  const { width: SCREEN_WIDTH } = useWindowDimensions();

  const userIsAdmin = isAdmin(user?.subscription_tier);
  const TABS: ProfileSubTab[] = userIsAdmin 
    ? ['profile', 'goals', 'connections', 'account', 'admin'] 
    : ['profile', 'goals', 'connections', 'account'];

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
  const isSparkPlus = user?.subscription_tier === 'spark_plus';

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
    inputRange: TABS.map((_, i) => Math.max(1, SCREEN_WIDTH * i)),
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

  // Strava handlers
  const handleConnectStravaOAuth = async () => {
    setStravaLoading(true);
    try {
      const clientId = '208765';
      const redirectUri = 'http://localhost:8081';
      const authUrl = `https://www.strava.com/oauth/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(
        redirectUri
      )}&scope=activity:read_all,activity:write&approval_prompt=force`;

      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);
      if (result.type === 'success' && result.url) {
        const parsed = Linking.parse(result.url);
        const code = (parsed.queryParams?.code as string) || (new URL(result.url).searchParams.get('code') as string);
        if (code) {
          const res = await integrationsApi.exchangeStravaCode(code);
          await refreshUser();
          await refreshActivities();
          Alert.alert('Strava Connected', res.message || 'Strava connected successfully!');
          setStravaModalVisible(false);
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

  const handleConnectDefaultStravaToken = async () => {
    setStravaLoading(true);
    try {
      const defaultToken = '760f27089e849721cf66a5a6557a6c66bca3597e';
      const res = await integrationsApi.saveStravaRefreshToken(defaultToken);
      await refreshUser();
      await refreshActivities();
      Alert.alert('Strava Connected', res.message || 'Strava token saved successfully!');
      setStravaModalVisible(false);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save Strava token.');
    } finally {
      setStravaLoading(false);
    }
  };

  const handleSaveStravaManualToken = async () => {
    if (!stravaRefreshToken.trim()) {
      Alert.alert('Error', 'Please enter a valid Strava refresh token.');
      return;
    }
    setStravaLoading(true);
    try {
      const res = await integrationsApi.saveStravaRefreshToken(stravaRefreshToken.trim());
      await refreshUser();
      await refreshActivities();
      setStravaRefreshToken('');
      Alert.alert('Strava Connected', res.message || 'Strava token saved successfully!');
      setStravaModalVisible(false);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save Strava token.');
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
              setStravaModalVisible(false);
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
      className="flex-row items-center py-4"
    >
      <Ionicons name={icon} size={22} color="#8E8E93" className="mr-4" />
      <Text className="text-theme-text text-base flex-1 ml-3">{title}</Text>
      {value}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView className="flex-1 bg-theme-bg" edges={['top']}>
      {/* Dashboard-style Top Header */}
      <View className="px-5 pt-3 pb-2 bg-theme-bg">
        <View className="flex-row justify-between items-center mb-3">
          <View>
            <Text className="text-2xl font-extrabold text-theme-text tracking-tight">
              {t('profile.title') || 'Athlete Profile'}
            </Text>
          </View>
          <View className="flex-row items-center gap-1.5 bg-theme-card px-3 py-1.5 rounded-full">
            <Ionicons name="calendar-outline" size={13} color="#16ACBD" />
            <Text className="text-xs font-bold font-mono text-theme-muted">{headerDateLabel}</Text>
          </View>
        </View>

        {/* Dashboard-style Sub-tab Navigation Segmented Control */}
        <View className="relative flex-row bg-theme-card rounded-2xl p-1 overflow-hidden">
          {/* Smooth Real-time Animated Indicator Bubble */}
          <Animated.View
            className="absolute top-1 bottom-1 bg-theme-accent-soft rounded-xl"
            style={{
              left: indicatorLeft,
              width: tabWidth,
            }}
          />

          <TouchableOpacity
            onPress={() => handleTabSwitch('profile')}
            activeOpacity={0.8}
            className="flex-1 py-2.5 items-center justify-center z-10"
          >
            <Text
              className={`text-[11px] font-extrabold ${
                activeTab === 'profile' ? 'text-theme-accent' : 'text-theme-muted'
              }`}
            >
              {t('profile.tabProfile') || 'Profile'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => handleTabSwitch('goals')}
            activeOpacity={0.8}
            className="flex-1 py-2.5 items-center justify-center z-10"
          >
            <Text
              className={`text-[11px] font-extrabold ${
                activeTab === 'goals' ? 'text-theme-accent' : 'text-theme-muted'
              }`}
            >
              {t('profile.tabGoals') || 'Goals'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => handleTabSwitch('connections')}
            activeOpacity={0.8}
            className="flex-1 py-2.5 items-center justify-center z-10"
          >
            <Text
              className={`text-[11px] font-extrabold ${
                activeTab === 'connections' ? 'text-theme-accent' : 'text-theme-muted'
              }`}
            >
              {t('profile.tabConnections') || 'Connections'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => handleTabSwitch('account')}
            activeOpacity={0.8}
            className="flex-1 py-2.5 items-center justify-center z-10"
          >
            <Text
              className={`text-[11px] font-extrabold ${
                activeTab === 'account' ? 'text-theme-accent' : 'text-theme-muted'
              }`}
            >
              {t('profile.tabAccount') || 'Account'}
            </Text>
          </TouchableOpacity>
          {userIsAdmin && (
            <TouchableOpacity
              onPress={() => handleTabSwitch('admin')}
              activeOpacity={0.8}
              className="flex-1 py-2.5 items-center justify-center z-10"
            >
              <Text
                className={`text-[11px] font-extrabold ${
                  activeTab === 'admin' ? 'text-theme-accent' : 'text-theme-muted'
                }`}
              >
                Admin
              </Text>
            </TouchableOpacity>
          )}
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
            contentContainerStyle={{ paddingBottom: 110 }}
            showsVerticalScrollIndicator={false}
            onScrollBeginDrag={notifyScroll}
          >
            <ProfileTab
              username={username}
              email={email}
              isSparkPlus={isSparkPlus}
              renderSettingRow={renderSettingRow}
            />
          </ScrollView>
        </View>

        {/* GOALS TAB PAGE */}
        <View style={{ width: SCREEN_WIDTH }} className="flex-1">
          <ScrollView
            className="flex-1 px-4 pt-4"
            contentContainerStyle={{ paddingBottom: 110 }}
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
            contentContainerStyle={{ paddingBottom: 110 }}
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
            contentContainerStyle={{ paddingBottom: 110 }}
            showsVerticalScrollIndicator={false}
            onScrollBeginDrag={notifyScroll}
          >
            <AccountTab onLogout={logout} isSparkPlus={isSparkPlus} />
          </ScrollView>
        </View>

        {/* ADMIN TAB PAGE */}
        {userIsAdmin && (
          <View style={{ width: SCREEN_WIDTH }} className="flex-1">
            <ScrollView
              className="flex-1 px-4 pt-4"
              contentContainerStyle={{ paddingBottom: 110 }}
              showsVerticalScrollIndicator={false}
              onScrollBeginDrag={notifyScroll}
            >
              <AdminTab />
            </ScrollView>
          </View>
        )}
      </ScrollView>

      {/* GARMIN CONNECTION MODAL */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={garminModalVisible}
        onRequestClose={() => setGarminModalVisible(false)}
      >
        <View className="flex-1 justify-end bg-black/50">
          <View className="bg-theme-bg p-6 rounded-t-3xl">
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
          </View>
        </View>
      </Modal>

      {/* STRAVA CONNECTION MODAL */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={stravaModalVisible}
        onRequestClose={() => setStravaModalVisible(false)}
      >
        <View className="flex-1 justify-end bg-black/50">
          <View className="bg-theme-bg p-6 rounded-t-3xl">
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
              Connect Strava to automatically sync your completed runs, rides, and swims into Spark to earn points and inform your AI coach.
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
                  className="bg-[#FC4C02] py-4 rounded-xl items-center flex-row justify-center mb-2"
                >
                  {stravaLoading ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <>
                      <Ionicons name="fitness-outline" size={20} color="#FFF" style={{ marginRight: 8 }} />
                      <Text className="text-white font-bold text-base">Connect with Strava (OAuth)</Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleConnectDefaultStravaToken}
                  disabled={stravaLoading}
                  className="bg-theme-card py-3 rounded-xl items-center flex-row justify-center mb-3"
                >
                  <Ionicons name="key-outline" size={18} color="#FF5A1F" style={{ marginRight: 6 }} />
                  <Text className="text-theme-accent font-bold text-sm">Quick Connect (Saved Token)</Text>
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
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
