import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { View, Text, TouchableOpacity, RefreshControl, Pressable, DeviceEventEmitter } from 'react-native';
import { useFocusEffect } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
  withSpring,
  useReducedMotion,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useTheme } from '@/hooks/use-theme';
import { useLanguage } from '../../context/LanguageContext';
import { socialApi } from '../../services/apiServices';
import { wsService } from '../../services/websocket';
import { SocialFeedActivity } from '../../types/social';
import { formatPaceOrSpeed } from '../../utils/paceFormat';
import { formatClock, formatDuration, formatRelativeDayAndTime, pluralize } from '../../utils/format';

import { Card } from '../ui/Card';
import { Chip } from '../ui/Chip';
import { SportMedallion } from '../ui/SportMedallion';
import { UserAvatar } from '../ui/UserAvatar';
import { RoutePreview } from '../ui/RoutePreview';
import { EmptyState } from '../ui/EmptyState';
import { FeedSkeleton } from '../skeletons/FeedSkeleton';

interface FeedSubTabProps {
  onOpenActivityModal?: (id: string | number, activity?: Partial<SocialFeedActivity>) => void;
  onOpenAthleteProfile?: (userId: number | string) => void;
  onOpenAddFriends?: () => void;
}

interface FeedDayGroup {
  id: string;
  user_id: number | string;
  username: string;
  profile_picture_url?: string | null;
  rooka_level?: number;
  equipped_title?: string;
  dateStr: string;
  totalRooka: number;
  activities: SocialFeedActivity[];
  isMultiSport: boolean;
}

/**
 * Animated Bolt Kudos Ghost Button adhering to Rooka spec:
 * Scale 1 to 1.25 to 1 with light haptics, fills with accent color.
 */
interface KudosButtonProps {
  hasKudosed: boolean;
  kudosCount: number;
  onPress: () => void;
}

const KudosButton: React.FC<KudosButtonProps> = ({ hasKudosed, kudosCount, onPress }) => {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!reducedMotion) {
      scale.value = withSequence(
        withTiming(1.25, { duration: 120 }),
        withSpring(1, { damping: 12, stiffness: 220 })
      );
    }
    onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      className="flex-row items-center gap-x-1.5 py-1.5 px-2 rounded-button-md active:opacity-70"
    >
      <Animated.View style={animatedStyle}>
        <Ionicons
          name={hasKudosed ? 'flash' : 'flash-outline'}
          size={18}
          color={hasKudosed ? theme.tint : theme.textSecondary}
        />
      </Animated.View>
      <Text
        className={`text-sm font-bold font-rajdhani tabular-nums ${
          hasKudosed ? 'text-theme-accent' : 'text-theme-muted'
        }`}
      >
        {kudosCount}
      </Text>
    </Pressable>
  );
};

