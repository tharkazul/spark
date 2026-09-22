import { useTheme } from '@/hooks/use-theme';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useActivities } from '../../context/ActivityStore';
import { useUser } from '../../context/UserStore';
import { integrationsApi, StravaShareFlags } from '../../services/apiServices';
import { canHideRookaLink } from '../../utils/permissions';
import { Card } from '../ui/Card';

interface ConnectionsTabProps {
  onOpenGarminModal: () => void;
  onConnectStrava: () => void;
  onDisconnectStrava: () => void;
  stravaLoading?: boolean;
}

// rooka's sport buckets, matching STRAVA_SHARE_SPORTS on the server. Strava's
// own sport_type list is much longer; the server collapses it onto these four.
export type SportType = 'Run' | 'Bike' | 'Swim' | 'Strength';

const ALL_ON: StravaShareFlags = {
  shareName: true,
  shareScore: true,
  shareStructure: true,
  shareLink: true,
};

const DEFAULT_TOGGLES: Record<SportType, StravaShareFlags> = {
  Run: { ...ALL_ON },
  Bike: { ...ALL_ON },
  Swim: { ...ALL_ON },
  Strength: { ...ALL_ON },
};

const SPORT_OPTIONS: { id: SportType; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'Run', label: 'Run', icon: 'walk-outline' },
  { id: 'Bike', label: 'Cycle', icon: 'bicycle-outline' },
  { id: 'Swim', label: 'Swim', icon: 'water-outline' },
  { id: 'Strength', label: 'Strength', icon: 'barbell-outline' },
];

// `shareStructure` has no toggle: the planned steps go out whenever there is a
// plan. It rides along in the payload so saving never clears it.
const TOGGLE_ROWS: { key: keyof StravaShareFlags; title: string }[] = [
  {
    key: 'shareScore',
    title: 'Include rooka score',
  },
  {
    key: 'shareName',
    title: 'Post Workout Summary Title',
  },
  {
    key: 'shareLink',
    title: 'Show rooka.io',
  },
];

