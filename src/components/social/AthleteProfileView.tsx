import React, { useState, useEffect } from 'react';
import { useTheme } from '@/hooks/use-theme';
import { View, Text, ScrollView, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '../ui/Card';
import { SheetGrabber } from '@/components/ui/SheetGrabber';
import { RookaMark } from '../ui/RookaPoints';
import { Sparkline } from '../common/Sparkline';
import { AthleteRadarChart } from '../progress/AthleteRadarChart';
import { useUser } from '../../context/UserStore';
import { useActivities } from '../../context/ActivityStore';
import { socialApi } from '../../services/apiServices';
import { PublicAthleteProfile } from '../../types/social';
import { getRookaLevelInfo } from '../../utils/gamification';
import { calculateAthleteArchetype } from '../../utils/archetypeUtils';
import { calculatePMCMetrics } from '../../utils/pmcUtils';
import { getSportFilledIcon } from '../../utils/sportIcons';
import { getFullProfilePhotoUrl } from '../../utils/avatarUtils';
import { Activity } from '../../types/activity';
import { AthleteProfileSkeleton } from '../skeletons/AthleteProfileSkeleton';

export interface AthleteProfileViewProps {
  athleteId: number | string | null;
  onClose: () => void;
  onOpenActivity?: (id: string | number, activity?: Partial<Activity>) => void;
  isPushScreen?: boolean;
}

export const AthleteProfileView: React.FC<AthleteProfileViewProps> = ({
  athleteId,
  onClose,
  onOpenActivity,
  isPushScreen = false,
}) => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { user: currentUser } = useUser();
  const { activities: currentActivities } = useActivities();
  const [loading, setLoading] = useState<boolean>(true);
  const [profile, setProfile] = useState<PublicAthleteProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!athleteId) {
      setProfile(null);
      setError(null);
      setLoading(false);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    socialApi
      .getProfile(athleteId)
      .then((data) => {
        if (!isMounted) return;
        if (data) {
          setProfile(data);
        } else {
          setError('Athlete profile not found');
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        console.error('Error loading athlete profile:', err);
        setError('Failed to load athlete profile');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [athleteId]);

  const handleConnect = async () => {
    if (!profile || !profile.id) return;
    const prevStatus = profile.connectionStatus;
    const isAccepting = profile.connectionStatus === 'pending_received';
    const nextStatus = isAccepting ? 'accepted' : 'pending';

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Optimistically update connection status
    setProfile((prev) => (prev ? { ...prev, connectionStatus: nextStatus } : null));

    try {
      if (isAccepting) {
        const res = await socialApi.acceptUser(profile.id);
        if (!res || !res.success) throw new Error('Accept connection failed');
      } else {
        const res = await socialApi.connectUser(profile.id);
        if (!res || !res.success) throw new Error('Connect user failed');
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      console.error('Connection action error, rolling back:', e);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setProfile((prev) => (prev ? { ...prev, connectionStatus: prevStatus } : null));
    }
  };

  const isSelf = Boolean(
    (profile?.id && currentUser?.id && String(profile.id) === String(currentUser.id)) ||
    (profile?.username && currentUser?.username && profile.username.toLowerCase() === currentUser.username.toLowerCase()) ||
    profile?.connectionStatus === 'self' ||
    (athleteId && currentUser?.id && String(athleteId) === String(currentUser.id))
  );

  const activities =
    isSelf && (currentActivities?.length || 0) >= (profile?.activities?.length || 0)
      ? currentActivities
      : profile?.activities || [];

  const metrics =
    isSelf && currentUser?.athlete_metrics
      ? currentUser.athlete_metrics
      : profile?.athlete_metrics;

  const archetype = calculateAthleteArchetype(activities, metrics);
  const hasActivities = activities.length > 0;

  const activitiesTotalRooka = Math.round(
    activities.reduce((sum, a) => sum + (a.rooka_score || 0), 0)
  );

  const serverTotalRooka = isSelf
    ? (currentUser?.total_rooka || profile?.total_rooka || 0)
    : (profile?.total_rooka || 0);

  const effectiveTotalRooka = serverTotalRooka > 0 ? serverTotalRooka : activitiesTotalRooka;

  const levelInfo = (() => {
    if (profile?.levelInfo && !isSelf) {
      return profile.levelInfo;
    }
    const info = getRookaLevelInfo(effectiveTotalRooka);
    return {
      level: info.level,
      currentXp: info.totalRooka,
      nextLevelXp: info.nextLevelThreshold,
      progressPercent: info.progressPercent,
    };
  })();

  const xpPercent =
    levelInfo.progressPercent !== undefined
      ? levelInfo.progressPercent
      : Math.min(
          100,
          Math.round((levelInfo.currentXp / (levelInfo.nextLevelXp || 1)) * 100)
        );

  const pmcMetrics = calculatePMCMetrics(activities, metrics?.weight_kg || 0);

  const ctlHistory =
    pmcMetrics.ctlHistory?.length >= 2
      ? pmcMetrics.ctlHistory
      : profile?.trends?.ctl && profile.trends.ctl.length >= 2
      ? profile.trends.ctl
      : [];

  const atlHistory =
    pmcMetrics.atlHistory?.length >= 2
      ? pmcMetrics.atlHistory
      : profile?.trends?.atl && profile.trends.atl.length >= 2
      ? profile.trends.atl
      : [];

  const tsbHistory =
    pmcMetrics.tsbHistory?.length >= 2
      ? pmcMetrics.tsbHistory
      : profile?.trends?.tsb && profile.trends.tsb.length >= 2
      ? profile.trends.tsb
      : [];

  return (
    <View className="flex-1 bg-theme-bg">
      {/* Top Header / Pull Handle */}
      {isPushScreen ? (
        <View
          style={{ paddingTop: Math.max(insets.top, 16), paddingBottom: 12 }}
          className="px-4 flex-row items-center justify-between border-b border-theme-border bg-theme-bg"
        >
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 items-center justify-center shadow-xs"
          >
            <Ionicons name="chevron-back" size={22} color={theme.text} />
          </TouchableOpacity>

          <Text className="text-base font-bold text-theme-text" numberOfLines={1}>
            {profile?.username ? `${profile.username}` : 'Athlete Profile'}
          </Text>

          <View className="w-10" />
        </View>
      ) : (
        <View className="items-center pt-2.5 pb-1">
          <SheetGrabber />
        </View>
      )}

      {loading ? (
        <AthleteProfileSkeleton />
      ) : error || !profile ? (
        <View className="flex-1 items-center justify-center p-8">
          <Ionicons name="alert-circle-outline" size={44} color="#EF4444" />
          <Text className="text-base font-bold text-theme-text mt-3 text-center">
            {error || 'Unable to load profile'}
          </Text>
          <TouchableOpacity
            onPress={onClose}
            className="mt-6 bg-theme-accent px-6 py-2.5 rounded-full"
          >
            <Text className="text-white font-extrabold text-sm">Close</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: isPushScreen ? 16 : 6,
            paddingBottom: Math.max(insets.bottom, 24) + 20,
          }}
        >
          {/* HERO / IDENTITY CARD */}
          <Card className="mb-4 bg-theme-card p-5">
            <View className="flex-row items-center gap-x-4">
              {(() => {
                const avatarUri = getFullProfilePhotoUrl(
                  profile.profilePictureUrl || (profile as any).profile_picture_url
                );
                return avatarUri ? (
                  <Image source={{ uri: avatarUri }} className="w-16 h-16 rounded-full" />
                ) : (
                  <View className="w-16 h-16 rounded-full bg-theme-accent/20 items-center justify-center">
                    <Text className="text-2xl font-extrabold text-theme-accent">
                      {(profile.username || 'A').charAt(0).toUpperCase()}
                    </Text>
                  </View>
                );
              })()}

              <View className="flex-1">
                <View className="flex-row items-center gap-x-2">
                  <Text className="text-lg font-extrabold text-theme-text" numberOfLines={1}>
                    {profile.username}
                  </Text>
                </View>

                {profile.activeTitle && (
                  <View className="self-start px-2 py-0.5 mt-1 bg-semantic-warning/15 border border-semantic-warning/30 rounded-md">
                    <Text className="text-xs font-extrabold text-semantic-warning">
                      {profile.activeTitle.title}
                    </Text>
                  </View>
                )}

                <Text className="text-xs text-theme-muted mt-1">
                  Member since {(profile as any)?.created_at ? new Date((profile as any).created_at).getFullYear() : '2026'}
                </Text>
              </View>

              {!isSelf && (
                <TouchableOpacity
                  onPress={handleConnect}
                  className={`px-4 py-2 rounded-full flex-row items-center gap-x-1.5 shadow-xs ${
                    profile.connectionStatus === 'accepted'
                      ? 'bg-slate-100 dark:bg-slate-800 border border-theme-border'
                      : profile.connectionStatus === 'pending'
                      ? 'bg-slate-200 dark:bg-slate-700'
                      : profile.connectionStatus === 'pending_received'
                      ? 'bg-theme-accent'
                      : 'bg-theme-accent'
                  }`}
                >
                  <Ionicons
                    name={
                      profile.connectionStatus === 'accepted'
                        ? 'checkmark'
                        : profile.connectionStatus === 'pending'
                        ? 'time-outline'
                        : profile.connectionStatus === 'pending_received'
                        ? 'person-add'
                        : 'person-add'
                    }
                    size={14}
                    color={
                      profile.connectionStatus === 'accepted'
                        ? theme.text
                        : profile.connectionStatus === 'pending'
                        ? theme.textSecondary
                        : '#FFFFFF'
                    }
                  />
                  <Text
                    className={`text-xs font-extrabold ${
                      profile.connectionStatus === 'accepted'
                        ? 'text-theme-text'
                        : profile.connectionStatus === 'pending'
                        ? 'text-theme-muted'
                        : 'text-white'
                    }`}
                  >
                    {profile.connectionStatus === 'accepted'
                      ? 'Friends'
                      : profile.connectionStatus === 'pending'
                      ? 'Pending'
                      : profile.connectionStatus === 'pending_received'
                      ? 'Accept'
                      : 'Follow'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </Card>

          {/* LEVEL & ROOKA POINTS CARD */}
          <Card className="mb-4 bg-theme-card p-5">
            <View className="flex-row items-center justify-between mb-3">
              <View className="flex-row items-center gap-x-2">
                <View className="w-8 h-8 rounded-full bg-theme-accent/20 items-center justify-center">
                  <RookaMark size={16} color={theme.tint} />
                </View>
                <View>
                  <Text className="text-xs font-bold text-theme-muted uppercase tracking-wider">
                    Level & Points
                  </Text>
                  <Text className="text-base font-extrabold text-theme-text">
                    Level {levelInfo.level}
                  </Text>
                </View>
              </View>

              <View className="items-end">
                <Text className="text-xs font-bold text-theme-muted uppercase tracking-wider">
                  Total Rooka
                </Text>
                <Text className="text-base font-extrabold font-rajdhani text-theme-accent">
                  {effectiveTotalRooka.toLocaleString()}
                </Text>
              </View>
            </View>

            {/* Level Progress Bar */}
            <View className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2.5 overflow-hidden">
              <View
                className="bg-theme-accent h-full rounded-full"
                style={{ width: `${Math.min(100, Math.max(0, xpPercent))}%` }}
              />
            </View>
            <View className="flex-row justify-between items-center mt-1.5">
              <Text className="text-[11px] text-theme-muted">
                {levelInfo.currentXp.toLocaleString()} XP
              </Text>
              <Text className="text-[11px] text-theme-muted">
                {levelInfo.nextLevelXp ? `${levelInfo.nextLevelXp.toLocaleString()} XP next` : 'Max Level'}
              </Text>
            </View>
          </Card>

          {/* ATHLETE ARCHETYPE CARD */}
          <Card className="mb-4 bg-theme-card p-5">
            <View className="flex-row items-center justify-between mb-4">
              <View className="flex-row items-center gap-x-2">
                <View className="w-8 h-8 rounded-xl bg-theme-accent/20 items-center justify-center">
                  <Ionicons name="finger-print-outline" size={16} color={theme.tint} />
                </View>
                <View>
                  <Text className="text-xs font-bold text-theme-muted uppercase tracking-wider">
                    Athlete Archetype
                  </Text>
                  <Text className="text-base font-extrabold text-theme-text">
                    {archetype.title}
                  </Text>
                </View>
              </View>
            </View>

            {hasActivities ? (
              <>
                <AthleteRadarChart data={archetype} size={260} />
                {archetype.description ? (
                  <View className="mt-3 pt-3 border-t border-theme-border/40">
                    <Text className="text-xs text-theme-muted text-center leading-relaxed">
                      {archetype.description}
                    </Text>
                  </View>
                ) : null}
              </>
            ) : (
              <View className="items-center justify-center py-10 px-6">
                <Ionicons name="analytics-outline" size={34} color={theme.textSecondary} />
                <Text className="text-theme-text font-bold text-base mt-3 text-center">
                  No sessions yet
                </Text>
                <Text className="text-theme-muted text-sm mt-1.5 text-center leading-relaxed">
                  Log or sync a workout and your athlete profile will build itself from what you actually train.
                </Text>
              </View>
            )}
          </Card>

          {/* PHYSIOLOGY PMC TELEMETRY CARD */}
          {hasActivities && (
            <Card className="mb-4 bg-theme-card p-5">
              <Text className="text-xs font-bold text-theme-muted uppercase tracking-wider mb-3">
                Physiology & Fitness Load (PMC)
              </Text>

              <View className="space-y-3">
                {/* Fitness (CTL) */}
                <View className="flex-row items-center justify-between">
                  <View className="flex-1 pr-2">
                    <Text className="text-xs font-bold text-theme-text">Fitness (CTL)</Text>
                    <Text className="text-[11px] text-theme-muted">Chronic Training Load (42d)</Text>
                  </View>
                  <Text className="text-sm font-extrabold font-mono text-theme-text w-12 text-right mr-3">
                    {Math.round(pmcMetrics.ctl)}
                  </Text>
                  <Sparkline
                    data={ctlHistory.length >= 2 ? ctlHistory : [10, 12, 14, 18, 22, 25]}
                    color="#10B981"
                    gradientFrom="#10B98133"
                    gradientTo="#10B98100"
                    width={110}
                    height={32}
                    strokeWidth={2}
                  />
                </View>

                {/* Fatigue (ATL) */}
                <View className="flex-row items-center justify-between">
                  <View className="flex-1 pr-2">
                    <Text className="text-xs font-bold text-theme-text">Fatigue (ATL)</Text>
                    <Text className="text-[11px] text-theme-muted">Acute Training Load (7d)</Text>
                  </View>
                  <Text className="text-sm font-extrabold font-mono text-theme-text w-12 text-right mr-3">
                    {Math.round(pmcMetrics.atl)}
                  </Text>
                  <Sparkline
                    data={atlHistory.length >= 2 ? atlHistory : [15, 20, 18, 25, 28, 30]}
                    color="#F59E0B"
                    gradientFrom="#F59E0B33"
                    gradientTo="#F59E0B00"
                    width={110}
                    height={32}
                    strokeWidth={2}
                  />
                </View>

                {/* Form (TSB) */}
                <View className="flex-row items-center justify-between">
                  <View className="flex-1 pr-2">
                    <Text className="text-xs font-bold text-theme-text">Form (TSB)</Text>
                    <Text className="text-[11px] text-theme-muted">Training Stress Balance</Text>
                  </View>
                  <Text
                    className={`text-sm font-extrabold font-mono w-12 text-right mr-3 ${
                      pmcMetrics.tsb >= 0 ? 'text-emerald-500' : 'text-amber-500'
                    }`}
                  >
                    {pmcMetrics.tsb >= 0 ? `+${Math.round(pmcMetrics.tsb)}` : Math.round(pmcMetrics.tsb)}
                  </Text>
                  <Sparkline
                    data={tsbHistory.length >= 2 ? tsbHistory : [5, 2, -4, -2, 4, 6]}
                    color="#208AEF"
                    gradientFrom="#208AEF33"
                    gradientTo="#208AEF00"
                    width={110}
                    height={32}
                    strokeWidth={2}
                  />
                </View>
              </View>
            </Card>
          )}

          {/* RECENT ACTIVITIES */}
          {profile.recentActivities && profile.recentActivities.length > 0 && (
            <View className="mb-6">
              <Text className="text-xs font-bold text-theme-muted uppercase tracking-wider mb-3 px-1">
                Recent Activities ({profile.recentActivities.length})
              </Text>

              {profile.recentActivities.map((act: any) => {
                const sportIcon = getSportFilledIcon(act.sport_type || 'Run');
                return (
                  <TouchableOpacity
                    key={`profile-act-${act.id}`}
                    activeOpacity={0.8}
                    onPress={() => {
                      if (onOpenActivity) {
                        onOpenActivity(act.id, act);
                      }
                    }}
                    className="bg-theme-card border border-theme-border rounded-tile p-4 mb-2.5 flex-row items-center justify-between shadow-xs"
                  >
                    <View className="flex-row items-center gap-x-3 flex-1 pr-2">
                      <View className="w-10 h-10 rounded-xl bg-theme-accent/15 items-center justify-center">
                        <Ionicons name={sportIcon as any} size={20} color={theme.tint} />
                      </View>
                      <View className="flex-1">
                        <Text className="text-sm font-bold text-theme-text" numberOfLines={1}>
                          {act.name || act.title || 'Workout'}
                        </Text>
                        <Text className="text-xs text-theme-muted mt-0.5">
                          {act.start_date ? act.start_date.substring(0, 10) : 'Recent'}
                          {typeof act.distance_km === 'number' && act.distance_km > 0
                            ? ` · ${act.distance_km.toFixed(1)} km`
                            : ''}
                          {typeof act.moving_time_min === 'number' && act.moving_time_min > 0
                            ? ` · ${Math.round(act.moving_time_min)} min`
                            : ''}
                        </Text>
                      </View>
                    </View>

                    {act.rooka_score || act.spark_score ? (
                      <View className="px-2.5 py-1 bg-theme-accent/15 rounded-full flex-row items-center">
                        <RookaMark size={11} color={theme.tint} />
                        <Text className="text-xs font-extrabold font-rajdhani text-theme-accent ml-1">
                          +{Math.round(act.rooka_score || act.spark_score || 0)}
                        </Text>
                      </View>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
};
