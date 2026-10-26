import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/use-theme';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import React, { useMemo, useRef, useState, useCallback } from 'react';
import { useLocalSearchParams, useFocusEffect } from 'expo-router';
import {
  Alert,
  Animated,
  InteractionManager,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { API_BASE_URL } from '../../constants/api';
import { useActivities } from '../../context/ActivityStore';
import { useLanguage } from '../../context/LanguageContext';
import { useTabBar } from '../../context/TabBarContext';
import { useTabBarInset } from '../../hooks/useTabBarInset';
import { useUser } from '../../context/UserStore';
import { integrationsApi } from '../../services/apiServices';

import { ConnectionsTab } from '../../components/profile/ConnectionsTab';
import { CoachTab } from '../../components/profile/CoachTab';
import { ProfileTab } from '../../components/profile/ProfileTab';
import { TrainingTab } from '../../components/profile/TrainingTab';
import { ScreenHeaderTitleRow } from '../../components/ui/ScreenHeaderTitleRow';
import { hasSubscriptionTier } from '../../utils/permissions';

WebBrowser.maybeCompleteAuthSession();

export type ProfileSubTab = 'profile' | 'training' | 'coach' | 'connections';
const TABS: ProfileSubTab[] = ['profile', 'training', 'coach', 'connections'];

export default function ProfileScreen() {
  const theme = useTheme();
  const { user, logout, refreshUser } = useUser();
  const { t } = useLanguage();
  const { syncStrava, syncGarmin, syncSuunto, refreshActivities } = useActivities();
  const { notifyScroll, notifyScrollEnd } = useTabBar();
  const tabBarInset = useTabBarInset();
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ subtab?: string }>();

  const scrollViewRef = useRef<ScrollView>(null);
  const scrollX = useRef(new Animated.Value(0)).current;

  const [activeTab, setActiveTab] = useState<ProfileSubTab>('profile');

  useFocusEffect(
    useCallback(() => {
      const rawSubtab = params.subtab;
      const targetSubtab = rawSubtab === 'goals' ? 'training' : rawSubtab;
      if (targetSubtab && TABS.includes(targetSubtab as ProfileSubTab)) {
        const targetTab = targetSubtab as ProfileSubTab;
        const index = TABS.indexOf(targetTab);
        if (index !== -1) {
          setActiveTab(targetTab);
          scrollX.setValue(index * SCREEN_WIDTH);
          const task = InteractionManager.runAfterInteractions(() => {
            scrollViewRef.current?.scrollTo({ x: index * SCREEN_WIDTH, animated: false });
          });
          const timer = setTimeout(() => {
            scrollViewRef.current?.scrollTo({ x: index * SCREEN_WIDTH, animated: false });
          }, 60);
          return () => {
            task.cancel();
            clearTimeout(timer);
          };
        }
      }
    }, [params.subtab, SCREEN_WIDTH])
  );

  // Garmin connection state
  const [garminLoading, setGarminLoading] = useState(false);

  // Strava State
  const [stravaLoading, setStravaLoading] = useState(false);
  const [suuntoLoading, setSuuntoLoading] = useState(false);
  const [trainerDayLoading, setTrainerDayLoading] = useState(false);

  const username = user?.username || t('misc.athlete');
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
  const handleDisconnectGarmin = async () => {
    Alert.alert(
      t('integrationMsgs.disconnectGarminTitle'),
      t('integrationMsgs.disconnectGarminBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('integrationMsgs.disconnect'),
          style: 'destructive',
          onPress: async () => {
            setGarminLoading(true);
            try {
              await integrationsApi.disconnectGarmin();
              await refreshUser();
              Alert.alert(t('integrationMsgs.disconnectedTitle'), t('integrationMsgs.garminDisconnected'));
            } catch (err: any) {
              Alert.alert(t('common.error'), err.message || t('integrationMsgs.garminDisconnectFailed'));
            } finally {
              setGarminLoading(false);
            }
          },
        },
      ]
    );
  };

  // Garmin's official connection: the server makes the PKCE pair and swaps the code at
  // /garminredirect, which deep-links back here with ?status=.
  const handleConnectGarminOAuth = async () => {
    setGarminLoading(true);
    try {
      const { url: authUrl } = await integrationsApi.getGarminConnectUrl();
      const result = await WebBrowser.openAuthSessionAsync(authUrl, Linking.createURL('garminredirect'));
      if (result.type === 'success' && result.url) {
        const status = Linking.parse(result.url).queryParams?.status;
        await refreshUser();
        if (status === 'connected') {
          Alert.alert(t('integrationMsgs.garminConnectedTitle'), t('integrationMsgs.garminConnectedOfficial'));
        } else {
          Alert.alert(
            t('integrationMsgs.garminErrorTitle'),
            status === 'denied' ? t('integrationMsgs.garminDenied') : t('integrationMsgs.garminOauthFailed')
          );
        }
      } else {
        // Closed the sheet: the connect may still have finished on the server.
        await refreshUser();
      }
    } catch (err: any) {
      Alert.alert(t('integrationMsgs.garminErrorTitle'), err.message || t('integrationMsgs.garminOauthFailed'));
    } finally {
      setGarminLoading(false);
    }
  };

  const handleSyncGarmin = async () => {
    setGarminLoading(true);
    try {
      await syncGarmin();
      Alert.alert(t('integrationMsgs.garminSyncTitle'), t('integrationMsgs.garminSyncDone'));
    } catch (err: any) {
      Alert.alert(t('integrationMsgs.syncErrorTitle'), err.message || t('integrationMsgs.garminSyncFailed'));
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
          const finishConnect = async (allowShared: boolean) => {
            const res = await integrationsApi.exchangeStravaCode(code!, allowShared);
            await refreshUser();
            await refreshActivities();
            Alert.alert(t('integrationMsgs.stravaConnectedTitle'), res.message || t('integrationMsgs.stravaConnected'));
          };

          try {
            await finishConnect(false);
          } catch (exchangeErr: any) {
            // The Strava account is already linked elsewhere. That is allowed —
            // this account gets its own copy of the activities — but confirm it
            // first, since it is usually a mistake.
            if (exchangeErr?.data?.code === 'STRAVA_ALREADY_LINKED') {
              Alert.alert(
                t('integrationMsgs.alreadyLinkedTitle'),
                t('integrationMsgs.alreadyLinkedBodyLong', { name: exchangeErr.data.linkedUsername }),
                [
                  { text: t('common.cancel'), style: 'cancel' },
                  {
                    text: t('integrationMsgs.connectAnyway'),
                    onPress: () => {
                      finishConnect(true).catch((retryErr: any) =>
                        Alert.alert(t('integrationMsgs.stravaErrorTitle'), retryErr?.message || t('integrationMsgs.stravaConnectFailed'))
                      );
                    },
                  },
                ]
              );
            } else {
              throw exchangeErr;
            }
          }
        } else {
          Alert.alert(t('integrationMsgs.stravaErrorTitle'), t('integrationMsgs.stravaNoCode'));
        }
      }
    } catch (err: any) {
      Alert.alert(t('integrationMsgs.stravaErrorTitle'), err.message || t('integrationMsgs.stravaOauthFailed'));
    } finally {
      setStravaLoading(false);
    }
  };

  const handleDisconnectStrava = async () => {
    Alert.alert(
      t('integrationMsgs.disconnectStravaTitle'),
      t('integrationMsgs.disconnectStravaBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('integrationMsgs.disconnect'),
          style: 'destructive',
          onPress: async () => {
            setStravaLoading(true);
            try {
              await integrationsApi.disconnectStrava();
              await refreshUser();
              Alert.alert(t('integrationMsgs.disconnectedTitle'), t('integrationMsgs.stravaDisconnected'));
            } catch (err: any) {
              Alert.alert(t('common.error'), err.message || t('integrationMsgs.stravaDisconnectFailed'));
            } finally {
              setStravaLoading(false);
            }
          },
        },
      ]
    );
  };

  // Suunto handlers (OAuth via in-app browser; authorize URL is built server-side)
  const handleConnectSuuntoOAuth = async () => {
    setSuuntoLoading(true);
    try {
      const { url: authUrl } = await integrationsApi.getSuuntoAuthUrl();
      const appDeepLink = Linking.createURL('suuntoredirect');

      const result = await WebBrowser.openAuthSessionAsync(authUrl, appDeepLink);
      if (result.type === 'success' && result.url) {
        let code: string | undefined;
        try {
          code = new URL(result.url).searchParams.get('code') || undefined;
        } catch (_) {
          const match = result.url.match(/[?&]code=([^&]+)/);
          if (match) code = decodeURIComponent(match[1]);
        }
        if (code) {
          const res = await integrationsApi.exchangeSuuntoCode(code);
          await refreshUser();
          // First import so the user sees their workouts straight away.
          await syncSuunto().catch(() => {});
          Alert.alert(t('integrationMsgs.suuntoConnectedTitle'), res.message || t('integrationMsgs.suuntoConnected'));
        } else {
          Alert.alert(t('integrationMsgs.suuntoErrorTitle'), t('integrationMsgs.suuntoNoCode'));
        }
      }
    } catch (err: any) {
      Alert.alert(t('integrationMsgs.suuntoErrorTitle'), err.message || t('integrationMsgs.suuntoOauthFailed'));
    } finally {
      setSuuntoLoading(false);
    }
  };

  const handleDisconnectSuunto = async () => {
    Alert.alert(
      t('integrationMsgs.disconnectSuuntoTitle'),
      t('integrationMsgs.disconnectSuuntoBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('integrationMsgs.disconnect'),
          style: 'destructive',
          onPress: async () => {
            setSuuntoLoading(true);
            try {
              await integrationsApi.disconnectSuunto();
              await refreshUser();
              Alert.alert(t('integrationMsgs.disconnectedTitle'), t('integrationMsgs.suuntoDisconnected'));
            } catch (err: any) {
              Alert.alert(t('common.error'), err.message || t('integrationMsgs.suuntoDisconnectFailed'));
            } finally {
              setSuuntoLoading(false);
            }
          },
        },
      ]
    );
  };

  // TrainerDay: the server exchanges the code at /trainerdayredirect and deep-links back with ?status=
  const handleConnectTrainerDay = async () => {
    setTrainerDayLoading(true);
    try {
      const { url: authUrl } = await integrationsApi.getTrainerDayConnectUrl();
      const result = await WebBrowser.openAuthSessionAsync(authUrl, Linking.createURL('trainerdayredirect'));
      if (result.type === 'success' && result.url) {
        const status = Linking.parse(result.url).queryParams?.status;
        await refreshUser();
        if (status === 'connected') {
          Alert.alert(t('integrationMsgs.trainerdayConnectedTitle'), t('integrationMsgs.trainerdayConnected'));
        } else if (status === 'connected_free') {
          Alert.alert(t('integrationMsgs.trainerdayConnectedTitle'), t('integrationMsgs.trainerdayConnectedFree'));
        } else {
          Alert.alert(
            t('integrationMsgs.trainerdayErrorTitle'),
            status === 'denied' ? t('integrationMsgs.trainerdayDenied') : t('integrationMsgs.trainerdayOauthFailed')
          );
        }
      } else {
        // Closed the sheet: the connect may still have finished on the server.
        await refreshUser();
      }
    } catch (err: any) {
      Alert.alert(t('integrationMsgs.trainerdayErrorTitle'), err.message || t('integrationMsgs.trainerdayOauthFailed'));
    } finally {
      setTrainerDayLoading(false);
    }
  };

  const handleDisconnectTrainerDay = async () => {
    Alert.alert(
      t('integrationMsgs.disconnectTrainerdayTitle'),
      t('integrationMsgs.disconnectTrainerdayBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('integrationMsgs.disconnect'),
          style: 'destructive',
          onPress: async () => {
            setTrainerDayLoading(true);
            try {
              await integrationsApi.disconnectTrainerDay();
              await refreshUser();
              Alert.alert(t('integrationMsgs.disconnectedTitle'), t('integrationMsgs.trainerdayDisconnected'));
            } catch (err: any) {
              Alert.alert(t('common.error'), err.message || t('integrationMsgs.trainerdayDisconnectFailed'));
            } finally {
              setTrainerDayLoading(false);
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
      Alert.alert(t('integrationMsgs.stravaSyncTitle'), t('integrationMsgs.stravaSyncDone'));
    } catch (err: any) {
      Alert.alert(t('integrationMsgs.syncErrorTitle'), err.message || t('integrationMsgs.stravaSyncFailed'));
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
      <Ionicons name={icon} size={22} color={theme.textSecondary} className="mr-4" />
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
          className="relative flex-row bg-theme-inset rounded-tile p-1 overflow-hidden"
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

            const labelMap: Record<ProfileSubTab, string> = {
              profile: t('profile.tabProfile') || 'Profile',
              training: t('profile.tabTraining') || 'Training',
              coach: t('profile.tabCoach') || 'Coach',
              connections: t('profile.tabConnections') || 'Connections',
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
                  className="text-xs font-extrabold text-center"
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
        bounces={false}
        overScrollMode="never"
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
            contentContainerStyle={{ paddingBottom: tabBarInset }}
            showsVerticalScrollIndicator={false}
            onScrollBeginDrag={notifyScroll}
            onScrollEndDrag={notifyScrollEnd}
            onMomentumScrollEnd={notifyScrollEnd}
          >
            <ProfileTab
              username={username}
              email={email}
              isRookaPlus={isRookaPlus}
              onLogout={() => logout()}
              renderSettingRow={renderSettingRow}
            />
          </ScrollView>
        </View>

        {/* TRAINING TAB PAGE */}
        <View style={{ width: SCREEN_WIDTH }} className="flex-1">
          <ScrollView
            className="flex-1 px-4 pt-4"
            contentContainerStyle={{ paddingBottom: tabBarInset }}
            showsVerticalScrollIndicator={false}
            onScrollBeginDrag={notifyScroll}
            onScrollEndDrag={notifyScrollEnd}
            onMomentumScrollEnd={notifyScrollEnd}
          >
            <TrainingTab />
          </ScrollView>
        </View>

        {/* COACH TAB PAGE */}
        <View style={{ width: SCREEN_WIDTH }} className="flex-1">
          <ScrollView
            className="flex-1 px-4 pt-4"
            contentContainerStyle={{ paddingBottom: tabBarInset }}
            showsVerticalScrollIndicator={false}
            onScrollBeginDrag={notifyScroll}
            onScrollEndDrag={notifyScrollEnd}
            onMomentumScrollEnd={notifyScrollEnd}
          >
            <CoachTab />
          </ScrollView>
        </View>

        {/* CONNECTIONS TAB PAGE */}
        <View style={{ width: SCREEN_WIDTH }} className="flex-1">
          <ScrollView
            className="flex-1 px-4 pt-4"
            contentContainerStyle={{ paddingBottom: tabBarInset }}
            showsVerticalScrollIndicator={false}
            onScrollBeginDrag={notifyScroll}
            onScrollEndDrag={notifyScrollEnd}
            onMomentumScrollEnd={notifyScrollEnd}
          >
            <ConnectionsTab
              onConnectGarmin={handleConnectGarminOAuth}
              onDisconnectGarmin={handleDisconnectGarmin}
              garminLoading={garminLoading}
              onConnectStrava={handleConnectStravaOAuth}
              onDisconnectStrava={handleDisconnectStrava}
              stravaLoading={stravaLoading}
              onConnectSuunto={handleConnectSuuntoOAuth}
              onDisconnectSuunto={handleDisconnectSuunto}
              suuntoLoading={suuntoLoading}
              onConnectTrainerDay={handleConnectTrainerDay}
              onDisconnectTrainerDay={handleDisconnectTrainerDay}
              trainerDayLoading={trainerDayLoading}
            />
          </ScrollView>
        </View>
      </ScrollView>

    </View>
  );
}
