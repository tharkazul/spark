import { useTheme } from '@/hooks/use-theme';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useActivities } from '../../context/ActivityStore';
import { useUser } from '../../context/UserStore';
import { useLanguage } from '../../context/LanguageContext';
import { integrationsApi, StravaShareFlags } from '../../services/apiServices';
import { canHideRookaLink } from '../../utils/permissions';
import { Card } from '../ui/Card';
import { SportMedallion } from '../ui/SportMedallion';

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

const SPORT_OPTIONS: { id: SportType; label: string }[] = [
  { id: 'Run', label: 'Run' },
  { id: 'Bike', label: 'Cycle' },
  { id: 'Swim', label: 'Swim' },
  { id: 'Strength', label: 'Strength' },
];

// `shareStructure` has no toggle: the planned steps go out whenever there is a
// plan. It rides along in the payload so saving never clears it.
const TOGGLE_ROWS: { key: keyof StravaShareFlags }[] = [
  { key: 'shareScore' },
  { key: 'shareName' },
  { key: 'shareLink' },
];

export const ConnectionsTab: React.FC<ConnectionsTabProps> = ({
  onOpenGarminModal,
  onConnectStrava,
  onDisconnectStrava,
  stravaLoading = false,
}) => {
  const theme = useTheme();
  const { user } = useUser();
  const { t, language } = useLanguage();
  const { syncGarmin, syncStrava, refreshActivities } = useActivities();

  const getSportOptionLabel = (id: SportType) => {
    if (id === 'Run') return t('sports.run');
    if (id === 'Bike') return t('sports.bike');
    if (id === 'Swim') return t('sports.swim');
    if (id === 'Strength') return t('sports.strength');
    return id;
  };

  const getToggleRowTitle = (key: keyof StravaShareFlags) => {
    if (key === 'shareScore') return t('connections.includeRookaScore');
    if (key === 'shareName') return t('connections.postWorkoutSummary');
    if (key === 'shareLink') return t('connections.showRookaLink');
    return '';
  };

  const isGarminConnected = !!user?.garmin_connected;
  const isStravaConnected = !!user?.strava_connected;

  const [garminSyncing, setGarminSyncing] = useState(false);
  const [stravaSyncing, setStravaSyncing] = useState(false);
  const [appleSyncing, setAppleSyncing] = useState(false);
  const [isHealthKitConnected, setIsHealthKitConnected] = useState(false);
  const [isWatchConnected, setIsWatchConnected] = useState(false);
  const [appleSupported, setAppleSupported] = useState(false);
  const [showHealthPrefs, setShowHealthPrefs] = useState(false);
  const [showAppleManage, setShowAppleManage] = useState(false);
  const [showStravaManage, setShowStravaManage] = useState(false);
  const [healthPrefs, setHealthPrefs] = useState<any>({
    syncSleep: true,
    syncHeartRate: true,
    syncHrv: true,
    syncStepsCalories: true,
    syncBodyMass: true,
    syncVo2Max: true,
    syncWorkouts: true,
  });

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
      getAppleHealthPreferences,
      isHealthKitAvailable,
    } = require('../../services/appleHealthService');

    setAppleSupported(isWorkoutKitSupported() || isHealthKitAvailable());
    getWorkoutKitAuthorizationStatus().then((status: string) => {
      if (!cancelled) setIsWatchConnected(status === 'authorized');
    });
    getLastAppleHealthSyncTime().then((time: string | null) => {
      if (!cancelled && time) {
        setLastAppleSync(time);
        setIsHealthKitConnected(true);
      }
    });
    getAppleHealthPreferences().then((prefs: any) => {
      if (!cancelled && prefs) setHealthPrefs(prefs);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleConnectAppleHealth = async () => {
    try {
      const {
        requestFullHealthKitPermissions,
        isHealthKitAvailable,
      } = require('../../services/appleHealthService');

      if (Platform.OS !== 'ios') {
        Alert.alert('Not Supported', 'Apple Health integration is only available on iOS devices.');
        return;
      }

      if (!isHealthKitAvailable()) {
        Alert.alert('Unavailable', 'Apple Health is not available on this device.');
        return;
      }

      const healthKitGranted = await requestFullHealthKitPermissions(healthPrefs);
      setIsHealthKitConnected(healthKitGranted);

      if (healthKitGranted) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert(
          'Apple Health Connected!',
          'Rooka is now authorized to read your selected health metrics.'
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

  const handleConnectAppleWatch = async () => {
    try {
      const {
        requestWorkoutKitAuthorization,
        isWorkoutKitSupported,
      } = require('../../services/appleHealthService');

      if (Platform.OS !== 'ios') {
        Alert.alert('Not Supported', 'Apple Watch sync is only available on iOS.');
        return;
      }

      if (!isWorkoutKitSupported()) {
        Alert.alert(
          'iOS 17+ Required',
          'Workout scheduling to Apple Watch requires an iPhone running iOS 17 or newer.'
        );
        return;
      }

      const status = await requestWorkoutKitAuthorization();
      const connected = status === 'authorized';
      setIsWatchConnected(connected);

      if (connected) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert(
          'Apple Watch Connected!',
          'Rooka is now authorized to send planned workouts directly to the Workout app on your Apple Watch.'
        );
      } else {
        Alert.alert(
          'Permissions Required',
          'Please open the Apple Watch app on your iPhone > Rooka, and enable workout scheduling.'
        );
      }
    } catch (err: any) {
      console.error('Apple Watch connect error:', err);
      Alert.alert('Error', err?.message || 'Failed to authorize Apple Watch.');
    }
  };

  const handleToggleHealthPref = async (key: string, value: boolean) => {
    const { saveAppleHealthPreferences } = require('../../services/appleHealthService');
    const updated = { ...healthPrefs, [key]: value };
    setHealthPrefs(updated);
    Haptics.selectionAsync();
    await saveAppleHealthPreferences(updated);
  };

  const handleSyncAppleHealth = async () => {
    setAppleSyncing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const { syncAppleHealthData } = require('../../services/appleHealthService');
      const res = await syncAppleHealthData(7);

      if (res.success) {
        setLastAppleSync(res.lastSyncDate || new Date().toISOString());
        setIsHealthKitConnected(true);
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
      {/* 1. APPLE HEALTH & WORKOUTKIT INTEGRATION */}
      <Card className="p-4">
        <View className="flex-row justify-between items-center">
          <View className="flex-row items-center gap-3 flex-1 mr-2">
            <View className="w-10 h-10 rounded-xl bg-rose-500/10 items-center justify-center">
              <Ionicons name="logo-apple" size={20} color="#FF2D55" />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-bold text-theme-text font-jakarta">{t('connections.appleHealthAndWatch')}</Text>
              <Text className="text-xs text-theme-muted mt-0.5">
                {isHealthKitConnected
                  ? `${t('connections.connected', 'Connected')} · ${isWatchConnected ? t('connections.watchReadyBadge', 'Watch Ready') : t('connections.watchOffBadge', 'Watch Off')}`
                  : t('connections.disconnected', 'Not connected')}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            onPress={() => {
              Haptics.selectionAsync();
              if (isHealthKitConnected) {
                setShowAppleManage((prev) => !prev);
              } else {
                handleConnectAppleHealth();
              }
            }}
            className={`px-3 py-1.5 rounded-lg border ${
              isHealthKitConnected
                ? 'bg-theme-bg border-theme-border'
                : 'bg-theme-accent border-theme-accent'
            }`}
          >
            <Text
              className={`text-xs font-bold ${
                isHealthKitConnected ? 'text-theme-accent' : 'text-white'
              }`}
            >
              {isHealthKitConnected ? (showAppleManage ? t('common.done', 'Done') : t('common.manage', 'Manage')) : t('common.connect', 'Connect')}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Expandable Manage Area */}
        {showAppleManage && isHealthKitConnected && (
          <View className="mt-3 pt-3 border-t border-theme-border/50 gap-y-3">
            <Text className="text-xs text-theme-muted leading-relaxed">
              {t('connections.appleHealthDesc')}
            </Text>

            {lastAppleSync && (
              <View className="flex-row items-center gap-1.5">
                <Ionicons name="time-outline" size={12} color={theme.textSecondary} />
                <Text className="text-[11px] text-theme-muted">
                  {t('connections.lastSynced', { time: new Date(lastAppleSync).toLocaleString(language, { dateStyle: 'short', timeStyle: 'short' }) })}
                </Text>
              </View>
            )}

            <View className="flex-row gap-2">
              <TouchableOpacity
                onPress={handleConnectAppleWatch}
                className="flex-1 py-2 px-3 rounded-lg bg-theme-bg border border-theme-border flex-row items-center justify-center"
              >
                <Ionicons name={isWatchConnected ? 'checkmark-circle' : 'watch-outline'} size={14} color={isWatchConnected ? '#10B981' : theme.tint} />
                <Text className="text-xs font-bold text-theme-text ml-1.5">
                  {isWatchConnected ? t('connections.watchReady') : t('connections.connectWatch')}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleSyncAppleHealth}
                disabled={appleSyncing}
                className="flex-1 py-2 px-3 rounded-lg bg-theme-accent flex-row items-center justify-center"
              >
                {appleSyncing ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="sync-outline" size={14} color="#FFFFFF" />
                    <Text className="text-xs font-bold text-white ml-1.5">{t('connections.syncHealthNow')}</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            {/* Granular Sharing Preferences Accordion */}
            <TouchableOpacity
              onPress={() => {
                Haptics.selectionAsync();
                setShowHealthPrefs((prev) => !prev);
              }}
              className="flex-row items-center justify-between py-1.5"
            >
              <View className="flex-row items-center gap-1.5">
                <Ionicons name="options-outline" size={13} color={theme.textSecondary} />
                <Text className="text-xs font-bold text-theme-muted">{t('connections.dataSharingPreferences')}</Text>
              </View>
              <Ionicons
                name={showHealthPrefs ? 'chevron-up-outline' : 'chevron-down-outline'}
                size={13}
                color={theme.textSecondary}
              />
            </TouchableOpacity>

            {showHealthPrefs && (
              <View className="gap-y-2 pt-1 bg-theme-bg/50 p-2.5 rounded-xl border border-theme-border/40">
                {[
                  { key: 'syncSleep', label: t('connections.sleepAnalysis'), icon: 'moon-outline' },
                  { key: 'syncHeartRate', label: t('connections.heartRateResting'), icon: 'heart-outline' },
                  { key: 'syncHrv', label: t('connections.hrv'), icon: 'flash-outline' },
                  { key: 'syncStepsCalories', label: t('connections.stepsActiveEnergy'), icon: 'flame-outline' },
                  { key: 'syncBodyMass', label: t('connections.bodyMassFat'), icon: 'scale-outline' },
                  { key: 'syncVo2Max', label: t('connections.vo2Max'), icon: 'speedometer-outline' },
                  { key: 'syncWorkouts', label: t('connections.completedWorkouts'), icon: 'fitness-outline' },
                ].map((metric) => (
                  <View
                    key={metric.key}
                    className="flex-row items-center justify-between py-1 border-b border-theme-border/20"
                  >
                    <View className="flex-row items-center gap-2">
                      <Ionicons name={metric.icon as any} size={14} color={theme.textSecondary} />
                      <Text className="text-xs text-theme-text font-medium">{metric.label}</Text>
                    </View>
                    <Switch
                      value={!!healthPrefs[metric.key]}
                      onValueChange={(val) => handleToggleHealthPref(metric.key, val)}
                      trackColor={{ false: '#DDE3E9', true: theme.tint }}
                    />
                  </View>
                ))}
              </View>
            )}
          </View>
        )}
      </Card>

      {/* 2. GARMIN CONNECT INTEGRATION */}
      <Card className="p-4">
        <View className="flex-row justify-between items-center">
          <View className="flex-row items-center gap-3 flex-1 mr-2">
            <View className="w-10 h-10 rounded-xl bg-sky-500/10 items-center justify-center">
              <Ionicons name="watch-outline" size={20} color="#0EA5E9" />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-bold text-theme-text font-jakarta">{t('connections.garminConnect')}</Text>
              <Text className="text-xs text-theme-muted mt-0.5">
                {isGarminConnected ? `${t('connections.connected', 'Connected')} · Direct Sync` : t('connections.disconnected', 'Not connected')}
              </Text>
            </View>
          </View>

          <View className="flex-row items-center gap-2">
            {isGarminConnected && (
              <TouchableOpacity
                onPress={handleSyncGarmin}
                disabled={garminSyncing}
                className="p-2 rounded-lg bg-theme-bg border border-theme-border items-center justify-center"
              >
                {garminSyncing ? (
                  <ActivityIndicator size="small" color={theme.tint} />
                ) : (
                  <Ionicons name="sync-outline" size={15} color={theme.tint} />
                )}
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={onOpenGarminModal}
              className={`px-3 py-1.5 rounded-lg border ${
                isGarminConnected
                  ? 'bg-theme-bg border-theme-border'
                  : 'bg-theme-accent border-theme-accent'
              }`}
            >
              <Text
                className={`text-xs font-bold ${
                  isGarminConnected ? 'text-theme-accent' : 'text-white'
                }`}
              >
                {isGarminConnected ? t('common.manage', 'Manage') : t('common.connect', 'Connect')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Card>

      {/* 3. STRAVA INTEGRATION */}
      <Card className="p-4">
        <View className="flex-row justify-between items-center">
          <View className="flex-row items-center gap-3 flex-1 mr-2">
            <View className="w-10 h-10 rounded-xl bg-amber-500/10 items-center justify-center">
              <Ionicons name="fitness-outline" size={20} color="#EA580C" />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-bold text-theme-text font-jakarta">{t('connections.stravaIntegration')}</Text>
              <Text className="text-xs text-theme-muted mt-0.5">
                {isStravaConnected ? `${t('connections.connected', 'Connected')} · Sharing active` : t('connections.disconnected', 'Not connected')}
              </Text>
            </View>
          </View>

          <View className="flex-row items-center gap-2">
            {isStravaConnected && (
              <TouchableOpacity
                onPress={handleSyncStrava}
                disabled={stravaSyncing}
                className="p-2 rounded-lg bg-theme-bg border border-theme-border items-center justify-center"
              >
                {stravaSyncing ? (
                  <ActivityIndicator size="small" color={theme.tint} />
                ) : (
                  <Ionicons name="sync-outline" size={15} color={theme.tint} />
                )}
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => {
                Haptics.selectionAsync();
                if (isStravaConnected) {
                  setShowStravaManage((prev) => !prev);
                } else {
                  onConnectStrava();
                }
              }}
              disabled={stravaLoading}
              className={`px-3 py-1.5 rounded-lg border ${
                isStravaConnected
                  ? 'bg-theme-bg border-theme-border'
                  : 'bg-theme-accent border-theme-accent'
              }`}
            >
              {stravaLoading ? (
                <ActivityIndicator size="small" color={isStravaConnected ? theme.tint : '#FFFFFF'} />
              ) : (
                <Text
                  className={`text-xs font-bold ${
                    isStravaConnected ? 'text-theme-accent' : 'text-white'
                  }`}
                >
                  {isStravaConnected ? (showStravaManage ? t('common.done', 'Done') : t('common.manage', 'Manage')) : t('common.connect', 'Connect')}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Expandable Strava Settings */}
        {showStravaManage && isStravaConnected && (
          <View className="mt-3 pt-3 border-t border-theme-border/50 gap-y-3">
            <TouchableOpacity
              onPress={onDisconnectStrava}
              disabled={stravaLoading}
              className="py-2 px-3 rounded-lg bg-rose-500/10 border border-rose-500/30 flex-row items-center justify-center"
            >
              <Ionicons name="unlink-outline" size={14} color="#EF4444" />
              <Text className="text-xs font-bold text-rose-500 ml-1.5">
                {t('connections.disconnect', 'Disconnect Strava')}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </Card>

      {/* STRAVA AUTOMATIONS PER SPORT TYPE */}
      <Card className="p-4">
        <View className="flex-row items-center gap-2 pb-3 mb-3 border-b border-theme-border">
          <View className="w-2.5 h-2.5 rounded-full bg-theme-accent" />
          <Text className="text-theme-text font-bold text-sm">{t('connections.stravaAutomations')}</Text>
        </View>

        {/* SPORT SELECTOR TABS */}
        <View className="flex-row bg-theme-bg p-1 rounded-xl mb-4 border border-theme-border">
          {SPORT_OPTIONS.map((sport) => {
            const isSelected = selectedSport === sport.id;
            return (
              <TouchableOpacity
                key={sport.id}
                onPress={() => setSelectedSport(sport.id)}
                className={`flex-1 flex-row items-center justify-center py-2 rounded-lg gap-1.5 ${
                  isSelected ? 'bg-theme-accent' : 'bg-transparent'
                }`}
              >
                <SportMedallion
                  sport={sport.id}
                  size={18}
                  onAccent={isSelected}
                />
                <Text
                  className={`text-xs font-bold ${
                    isSelected ? 'text-white' : 'text-theme-muted'
                  }`}
                >
                  {getSportOptionLabel(sport.id)}
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
                      <Text className="text-theme-text font-bold text-xs">{getToggleRowTitle(row.key)}</Text>
                      {isLocked && (
                        <View className="px-1.5 py-0.5 rounded bg-theme-accent/10">
                          <Text className="text-theme-accent text-[10px] font-bold font-rajdhani">rooka+</Text>
                        </View>
                      )}
                    </View>
                    {isLocked && (
                      <Text className="text-theme-muted text-xs font-rajdhani">
                        {t('connections.upgradeToRemoveCredit')}
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
