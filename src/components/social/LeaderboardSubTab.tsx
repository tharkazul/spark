import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, useWindowDimensions } from 'react-native';
import Animated, { FadeInDown, useReducedMotion, type SharedValue } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';

import { useTheme } from '@/hooks/use-theme';
import { useUser } from '../../context/UserStore';
import { useLanguage } from '../../context/LanguageContext';
import { socialApi } from '../../services/apiServices';
import { canAccessLeaderboard } from '../../utils/permissions';
import { LeaderboardEntry } from '../../types/social';
import { pluralize } from '../../utils/format';

import { Card } from '../ui/Card';
import { Chip } from '../ui/Chip';
import { Button } from '../ui/Button';
import { UserAvatar } from '../ui/UserAvatar';
import { LeaderboardSkeleton } from '../skeletons/LeaderboardSkeleton';

export interface LeaderboardSubTabProps {
  type?: 'rooka' | 'quests';
  onSwitchType?: (type: 'rooka' | 'quests') => void;
  scrollX?: SharedValue<number>;
  loading?: boolean;
  rookaLeaderboard?: LeaderboardEntry[];
  questLeaderboard?: LeaderboardEntry[];
  hasAccess?: boolean;
  onOpenAthleteProfile?: (userId: number | string) => void;
  showSwitcher?: boolean;
}