export const FeedSubTab: React.FC<FeedSubTabProps> = ({
  onOpenActivityModal,
  onOpenAthleteProfile,
  onOpenAddFriends,
}) => {
  const theme = useTheme();
  const { language } = useLanguage();
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [feedItems, setFeedItems] = useState<SocialFeedActivity[]>([]);
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const handledConnectionIdsRef = useRef<Set<string>>(new Set());

  const fetchPending = useCallback(async () => {
    try {
      const res = await socialApi.getConnections();
      if (res && res.connections) {
        const pending = res.connections.filter(
          (c: any) =>
            c.status === 'pending_received' &&
            !handledConnectionIdsRef.current.has(String(c.friend_id)) &&
            !handledConnectionIdsRef.current.has(String(c.user_id))
        );
        setPendingRequests(pending);
      }
    } catch {}
  }, []);

  const loadFeed = useCallback(async (isPullToRefresh = false) => {
    if (isPullToRefresh) setRefreshing(true);
    fetchPending();
    try {
      const res = await socialApi.getFeed();
      if (res && Array.isArray(res.activities)) {
        setFeedItems(res.activities);
      }
    } catch (err) {
      console.log('Feed fetch error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fetchPending]);

  useFocusEffect(
    useCallback(() => {
      fetchPending();
    }, [fetchPending])
  );

  useEffect(() => {
    loadFeed();

    const connSub = DeviceEventEmitter.addListener(
      'connectionRequestUpdated',
      ({ friendId, status }: { friendId: number | string; status: string }) => {
        if (status === 'accepted' || status === 'declined') {
          handledConnectionIdsRef.current.add(String(friendId));
          setPendingRequests((prev) =>
            prev.filter((r) => String(r.friend_id) !== String(friendId) && String(r.user_id) !== String(friendId))
          );
        }
        fetchPending();
      }
    );

    const connChangedSub = DeviceEventEmitter.addListener('socialConnectionsChanged', () => {
      fetchPending();
      loadFeed(false);
    });

    const unsubs = [
      wsService.subscribeToEvent('kudos_received', () => loadFeed(false)),
      wsService.subscribeToEvent('comment_received', () => loadFeed(false)),
      wsService.subscribeToEvent('connection_request', () => {
        fetchPending();
        loadFeed(false);
      }),
      wsService.subscribeToEvent('connection_accepted', () => {
        fetchPending();
        loadFeed(false);
      }),
    ];

    return () => {
      connSub.remove();
      connChangedSub.remove();
      unsubs.forEach((off) => off());
    };
  }, [loadFeed, fetchPending]);

  const handleAcceptRequest = async (friendId: number | string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    handledConnectionIdsRef.current.add(String(friendId));
    const prevRequests = [...pendingRequests];
    setPendingRequests((prev) =>
      prev.filter((r) => String(r.friend_id) !== String(friendId) && String(r.user_id) !== String(friendId))
    );

    try {
      const res = await socialApi.acceptUser(friendId);
      if (res && res.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        DeviceEventEmitter.emit('socialConnectionsChanged');
        loadFeed(false);
      } else {
        throw new Error('Accept connection failed');
      }
    } catch (err) {
      console.error('Accept request error, rolling back:', err);
      handledConnectionIdsRef.current.delete(String(friendId));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setPendingRequests(prevRequests);
    }
  };

  const handleToggleKudos = async (item: SocialFeedActivity) => {
    const id = item.id;
    const prevHasKudosed = item.has_kudosed;
    const prevKudosCount = item.kudos_count;
    const nextHasKudosed = !item.has_kudosed;
    const nextKudosCount = nextHasKudosed ? (item.kudos_count || 0) + 1 : Math.max(0, (item.kudos_count || 0) - 1);

    setFeedItems((prev) =>
      prev.map((act) =>
        act.id === id
          ? {
              ...act,
              has_kudosed: nextHasKudosed,
              kudos_count: nextKudosCount,
            }
          : act
      )
    );

    try {
      await socialApi.toggleKudos(id);
    } catch (err) {
      console.error('Toggle kudos error, rolling back:', err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setFeedItems((prev) =>
        prev.map((act) =>
          act.id === id
            ? {
                ...act,
                has_kudosed: prevHasKudosed,
                kudos_count: prevKudosCount,
              }
            : act
        )
      );
    }
  };

  // Group activities from the same user on the same date into a single Brick / Multi-Sport session card
  const groupedFeed = useMemo(() => {
    const groups: FeedDayGroup[] = [];
    const groupMap = new Map<string, FeedDayGroup>();

    feedItems.forEach((act) => {
      const uId = act.user_id || 'unknown';
      const dateKey = act.start_date ? act.start_date.substring(0, 10) : 'recent';
      const key = `${uId}_${dateKey}`;

      if (!groupMap.has(key)) {
        const group: FeedDayGroup = {
          id: key,
          user_id: act.user_id,
          username: act.username,
          profile_picture_url: act.profile_picture_url || (act as any).profilePictureUrl,
          rooka_level: act.rooka_level,
          equipped_title: act.equipped_title,
          dateStr: act.start_date ? formatRelativeDayAndTime(act.start_date, language) : 'Recent',
          totalRooka: Math.round(act.rooka_score || 0),
          activities: [act],
          isMultiSport: false,
        };
        groupMap.set(key, group);
        groups.push(group);
      } else {
        const group = groupMap.get(key)!;
        group.activities.push(act);
        group.totalRooka += Math.round(act.rooka_score || 0);
        group.isMultiSport = true;
      }
    });

    return groups;
  }, [feedItems, language]);

  if (loading && feedItems.length === 0 && pendingRequests.length === 0) {
    return <FeedSkeleton count={3} />;
  }

  return (
    <View className="gap-y-3 pb-4">
      {/* PENDING FRIEND REQUESTS BANNER */}
      {pendingRequests.length > 0 && (
        <Card variant="accent" padding={14} className="mb-2">
          <View className="flex-row items-center gap-x-2 mb-2.5">
            <Ionicons name="person-add" size={16} color={theme.tint} />
            <Text className="text-xs font-bold text-theme-accent uppercase tracking-wider">
              Friend Requests ({pendingRequests.length})
            </Text>
          </View>
          {pendingRequests.map((req) => (
            <View
              key={`feed-req-${req.friend_id || req.user_id}`}
              className="flex-row items-center justify-between bg-theme-bg p-2.5 rounded-inset mb-1.5"
            >
              <View className="flex-row items-center gap-x-2.5">
                <UserAvatar
                  size={32}
                  photoUrl={req.profile_picture_url || req.profilePictureUrl}
                  userId={req.friend_id || req.user_id}
                  name={req.username}
                />
                <Text className="text-sm font-bold text-theme-text">{req.username}</Text>
              </View>
              <TouchableOpacity
                onPress={() => handleAcceptRequest(req.friend_id || req.user_id)}
                className="bg-emerald-600 px-3 py-1.5 rounded-button-md"
              >
                <Text className="text-xs font-bold text-white">Accept</Text>
              </TouchableOpacity>
            </View>
          ))}
        </Card>
      )}

      {groupedFeed.length === 0 ? (
        <EmptyState
          preset="empty-feed"
          badge="ATHLETE NETWORK"
          title="Your Feed is Quiet"
          subtitle="Connect with teammates, training partners, and club athletes to see their workouts, exchange kudos, and keep each other accountable."
          action={
            onOpenAddFriends
              ? {
                  label: 'Find & Add Athletes',
                  icon: 'person-add-outline',
                  onPress: onOpenAddFriends,
                  variant: 'primary',
                }
              : undefined
          }
          className="my-2"
        />
      ) : (
        groupedFeed.map((group) => {
          const primaryActivity = group.activities[0];
          const hasKudosed = group.activities.some((a) => a.has_kudosed);
          const totalKudos = group.activities.reduce((sum, a) => sum + (a.kudos_count || 0), 0);
          const totalComments = group.activities.reduce((sum, a) => sum + (a.comments_count || 0), 0);
          const primaryMovingSec =
            typeof (primaryActivity as any).moving_time_s === 'number' && (primaryActivity as any).moving_time_s > 0
              ? (primaryActivity as any).moving_time_s
              : typeof primaryActivity.moving_time === 'number' && primaryActivity.moving_time > 0
              ? primaryActivity.moving_time
              : (primaryActivity.moving_time_min || 0) * 60;

          const primaryPace = formatPaceOrSpeed(
            primaryActivity.distance_km,
            primaryMovingSec,
            primaryActivity.sport_type,
            primaryActivity.name || (primaryActivity as any).title,
            true
          );

          const hasDistance = typeof primaryActivity.distance_km === 'number' && primaryActivity.distance_km > 0;

          return (
            <Card
              key={`feed-group-${group.id}`}
              variant="default"
              padding={16}
              className="gap-y-3"
            >
              {/* 1. ATHLETE HEADER ROW (48pt) */}
              <View className="flex-row justify-between items-center">
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => {
                    if (group.user_id && onOpenAthleteProfile) {
                      onOpenAthleteProfile(group.user_id);
                    }
                  }}
                  className="flex-row items-center flex-1 pr-2"
                >
                  <UserAvatar
                    size={40}
                    photoUrl={group.profile_picture_url}
                    userId={group.user_id}
                    name={group.username}
                    className="mr-3"
                  />

                  <View className="flex-1">
                    {/* Line 1: Name + Level chip + Brick indicator */}
                    <View className="flex-row items-center gap-x-1.5 flex-wrap">
                      <Text className="text-sm font-bold text-theme-text" numberOfLines={1}>
                        {group.username}
                      </Text>
                      {group.rooka_level ? (
                        <Chip variant="neutral" size="sm" label={`Lvl ${group.rooka_level}`} />
                      ) : null}
                      {group.isMultiSport && (
                        <Chip
                          variant="sport"
                          sport="triathlon"
                          size="sm"
                          label={`Brick (${group.activities.length})`}
                        />
                      )}
                    </View>

                    {/* Line 2: Equipped Title in warm accent (if present) */}
                    {group.equipped_title ? (
                      <Text className="text-xs font-semibold text-theme-warm mt-0.5" numberOfLines={1}>
                        {group.equipped_title}
                      </Text>
                    ) : null}

                    {/* Line 3: Relative Timestamp e.g. "Today, 07:52" */}
                    <Text className="text-xs text-theme-muted mt-0.5">
                      {group.dateStr}
                    </Text>
                  </View>
                </TouchableOpacity>

                {/* Right: Points chip (bolt + number, no word 'rooka') */}
                <Chip variant="points" size="sm" label={`+${group.totalRooka}`} />
              </View>

              {/* 2. WORKOUT BODY: Single Activity or Multi-Activity Brick Stack */}
              {group.activities.length === 1 ? (
                // SINGLE ACTIVITY BLOCK
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => onOpenActivityModal && onOpenActivityModal(primaryActivity.id, primaryActivity)}
                  className="gap-y-2.5 pt-1"
                >
                  {/* Title line: 40pt SportMedallion + title + chevron */}
                  <View className="flex-row items-center justify-between">
                    <View className="flex-row items-center gap-x-2.5 flex-1 pr-2">
                      <SportMedallion sport={primaryActivity.sport_type} size={40} />
                      <Text className="text-base font-bold text-theme-text flex-1" numberOfLines={1}>
                        {primaryActivity.name || primaryActivity.title || 'Workout'}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
                  </View>

                  {/* Metrics and Route block */}
                  {primaryActivity.polyline ? (
                    // Split view: Metrics left, Map right
                    <View className="flex-row mt-3 mb-1">
                      <View className="flex-col w-[35%] justify-between space-y-3">
                        <View>
                          <Text className="text-2xl font-bold font-rajdhani text-theme-text tracking-tight tabular-nums">
                            {primaryActivity.distance_km?.toFixed(1) || '0.0'}
                            <Text className="text-xs font-medium text-theme-muted"> km</Text>
                          </Text>
                          <Text className="text-[10px] font-semibold text-theme-muted uppercase tracking-wider mt-0.5">
                            DISTANCE
                          </Text>
                        </View>
                        <View>
                          <Text className="text-2xl font-bold font-rajdhani text-theme-text tracking-tight tabular-nums">
                            {formatClock(primaryMovingSec)}
                          </Text>
                          <Text className="text-[10px] font-semibold text-theme-muted uppercase tracking-wider mt-0.5">
                            TIME
                          </Text>
                        </View>
                        <View>
                          <Text className="text-2xl font-bold font-rajdhani text-theme-text tracking-tight tabular-nums">
                            {primaryPace || '--'}
                          </Text>
                          <Text className="text-[10px] font-semibold text-theme-muted uppercase tracking-wider mt-0.5">
                            {primaryPace?.endsWith('km/h') ? 'SPEED' : 'PACE'}
                          </Text>
                        </View>
                      </View>
                      <View className="flex-1 pl-2 justify-center items-center">
                        <RoutePreview
                          polyline={primaryActivity.polyline}
                          height={160}
                          strokeWidth={4}
                        />
                      </View>
                    </View>
                  ) : hasDistance ? (
                    // No map, but has distance -> horizontal 3 columns
                    <View className="flex-row justify-between items-start pt-3 pb-1">
                      {/* Metric 1: Distance */}
                      <View className="flex-1">
                        <Text className="text-2xl font-bold font-rajdhani text-theme-text tracking-tight tabular-nums">
                          {primaryActivity.distance_km?.toFixed(1) || '0.0'}
                          <Text className="text-xs font-medium text-theme-muted"> km</Text>
                        </Text>
                        <Text className="text-[10px] font-semibold text-theme-muted uppercase tracking-wider mt-0.5">
                          DISTANCE
                        </Text>
                      </View>

                      {/* Metric 2: Time */}
                      <View className="flex-1 items-center">
                        <Text className="text-2xl font-bold font-rajdhani text-theme-text tracking-tight tabular-nums">
                          {formatClock(primaryMovingSec)}
                        </Text>
                        <Text className="text-[10px] font-semibold text-theme-muted uppercase tracking-wider mt-0.5">
                          TIME
                        </Text>
                      </View>

                      {/* Metric 3: Pace or Speed */}
                      <View className="flex-1 items-end">
                        <Text className="text-2xl font-bold font-rajdhani text-theme-text tracking-tight tabular-nums">
                          {primaryPace || '--'}
                        </Text>
                        <Text className="text-[10px] font-semibold text-theme-muted uppercase tracking-wider mt-0.5">
                          {primaryPace?.endsWith('km/h') ? 'SPEED' : 'PACE'}
                        </Text>
                      </View>
                    </View>
                  ) : (
                    // Activities without distance (Strength, Mobility, Yoga)
                    <View className="flex-row justify-between items-start pt-3 pb-1">
                      <View className="flex-1">
                        <Text className="text-2xl font-bold font-rajdhani text-theme-text tracking-tight tabular-nums">
                          {formatDuration(primaryActivity.moving_time_min || 0)}
                        </Text>
                        <Text className="text-[10px] font-semibold text-theme-muted uppercase tracking-wider mt-0.5">
                          DURATION
                        </Text>
                      </View>

                      <View className="flex-1 items-end">
                        <Text className="text-2xl font-bold font-rajdhani text-theme-text tracking-tight tabular-nums">
                          +{Math.round(primaryActivity.rooka_score || 0)}
                        </Text>
                        <Text className="text-[10px] font-semibold text-theme-muted uppercase tracking-wider mt-0.5">
                          EFFORT
                        </Text>
                      </View>
                    </View>
                  )}
                </TouchableOpacity>
              ) : (
                // MULTI-ACTIVITY STACK (Brick Session)
                <View className="pt-1">
                  {group.activities.map((act, actIdx) => {
                    const actMovingSec =
                      typeof (act as any).moving_time_s === 'number' && (act as any).moving_time_s > 0
                        ? (act as any).moving_time_s
                        : typeof act.moving_time === 'number' && act.moving_time > 0
                        ? act.moving_time
                        : (act.moving_time_min || 0) * 60;

                    const actPace = formatPaceOrSpeed(
                      act.distance_km,
                      actMovingSec,
                      act.sport_type,
                      act.name || act.title,
                      true
                    );

                    return (
                      <TouchableOpacity
                        key={`brick-act-${act.id}-${actIdx}`}
                        activeOpacity={0.8}
                        onPress={() => onOpenActivityModal && onOpenActivityModal(act.id, act)}
                        className={`py-3 flex-row items-center justify-between ${
                          actIdx > 0 ? 'border-t border-theme-border/60' : ''
                        }`}
                      >
                        <View className="flex-row items-center gap-x-2.5 flex-1 pr-2">
                          <SportMedallion sport={act.sport_type} size={28} />
                          <View className="flex-1">
                            <Text className="text-sm font-bold text-theme-text" numberOfLines={1}>
                              {act.name || act.title || 'Workout'}
                            </Text>
                            <Text className="text-xs text-theme-muted font-medium font-rajdhani tabular-nums">
                              {[
                                typeof act.distance_km === 'number' && act.distance_km > 0
                                  ? `${act.distance_km.toFixed(1)}\u00A0km`
                                  : null,
                                typeof act.moving_time_min === 'number' && act.moving_time_min > 0
                                  ? `${Math.round(act.moving_time_min)}\u00A0min`
                                  : null,
                                actPace,
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </Text>
                          </View>
                        </View>

                        <View className="flex-row items-center gap-x-2">
                          <Chip variant="points" size="sm" label={`+${Math.round(act.rooka_score || 0)}`} />
                          <Ionicons name="chevron-forward" size={14} color={theme.textSecondary} />
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {/* 3. FOOTER ACTIONS (44pt, hairline above, ghost buttons) */}
              <View className="flex-row items-center justify-between pt-2 border-t border-theme-border/60">
                <KudosButton
                  hasKudosed={hasKudosed}
                  kudosCount={totalKudos}
                  onPress={() => handleToggleKudos(primaryActivity)}
                />

                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => onOpenActivityModal && onOpenActivityModal(primaryActivity.id, primaryActivity)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  className="flex-row items-center gap-x-1.5 py-1.5 px-2 rounded-button-md active:opacity-70"
                >
                  <Ionicons name="chatbubble-outline" size={17} color={theme.textSecondary} />
                  <Text className="text-xs font-semibold text-theme-muted">
                    {totalComments > 0
                      ? pluralize('comment', totalComments, language)
                      : 'Comment'}
                  </Text>
                </TouchableOpacity>
              </View>
            </Card>
          );
        })
      )}
    </View>
  );
};