export const ConnectionsTab: React.FC<ConnectionsTabProps> = ({
  onOpenGarminModal,
  onConnectStrava,
  onDisconnectStrava,
  stravaLoading = false,
}) => {
  const theme = useTheme();
  const { user } = useUser();
  const { syncGarmin, syncStrava, refreshActivities } = useActivities();

  const isGarminConnected = !!user?.garmin_connected;
  const isStravaConnected = !!user?.strava_connected;

  const [garminSyncing, setGarminSyncing] = useState(false);
  const [stravaSyncing, setStravaSyncing] = useState(false);
  const [appleSyncing, setAppleSyncing] = useState(false);
  const [isAppleConnected, setIsAppleConnected] = useState(false);
  const [appleSupported, setAppleSupported] = useState(false);

  // Strava Automation Toggles per sport type
  const [selectedSport, setSelectedSport] = useState<SportType>('Run');
  const [sportToggles, setSportToggles] = useState<Record<SportType, StravaShareFlags>>(DEFAULT_TOGGLES);
  const [togglesLoading, setTogglesLoading] = useState(true);
  // The server is the authority here; this is the optimistic local view of it.
  const [linkIsOptional, setLinkIsOptional] = useState(canHideRookaLink(user?.subscription_tier));

  const [lastAppleSync, setLastAppleSync] = useState<string | null>(null);

  // iOS is the authority on whether rooka may schedule workouts & read health data
  useEffect(() => {
    let cancelled = false;
    const {
      isWorkoutKitSupported,
      getWorkoutKitAuthorizationStatus,
      getLastAppleHealthSyncTime,
    } = require('../../services/appleHealthService');

    setAppleSupported(isWorkoutKitSupported());
    getWorkoutKitAuthorizationStatus().then((status: string) => {
      if (!cancelled) setIsAppleConnected(status === 'authorized');
    });
    getLastAppleHealthSyncTime().then((time: string | null) => {
      if (!cancelled && time) setLastAppleSync(time);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleRefreshAppleStatus = async () => {
    try {
      setAppleSyncing(true);
      const {
        isWorkoutKitSupported,
        getWorkoutKitAuthorizationStatus,
        getLastAppleHealthSyncTime,
      } = require('../../services/appleHealthService');

      setAppleSupported(isWorkoutKitSupported());
      const status = await getWorkoutKitAuthorizationStatus();
      setIsAppleConnected(status === 'authorized');
      const time = await getLastAppleHealthSyncTime();
      if (time) setLastAppleSync(time);
    } catch (e) {
      console.warn('Failed to refresh Apple status:', e);
    } finally {
      setAppleSyncing(false);
    }
  };

  const handleConnectAppleHealth = async () => {
    try {
      const {
        requestFullHealthKitPermissions,
        requestWorkoutKitAuthorization,
        isWorkoutKitSupported,
      } = require('../../services/appleHealthService');

      if (Platform.OS !== 'ios') {
        Alert.alert('Not Supported', 'Apple Health integration is only available on iOS devices.');
        return;
      }

      // 1. Request Apple HealthKit read permissions for HR, HRV, Sleep, Steps, Calories, Workouts
      const healthKitGranted = await requestFullHealthKitPermissions();

      // 2. Request WorkoutKit scheduling permissions if on iOS 17+
      let workoutKitGranted = false;
      if (isWorkoutKitSupported()) {
        const wStatus = await requestWorkoutKitAuthorization();
        workoutKitGranted = wStatus === 'authorized';
      }

      const connected = healthKitGranted || workoutKitGranted;
      setIsAppleConnected(connected);

      if (connected) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert(
          'Apple Health Connected!',
          'Rooka is now authorized to sync your Heart Rate, HRV, Sleep, Steps, Calories, and Workouts.'
        );
      } else {
        Alert.alert(
          'Permissions Note',
          'Please ensure Health permissions are enabled in Settings > Health > Data Access & Devices > Rooka.'
        );
      }
    } catch (err: any) {
      console.error('Apple Health connect error:', err);
      Alert.alert('Error', err?.message || 'Failed to request Apple Health permissions.');
    }
  };

  const handleSyncAppleHealth = async () => {
    setAppleSyncing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const { syncAppleHealthData } = require('../../services/appleHealthService');
      const res = await syncAppleHealthData(7);

      if (res.success) {
        setLastAppleSync(res.lastSyncDate || new Date().toISOString());
        setIsAppleConnected(true);
        await refreshActivities();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert(
          'Apple Health Synced! 🎉',
          res.message || `Synced ${res.biometricsSynced || 0} daily biometric records and ${res.workoutsSynced || 0} workout(s) from Apple Health (including Garmin).`
        );
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert('Sync Incomplete', res.message);
      }
    } catch (err: any) {
      console.error('Apple Health sync error:', err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Sync Error', err?.message || 'Failed to sync with Apple Health.');
    } finally {
      setAppleSyncing(false);
    }
  };

  // These used to live in AsyncStorage only, under different names, so nothing
  // the athlete set here ever reached the captions the server writes.
  useEffect(() => {
    let cancelled = false;
    integrationsApi
      .getStravaShareSettings()
      .then((res) => {
        if (cancelled) return;
        setSportToggles((prev) => {
          const next = { ...prev };
          for (const sport of SPORT_OPTIONS) {
            const fromServer = res.shareSettings?.[sport.id];
            if (fromServer) next[sport.id] = { ...ALL_ON, ...fromServer };
          }
          return next;
        });
        setLinkIsOptional(!!res.linkIsOptional);
      })
      .catch((err) => {
        console.log('Strava share settings load failed:', err?.message || err);
      })
      .finally(() => {
        if (!cancelled) setTogglesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleToggleChange = (toggleKey: keyof StravaShareFlags, value: boolean) => {
    if (toggleKey === 'shareLink' && !linkIsOptional) return;

    const previous = sportToggles;
    const updated = {
      ...previous,
      [selectedSport]: { ...previous[selectedSport], [toggleKey]: value },
    };
    setSportToggles(updated);
    Haptics.selectionAsync();

    integrationsApi.saveStravaShareSettings(updated).catch((err) => {
      // Put the switch back rather than leaving the UI claiming a setting the
      // server never accepted.
      console.log('Strava share settings save failed:', err?.message || err);
      setSportToggles(previous);
      Alert.alert('Could not save', 'Your Strava caption settings were not updated. Please try again.');
    });
  };

  const handleSyncGarmin = async () => {
    setGarminSyncing(true);
    try {
      await syncGarmin();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      console.error('Garmin sync error:', err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Garmin Sync Failed', err?.message || 'Could not sync with Garmin. Please try again later.');
    } finally {
      setGarminSyncing(false);
    }
  };

  const handleSyncStrava = async () => {
    setStravaSyncing(true);
    try {
      await syncStrava();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      console.error('Strava sync error:', err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Strava Sync Failed', err?.message || 'Could not sync with Strava. Please try again later.');
    } finally {
      setStravaSyncing(false);
    }
  };

  const currentToggles = sportToggles[selectedSport] || DEFAULT_TOGGLES[selectedSport];

  return (
    <View className="gap-y-4">
      {/* APPLE HEALTH & WORKOUTKIT INTEGRATION */}
      <Card className="p-4">
        <View className="flex-row justify-between items-center pb-3 mb-3 border-b border-theme-border">
          <View className="flex-row items-center gap-2">
            <Ionicons name="logo-apple" size={20} color="#FF2D55" />
            <Text className="text-theme-text font-bold text-sm">Apple Health & Watch</Text>
          </View>
          <View
            className={`px-2 py-0.5 rounded ${isAppleConnected
              ? 'bg-semantic-success/10'
              : 'bg-semantic-error/10'
              }`}
          >
            <Text
              className={`text-xs font-bold ${isAppleConnected ? 'text-semantic-success' : 'text-semantic-error'
                }`}
            >
              {isAppleConnected ? 'Active' : appleSupported ? 'Disconnected' : 'Unavailable'}
            </Text>
          </View>
        </View>

        <Text className="text-theme-muted text-xs mb-3 leading-4">
          Sync workouts, heart rate, sleep stages, HRV, and daily biometrics from Apple Health (including Garmin & Apple Watch).
        </Text>

        {/* Feature Badges */}
        <View className="flex-row flex-wrap gap-1.5 mb-3">
          {['Heart Rate', 'Sleep Stages', 'HRV (SDNN)', 'Steps & Calories', 'Workouts', 'VO2 Max'].map((metric) => (
            <View key={metric} className="bg-theme-bg border border-theme-border px-2 py-1 rounded-md">
              <Text className="text-[10px] font-bold text-theme-muted">{metric}</Text>
            </View>
          ))}
        </View>

        {lastAppleSync && (
          <View className="flex-row items-center gap-1.5 mb-3">
            <Ionicons name="time-outline" size={12} color={theme.textSecondary} />
            <Text className="text-[11px] text-theme-muted">
              Last synced: {new Date(lastAppleSync).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
            </Text>
          </View>
        )}

        <View className="flex-row flex-wrap gap-2">
          <TouchableOpacity
            onPress={handleConnectAppleHealth}
            className="bg-semantic-error px-4 py-2.5 rounded-xl flex-row items-center justify-center shadow-sm"
          >
            <Ionicons name="shield-checkmark-outline" size={16} color="#FFF" />
            <Text className="text-white font-bold text-xs ml-2">
              Connect
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleSyncAppleHealth}
            disabled={appleSyncing}
            className="bg-theme-bg border border-theme-border px-4 py-2.5 rounded-xl flex-row items-center justify-center"
          >
            {appleSyncing ? (
              <ActivityIndicator size="small" color="#FF2D55" />
            ) : (
              <>
                <Ionicons name="sync-outline" size={16} color={theme.textSecondary} />
                <Text className="text-theme-text font-bold text-xs ml-2">Sync Health</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </Card>

      {/* GARMIN CONNECT INTEGRATION */}
      <Card className="p-4">
        <View className="flex-row justify-between items-center pb-3 mb-3">
          <View className="flex-row items-center gap-2">
            <Ionicons name="watch-outline" size={20} color={theme.tint} />
            <Text className="text-theme-text font-bold text-sm">Garmin Connect Integration</Text>
          </View>
          <View
            className={`px-2 py-0.5 rounded ${isGarminConnected
              ? 'bg-semantic-success/10'
              : 'bg-semantic-error/10'
              }`}
          >
            <Text
              className={`text-xs font-bold ${isGarminConnected ? 'text-semantic-success' : 'text-semantic-error'
                }`}
            >
              {isGarminConnected ? 'Connected' : 'Disconnected'}
            </Text>
          </View>
        </View>



        <View className="flex-row flex-wrap gap-2">
          <TouchableOpacity
            onPress={onOpenGarminModal}
            className="bg-semantic-info px-4 py-2.5 rounded-xl flex-row items-center justify-center shadow-sm"
          >
            <Ionicons name="settings-outline" size={16} color="#FFF" />
            <Text className="text-white font-bold text-xs ml-2">
              {isGarminConnected ? 'Manage Garmin' : 'Connect Garmin'}
            </Text>
          </TouchableOpacity>

          {isGarminConnected && (
            <TouchableOpacity
              onPress={handleSyncGarmin}
              disabled={garminSyncing}
              className="bg-theme-bg px-4 py-2.5 rounded-xl flex-row items-center justify-center"
            >
              {garminSyncing ? (
                <ActivityIndicator size="small" color={theme.tint} />
              ) : (
                <>
                  <Ionicons name="sync-outline" size={16} color={theme.textSecondary} />
                  <Text className="text-theme-text font-bold text-xs ml-2">Sync Workouts</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>
      </Card>

      {/* STRAVA INTEGRATION */}
      <Card className="p-4">
        <View className="flex-row justify-between items-center pb-3 mb-3">
          <View className="flex-row items-center gap-2">
            <Ionicons name="fitness-outline" size={20} color={theme.tint} />
            <Text className="text-theme-text font-bold text-sm">Strava Integration</Text>
          </View>
          <View
            className={`px-2 py-0.5 rounded ${isStravaConnected
              ? 'bg-semantic-success/10'
              : 'bg-semantic-error/10'
              }`}
          >
            <Text
              className={`text-xs font-bold ${isStravaConnected ? 'text-semantic-success' : 'text-semantic-error'
                }`}
            >
              {isStravaConnected ? 'Connected' : 'Disconnected'}
            </Text>
          </View>
        </View>



        <View className="flex-row flex-wrap gap-2">
          {!isStravaConnected ? (
            <TouchableOpacity
              onPress={onConnectStrava}
              disabled={stravaLoading}
              className="bg-theme-accent px-4 py-2.5 rounded-xl flex-row items-center justify-center shadow-sm"
            >
              {stravaLoading ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <>
                  <Ionicons name="fitness-outline" size={16} color="#FFF" />
                  <Text className="text-white font-bold text-xs ml-2">Connect with Strava</Text>
                </>
              )}
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity
                onPress={handleSyncStrava}
                disabled={stravaSyncing}
                className="bg-theme-accent px-4 py-2.5 rounded-xl flex-row items-center justify-center shadow-sm"
              >
                {stravaSyncing ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <>
                    <Ionicons name="sync-outline" size={16} color="#FFF" />
                    <Text className="text-white font-bold text-xs ml-2">Sync Activities</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={onDisconnectStrava}
                disabled={stravaLoading}
                className="bg-semantic-error/10 border border-semantic-error/30 px-4 py-2.5 rounded-xl flex-row items-center justify-center"
              >
                <Text className="text-semantic-error font-bold text-xs">Disconnect</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </Card>

      {/* STRAVA AUTOMATIONS PER SPORT TYPE */}
      <Card className="p-4">
        <View className="flex-row items-center gap-2 pb-3 mb-3 border-b border-theme-border">
          <View className="w-2.5 h-2.5 rounded-full bg-theme-accent" />
          <Text className="text-theme-text font-bold text-sm">Strava Automations</Text>
        </View>



        {/* SPORT SELECTOR TABS */}
        <View className="flex-row bg-theme-bg p-1 rounded-xl mb-4 border border-theme-border">
          {SPORT_OPTIONS.map((sport) => {
            const isSelected = selectedSport === sport.id;
            return (
              <TouchableOpacity
                key={sport.id}
                onPress={() => setSelectedSport(sport.id)}
                className={`flex-1 flex-row items-center justify-center py-2 rounded-lg gap-1 ${isSelected ? 'bg-theme-accent' : 'bg-transparent'
                  }`}
              >
                <Ionicons
                  name={sport.icon}
                  size={14}
                  color={isSelected ? '#FFFFFF' : '#8E8E93'}
                />
                <Text
                  className={`text-xs font-bold ${isSelected ? 'text-white' : 'text-theme-muted'
                    }`}
                >
                  {sport.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* TOGGLES FOR SELECTED SPORT */}
        {togglesLoading ? (
          <View className="py-6 items-center">
            <ActivityIndicator size="small" color={theme.tint} />
          </View>
        ) : (
          <View className="gap-y-3">
            {TOGGLE_ROWS.map((row, index) => {
              const isLocked = row.key === 'shareLink' && !linkIsOptional;
              const isLast = index === TOGGLE_ROWS.length - 1;
              return (
                <View
                  key={row.key}
                  className={`flex-row items-center justify-between py-2 ${isLast ? '' : 'border-b border-theme-border'
                    }`}
                >
                  <View className="flex-1 pr-3">
                    <View className="flex-row items-center gap-1">
                      <Text className="text-theme-text font-bold text-xs">{row.title}</Text>
                      {isLocked && (
                        <View className="px-1.5 py-0.5 rounded bg-theme-accent/10">
                          <Text className="text-theme-accent text-[10px] font-bold font-rajdhani">rooka+</Text>
                        </View>
                      )}
                    </View>
                    {isLocked && (
                      <Text className="text-theme-muted text-xs font-rajdhani">
                        Upgrade to rooka+ to remove the credit
                      </Text>
                    )}
                  </View>
                  <Switch
                    value={currentToggles[row.key]}
                    disabled={isLocked}
                    onValueChange={(val) => handleToggleChange(row.key, val)}
                    trackColor={{ false: '#DDE3E9', true: theme.tint }}
                  />
                </View>
              );
            })}
          </View>
        )}
      </Card>
    </View>
  );
};