export const LeaderboardSubTab: React.FC<LeaderboardSubTabProps> = ({
  type,
  onSwitchType,
  loading: controlledLoading,
  rookaLeaderboard: controlledRooka,
  questLeaderboard: controlledQuests,
  hasAccess: controlledHasAccess,
  onOpenAthleteProfile,
  showSwitcher = true,
}) => {
  const theme = useTheme();
  const { user } = useUser();
  const { language, t } = useLanguage();
  const router = useRouter();
  const reducedMotion = useReducedMotion();

  const [internalActiveTab, setInternalActiveTab] = useState<'rooka' | 'quests'>('rooka');
  const [internalLoading, setInternalLoading] = useState<boolean>(true);
  const [internalRookaLeaderboard, setInternalRookaLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [internalQuestLeaderboard, setInternalQuestLeaderboard] = useState<LeaderboardEntry[]>([]);

  const isControlled = type !== undefined;
  const currentType = type ?? internalActiveTab;
  const hasAccess = controlledHasAccess !== undefined ? controlledHasAccess : canAccessLeaderboard(user?.subscription_tier);
  const loading = controlledLoading !== undefined ? controlledLoading : internalLoading;
  const rookaLeaderboard = controlledRooka ?? internalRookaLeaderboard;
  const questLeaderboard = controlledQuests ?? internalQuestLeaderboard;

  useEffect(() => {
    if (isControlled) return;
    if (!hasAccess) {
      setInternalLoading(false);
      return;
    }

    let isMounted = true;
    socialApi
      .getLeaderboard()
      .then((res) => {
        if (!isMounted) return;
        if (res?.leaderboard && Array.isArray(res.leaderboard)) {
          setInternalRookaLeaderboard(res.leaderboard.map((item, idx) => ({ ...item, rank: idx + 1 })));
        }
        if (res?.questLeaderboard && Array.isArray(res.questLeaderboard)) {
          setInternalQuestLeaderboard(res.questLeaderboard.map((item, idx) => ({ ...item, rank: idx + 1 })));
        }
      })
      .catch((err) => console.log('Leaderboard fetch error:', err))
      .finally(() => {
        if (isMounted) setInternalLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [hasAccess, isControlled]);

  const activeList = currentType === 'rooka' ? rookaLeaderboard : questLeaderboard;

  const handleTabSwitch = (newType: 'rooka' | 'quests') => {
    Haptics.selectionAsync();
    if (onSwitchType) {
      onSwitchType(newType);
    } else {
      setInternalActiveTab(newType);
    }
  };

  if (!hasAccess) {
    return (
      <Card variant="default" padding={24} className="items-center justify-center mt-4">
        <Ionicons name="lock-closed-outline" size={44} color={theme.tint} />
        <Text className="text-lg font-bold text-theme-text mt-3 text-center">
          {t('social.lockedLeaderboard')}
        </Text>
        <Text className="text-xs text-theme-muted mt-2 text-center leading-relaxed font-rajdhani max-w-[280px]">
          {t('social.lockedLeaderboardSub')}
        </Text>
        <Button
          variant="primary"
          size="md"
          label={t('account.upgradeToRookaPlus')}
          className="mt-5"
          onPress={() => router.navigate({ pathname: '/profile', params: { subtab: 'account' } })}
        />
      </Card>
    );
  }

  // Top 3 for Podium
  const hasPodium = activeList.length >= 3;
  const top1 = activeList.find((a) => a.rank === 1) || activeList[0];
  const top2 = activeList.find((a) => a.rank === 2) || activeList[1];
  const top3 = activeList.find((a) => a.rank === 3) || activeList[2];

  // List rows (from rank 4 if podium exists, otherwise all)
  const listRows = hasPodium ? activeList.slice(3) : activeList;

  // Signed-in user lookup
  const currentUserIndex = activeList.findIndex((item) =>
    user?.id ? item.user_id === user.id : item.username === user?.username
  );
  const currentUserEntry = currentUserIndex >= 0 ? activeList[currentUserIndex] : null;
  // If user is ranked beyond rank 10, pin a sticky copy
  const isUserOffscreen = currentUserIndex >= 10;

  return (
    <View className="gap-y-3 pb-8">
      {/* SECOND-LEVEL FILTER CHIPS: Rooka score | 7-Day Quests */}
      {showSwitcher && (
        <View className="flex-row items-center gap-x-2 mb-1">
          <Chip
            variant={currentType === 'rooka' ? 'accent' : 'neutral'}
            size="md"
            label={t('social.rookaScoreChip')}
            onPress={() => handleTabSwitch('rooka')}
          />
          <Chip
            variant={currentType === 'quests' ? 'accent' : 'neutral'}
            size="md"
            label={t('social.questsChip')}
            onPress={() => handleTabSwitch('quests')}
          />
        </View>
      )}

      {loading ? (
        <LeaderboardSkeleton count={6} />
      ) : (
        <>
          {/* TOP 3 PODIUM */}
          {hasPodium && top1 && top2 && top3 && (
            <View className="pt-4 pb-2 mb-2">
              <View className="flex-row items-end justify-center gap-x-3">
                {/* 2ND PLACE (SILVER) */}
                <Animated.View
                  entering={reducedMotion ? undefined : FadeInDown.delay(40).springify().damping(18)}
                  className="flex-1 items-center"
                >
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => top2 && onOpenAthleteProfile?.(top2.user_id)}
                    className="items-center w-full"
                  >
                    <UserAvatar
                      size={56}
                      photoUrl={top2.profile_picture_url}
                      userId={top2.user_id}
                      name={top2.username}
                      ringColor="#A8B0BA"
                      ringWidth={3}
                      badgeText="#2"
                      badgeBg="#A8B0BA"
                      badgeTextColor="#0F172A"
                    />
                    <Text className="text-xs font-bold text-theme-text text-center mt-2.5 max-w-[84px]" numberOfLines={1}>
                      {top2.username}
                    </Text>
                    <Text className="text-sm font-bold font-rajdhani text-theme-accent text-center tabular-nums">
                      {currentType === 'rooka' ? Math.round(top2.total_rooka_score || 0) : ((top2 as any).completed_quests_count ?? top2.quests_completed_7d ?? 0)}
                    </Text>

                    {/* Column Base Block */}
                    <View className="w-full h-14 bg-theme-inset rounded-t-inset items-center justify-center mt-2">
                      <Text className="text-lg font-bold font-rajdhani text-theme-muted">2</Text>
                    </View>
                  </TouchableOpacity>
                </Animated.View>

                {/* 1ST PLACE (GOLD - RAISED BY 24PT) */}
                <Animated.View
                  entering={reducedMotion ? undefined : FadeInDown.springify().damping(16)}
                  className="flex-1 items-center -mt-6 z-10"
                >
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => top1 && onOpenAthleteProfile?.(top1.user_id)}
                    className="items-center w-full"
                  >
                    <UserAvatar
                      size={72}
                      photoUrl={top1.profile_picture_url}
                      userId={top1.user_id}
                      name={top1.username}
                      ringColor="#E5A50A"
                      ringWidth={3}
                      badgeText="#1"
                      badgeBg="#E5A50A"
                      badgeTextColor="#0F172A"
                    />
                    <Text className="text-sm font-bold text-theme-text text-center mt-2.5 max-w-[96px]" numberOfLines={1}>
                      {top1.username}
                    </Text>
                    <Text className="text-base font-bold font-rajdhani text-theme-accent text-center tabular-nums">
                      {currentType === 'rooka' ? Math.round(top1.total_rooka_score || 0) : ((top1 as any).completed_quests_count ?? top1.quests_completed_7d ?? 0)}
                    </Text>

                    {/* Raised Column Base Block */}
                    <View className="w-full h-20 bg-theme-inset rounded-t-inset items-center justify-center mt-2">
                      <Text className="text-2xl font-bold font-rajdhani text-theme-text">1</Text>
                    </View>
                  </TouchableOpacity>
                </Animated.View>

                {/* 3RD PLACE (BRONZE) */}
                <Animated.View
                  entering={reducedMotion ? undefined : FadeInDown.delay(80).springify().damping(18)}
                  className="flex-1 items-center"
                >
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => top3 && onOpenAthleteProfile?.(top3.user_id)}
                    className="items-center w-full"
                  >
                    <UserAvatar
                      size={56}
                      photoUrl={top3.profile_picture_url}
                      userId={top3.user_id}
                      name={top3.username}
                      ringColor="#C97B45"
                      ringWidth={3}
                      badgeText="#3"
                      badgeBg="#C97B45"
                      badgeTextColor="#FFFFFF"
                    />
                    <Text className="text-xs font-bold text-theme-text text-center mt-2.5 max-w-[84px]" numberOfLines={1}>
                      {top3.username}
                    </Text>
                    <Text className="text-sm font-bold font-rajdhani text-theme-accent text-center tabular-nums">
                      {currentType === 'rooka' ? Math.round(top3.total_rooka_score || 0) : ((top3 as any).completed_quests_count ?? top3.quests_completed_7d ?? 0)}
                    </Text>

                    {/* Column Base Block */}
                    <View className="w-full h-10 bg-theme-inset rounded-t-inset items-center justify-center mt-2">
                      <Text className="text-base font-bold font-rajdhani text-theme-muted">3</Text>
                    </View>
                  </TouchableOpacity>
                </Animated.View>
              </View>
            </View>
          )}

          {/* LIST ROWS (RANK 4+ OR ALL ROWS IF NO PODIUM) */}
          <View className="gap-y-2">
            {listRows.map((item) => {
              const isCurrentUser = user?.id ? (item.user_id === user.id || (item as any).id === user.id) : item.username === user?.username;
              const questsCount = (item as any).completed_quests_count ?? item.quests_completed_7d ?? 0;
              const scoreVal = currentType === 'rooka' ? Math.round(item.total_rooka_score || 0) : questsCount;

              return (
                <TouchableOpacity
                  key={`rank-${item.user_id || item.rank}-${currentType}`}
                  activeOpacity={0.75}
                  onPress={() => {
                    const athleteTargetId = item.user_id || (item as any).id;
                    if (athleteTargetId && onOpenAthleteProfile) {
                      onOpenAthleteProfile(athleteTargetId);
                    }
                  }}
                >
                  <Card
                    variant={isCurrentUser ? 'accent' : 'default'}
                    padding={12}
                    className="flex-row justify-between items-center h-16"
                  >
                    <View className="flex-row items-center gap-x-3 flex-1 pr-2">
                      {/* 32pt Rank Circle */}
                      <View
                        className={`w-8 h-8 rounded-full items-center justify-center ${
                          item.rank === 1
                            ? 'bg-amber-400'
                            : item.rank === 2
                            ? 'bg-slate-300 dark:bg-slate-600'
                            : item.rank === 3
                            ? 'bg-amber-700'
                            : 'bg-theme-bg border border-theme-border'
                        }`}
                      >
                        <Text
                          className={`text-xs font-bold font-rajdhani ${
                            item.rank <= 3 && !hasPodium ? 'text-slate-950' : 'text-theme-muted'
                          }`}
                        >
                          #{item.rank}
                        </Text>
                      </View>

                      {/* 40pt Avatar */}
                      <UserAvatar
                        size={40}
                        photoUrl={item.profile_picture_url}
                        userId={item.user_id}
                        name={item.username}
                      />

                      {/* Athlete Identity */}
                      <View className="flex-1">
                        <View className="flex-row items-center gap-x-1.5 flex-wrap">
                          <Text className="text-sm font-bold text-theme-text" numberOfLines={1}>
                            {item.username}
                          </Text>
                          {isCurrentUser && (
                            <Chip variant="accent" size="sm" label={t('common.you')} />
                          )}
                        </View>
                        <Text className="text-xs text-theme-muted font-medium font-rajdhani mt-0.5">
                          {t('uiExtra.lvl', { level: isCurrentUser ? (user?.level || item.rooka_level || 1) : (item.rooka_level || 1) })} · {pluralize('quest', questsCount, language)}
                        </Text>
                      </View>
                    </View>

                    {/* Metric */}
                    <View className="items-end pl-2">
                      <Text className="text-base font-bold text-theme-accent font-rajdhani tabular-nums">
                        {scoreVal}
                      </Text>
                      <Text className="text-[10px] text-theme-muted font-semibold uppercase tracking-wider">
                        {currentType === 'rooka' ? t('common.points') : t('social.quests')}
                      </Text>
                    </View>
                  </Card>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* STICKY BOTTOM PINNED CURRENT USER ROW IF OFFSCREEN (> rank 10) */}
          {isUserOffscreen && currentUserEntry && (
            <View className="mt-2 pt-2 border-t border-theme-border">
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => onOpenAthleteProfile?.(currentUserEntry.user_id || (currentUserEntry as any).id)}
              >
                <Card
                  variant="accent"
                  padding={12}
                  className="flex-row justify-between items-center h-16 shadow-md"
                >
                  <View className="flex-row items-center gap-x-3 flex-1 pr-2">
                    <View className="w-8 h-8 rounded-full items-center justify-center bg-theme-accent-soft border border-theme-accent">
                      <Text className="text-xs font-bold font-rajdhani text-theme-accent-text">
                        #{currentUserEntry.rank}
                      </Text>
                    </View>

                    <UserAvatar
                      size={40}
                      photoUrl={currentUserEntry.profile_picture_url}
                      userId={currentUserEntry.user_id || (currentUserEntry as any).id}
                      name={currentUserEntry.username}
                    />

                    <View className="flex-1">
                      <View className="flex-row items-center gap-x-1.5">
                        <Text className="text-sm font-bold text-theme-text" numberOfLines={1}>
                          {currentUserEntry.username}
                        </Text>
                        <Chip variant="accent" size="sm" label={t('common.you')} />
                      </View>
                      <Text className="text-xs text-theme-muted font-medium font-rajdhani mt-0.5">
                        {t('uiExtra.lvl', { level: user?.level || currentUserEntry.rooka_level || 1 })} · {pluralize('quest', (currentUserEntry as any).completed_quests_count ?? currentUserEntry.quests_completed_7d ?? 0, language)}
                      </Text>
                    </View>
                  </View>

                  <View className="items-end pl-2">
                    <Text className="text-base font-bold text-theme-accent font-rajdhani tabular-nums">
                      {currentType === 'rooka'
                        ? Math.round(currentUserEntry.total_rooka_score || 0)
                        : (currentUserEntry as any).completed_quests_count ?? currentUserEntry.quests_completed_7d ?? 0}
                    </Text>
                    <Text className="text-[10px] text-theme-muted font-semibold uppercase tracking-wider">
                      {currentType === 'rooka' ? t('common.points') : t('social.quests')}
                    </Text>
                  </View>
                </Card>
              </TouchableOpacity>
            </View>
          )}

          {/* EMPTY / ADD ATHLETES CALLOUT (< 10 athletes) */}
          {activeList.length < 10 && (
            <Card variant="default" padding={20} className="mt-3 items-center">
              <Ionicons name="people-outline" size={32} color={theme.tint} />
              <Text className="text-sm font-bold text-theme-text mt-2.5 text-center">
                {activeList.length === 0 ? t('social.noOneOnBoard') : t('social.leaderboardNeedsRivals')}
              </Text>
              <Text className="text-xs text-theme-muted mt-1 text-center max-w-[280px] leading-relaxed">
                {t('social.connectToSeeWeek')}
              </Text>
              <Button
                variant="secondary"
                size="md"
                label={t('social.findAthletes')}
                className="mt-3.5"
                onPress={() => router.navigate({ pathname: '/profile', params: { subtab: 'connections' } })}
              />
            </Card>
          )}
        </>
      )}
    </View>
  );
};
