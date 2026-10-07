import { Ionicons } from '@expo/vector-icons';
import { RookaMark } from '../ui/RookaPoints';
import { BrandColors, Colors } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import * as Haptics from 'expo-haptics';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { useActivities } from '../../context/ActivityStore';
import { usePlan } from '../../context/PlanStore';
import { useGamification } from '../../context/GamificationStore';
import { useUser } from '../../context/UserStore';
import { Activity } from '../../types/activity';
import { calculateActivityStreak } from '../../utils/gamification';
import { BottomSheetModal, BottomSheetHeader } from '../ui/BottomSheetModal';
import { Chip } from '../ui/Chip';
import { SportMedallion } from '../ui/SportMedallion';
import { ActiveQuestSkeleton } from '../skeletons/ActiveQuestSkeleton';
import { EmptyState } from '../ui/EmptyState';
import { StatValue } from '../ui/StatValue';
import { getPaceParts } from '../../utils/paceFormat';
import { formatClock, formatDuration, formatRelativeDayAndTime } from '../../utils/format';
import { useLanguage } from '../../context/LanguageContext';
import { useSubscription } from '../../context/SubscriptionStore';
import { canAccessQuests } from '../../utils/permissions';
import { PAYWALL_RESULT } from 'react-native-purchases-ui';
import { useRouter } from 'expo-router';

interface MyLogSubTabProps {
  onOpenActivityModal?: (id: string | number, activity?: Partial<Activity>) => void;
}


function CircularProgressChamber({
  progress = 0.75,
  icon,
  iconColor = BrandColors.primary,
  size = 54,
  strokeWidth = 3,
}: {
  progress?: number;
  icon: string;
  iconColor?: string;
  size?: number;
  strokeWidth?: number;
}) {
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - Math.min(1, Math.max(0.04, progress)) * circumference;

  return (
    <View
      style={{ width: size, height: size }}
      className="rounded-full items-center justify-center bg-slate-200/50 dark:bg-white/[0.08] border border-slate-300/60 dark:border-white/15 relative"
    >
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="rgba(148, 163, 184, 0.2)"
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={iconColor}
          strokeWidth={strokeWidth}
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          fill="none"
        />
      </Svg>
      <Ionicons name={icon as any} size={20} color={iconColor} />
    </View>
  );
}



export const MyLogSubTab: React.FC<MyLogSubTabProps> = ({ onOpenActivityModal }) => {
  const theme = useTheme();
  const { user } = useUser();
  const { presentPaywall } = useSubscription();
  const router = useRouter();
  const hasQuestAccess = canAccessQuests(user?.subscription_tier);
  const { activities, loading } = useActivities();
  const { t, language } = useLanguage();
  const { quests, loading: gamificationLoading, generateQuest: generateNewQuest, swapQuest: swapActiveQuest } = useGamification();

  const [isQuestModalOpen, setIsQuestModalOpen] = useState(false);
  const [questActionLoading, setQuestActionLoading] = useState(false);

  const activeQuest = quests?.find((q) => q.status === 'active') || null;
  const currentProgress = activeQuest
    ? Math.round(activeQuest.current_value !== undefined ? activeQuest.current_value : (activeQuest.progress || 0))
    : 0;
  const targetVal = activeQuest ? Math.round(activeQuest.target_value || 1) : 1;
  const questProgressPercent = activeQuest
    ? (activeQuest.progress_percent !== undefined
        ? activeQuest.progress_percent
        : Math.min(100, Math.round((currentProgress / targetVal) * 100)))
    : 0;

  // Real Streak Calculation
  const visibleActivities = useMemo(() => {
    return activities.filter((a) => !(a as any).is_hidden && ((a as any).is_hidden !== 1));
  }, [activities]);

  const { plan } = usePlan();
  const realStreak = useMemo(() => {
    return calculateActivityStreak(visibleActivities, plan);
  }, [visibleActivities, plan]);

  const handleGenerateQuest = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setQuestActionLoading(true);
    try {
      if (activeQuest) {
        await swapActiveQuest(activeQuest.id);
      } else {
        await generateNewQuest();
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      console.error('Generate quest error in MyLog:', err);
    } finally {
      setQuestActionLoading(false);
    }
  };

  return (
    <View className="gap-y-5 pb-6">
      {/* SECTION 1: GOAL CRUSHER CARDS */}
      <View>
        <View className="flex-row justify-between items-center mb-3 px-0.5">
          <Text className="text-lg font-extrabold text-theme-text tracking-tight">
            {t('questUi.quests')}
          </Text>
          {hasQuestAccess && (
            <Text className="text-xs font-semibold text-theme-muted">
              {t('common.active')}
            </Text>
          )}
        </View>

        {/* 2-CARD FROSTED GLASS ROW */}
        <View className="flex-row gap-3">
          {/* CARD 1: ACTIVE QUEST */}
          {!hasQuestAccess ? (
          // Quests are a Rooka+ feature: free athletes see an unlock card instead
          <TouchableOpacity
            onPress={async () => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              const res = await presentPaywall();
              if (res === PAYWALL_RESULT.NOT_PRESENTED || res === PAYWALL_RESULT.ERROR) {
                router.navigate({ pathname: '/profile', params: { subtab: 'account' } });
              }
            }}
            activeOpacity={0.8}
            accessibilityRole="button"
            className="flex-1 bg-theme-card/90 dark:bg-white/[0.06] border border-theme-border dark:border-white/[0.1] rounded-card p-4 justify-center items-center h-[152px] shadow-xs"
          >
            <Ionicons name="lock-closed-outline" size={24} color={theme.tint} />
            <Text className="text-xs font-bold text-theme-text mt-2 text-center">
              {t('progress.weeklyQuests', 'Weekly quests')}
            </Text>
            <View className="mt-3 px-3 py-1.5 bg-theme-accent/15 rounded-lg">
              <Text className="text-[11px] font-bold text-theme-accent">
                {t('profile.includedWithRookaPlus', 'Unlock with Rooka+')}
              </Text>
            </View>
          </TouchableOpacity>
          ) : gamificationLoading && (!quests || quests.length === 0) ? (
            <ActiveQuestSkeleton variant="tile" />
          ) : activeQuest ? (
            <TouchableOpacity
            onPress={() => {
              Haptics.selectionAsync();
              setIsQuestModalOpen(true);
            }}
            activeOpacity={0.8}
            className="flex-1 bg-theme-card/90 dark:bg-white/[0.06] border border-theme-border dark:border-white/[0.1] rounded-card p-4 justify-between h-[152px] shadow-xs"
          >
            <View>
              <Text className="text-xs font-semibold text-theme-muted dark:text-theme-muted">
                {t('questUi.activeQuest')}
              </Text>
              <Text className="text-xl font-extrabold text-theme-text tracking-tight mt-0.5 font-mono">
                {`${currentProgress} / ${targetVal}`}
              </Text>
            </View>

            <View className="flex-row items-end justify-between">
              <View className="bg-slate-100 dark:bg-white/10 px-3 py-1 rounded-full border border-theme-border/80 dark:border-white/10">
                <Text className="text-xs font-bold text-theme-text font-mono">
                  {questProgressPercent}%
                </Text>
              </View>
              <CircularProgressChamber
                progress={questProgressPercent / 100}
                icon="trophy"
                iconColor={theme.tint}
              />
            </View>
          </TouchableOpacity>
          ) : (
          <TouchableOpacity
            onPress={handleGenerateQuest}
            disabled={questActionLoading}
            activeOpacity={0.8}
            className="flex-1 bg-theme-card/90 dark:bg-white/[0.06] border border-theme-border dark:border-white/[0.1] rounded-card p-4 justify-center items-center h-[152px] shadow-xs"
          >
            <Ionicons name="trophy-outline" size={26} color={theme.tint} />
            <Text className="text-xs font-bold text-theme-text mt-2 text-center">{t('questUi.noActiveQuest')}</Text>
            
            <View className="mt-3 px-3 py-1.5 bg-theme-accent rounded-lg flex-row items-center gap-1">
              {questActionLoading ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <>
                  <Ionicons name="add-circle-outline" size={14} color="white" />
                  <Text className="text-[10px] font-bold text-white uppercase">{t('questUi.start')}</Text>
                </>
              )}
            </View>
          </TouchableOpacity>
          )}

          {/* CARD 2: REAL STREAK */}
          <View className="flex-1 bg-theme-card/90 dark:bg-white/[0.06] border border-theme-border dark:border-white/[0.1] rounded-card p-4 justify-between h-[152px] shadow-xs">
            <View>
              <Text className="text-xs font-semibold text-theme-muted dark:text-theme-muted">
                {t('questUi.streak')}
              </Text>
              <Text className="text-xl font-extrabold text-theme-text tracking-tight mt-0.5 font-mono">
                {realStreak === 1 ? t('questUi.oneDay') : t('questUi.nDays', { count: realStreak })}
              </Text>
            </View>

            <View className="flex-row items-end justify-between">
              <View className="bg-slate-100 dark:bg-white/10 px-2.5 py-1 rounded-full border border-theme-border/80 dark:border-white/10">
                <Text className="text-xs font-bold text-theme-text">
                  {realStreak > 0 ? t('questUi.keepItUp') : t('questUi.startToday')}
                </Text>
              </View>
              <CircularProgressChamber
                progress={realStreak > 0 ? Math.min(1, realStreak / 7) : 0.05}
                icon="flame"
                iconColor={theme.tint}
              />
            </View>
          </View>
        </View>
      </View>

      {/* SECTION 2: RECENT ACTIVITIES LIST */}
      <View>
        <View className="flex-row justify-between items-center mb-3 px-0.5">
          <Text className="text-lg font-extrabold text-theme-text tracking-tight">
            {t('dashboard.recentActivities')}
          </Text>
          <Text className="text-xs font-semibold text-theme-muted">
            {t('questUi.totalCount', { count: visibleActivities.length })}
          </Text>
        </View>

        {/* Activity List Items */}
        {loading && visibleActivities.length === 0 ? (
          <View className="items-center justify-center p-8 bg-theme-card/80 dark:bg-white/[0.06] border border-theme-border dark:border-white/[0.1] rounded-card">
            <ActivityIndicator size="large" color={theme.tint} />
            <Text className="text-xs font-bold text-theme-muted mt-3">{t('questUi.loadingActivities')}</Text>
          </View>
        ) : visibleActivities.length === 0 ? (
          <EmptyState
            preset="no-activity"
            badge={t('questUi.historyBadge')}
            title={t('questUi.noWorkoutsTitle')}
            subtitle={t('questUi.noWorkoutsSubtitle')}
          />
        ) : (
          <View className="gap-y-2.5">
            {visibleActivities.map((act) => {
              const idStr = String(act.id);
              const dateStr = act.start_date ? formatRelativeDayAndTime(act.start_date, language) : '';
              const hasDistance = typeof act.distance_km === 'number' && act.distance_km > 0;
              const movingSec =
                typeof (act as any).moving_time_s === 'number' && (act as any).moving_time_s > 0
                  ? (act as any).moving_time_s
                  : typeof act.moving_time === 'number' && act.moving_time > 0
                  ? act.moving_time
                  : (act.moving_time_min || 0) * 60;
              const paceParts = getPaceParts(
                act.distance_km,
                movingSec,
                act.sport_type,
                act.name || (act as any).title,
                true
              );

              // Same layout as the Social feed card: title + date, then labelled stats
              return (
                <TouchableOpacity
                  key={`act-${idStr}`}
                  onPress={() => onOpenActivityModal && onOpenActivityModal(act.id, act)}
                  activeOpacity={0.75}
                  className="bg-theme-card/90 dark:bg-white/[0.06] border border-theme-border dark:border-white/[0.1] rounded-card p-3.5 mb-2.5 shadow-xs"
                >
                  <View className="flex-row items-center">
                    <SportMedallion sport={act.sport_type || act.type} size={40} className="mr-3.5" />
                    <View className="flex-1">
                      <Text className="text-base font-bold text-theme-text" numberOfLines={1}>
                        {act.name || act.sport_type || t('activityDetail.workout')}
                      </Text>
                      <Text className="text-xs font-medium text-theme-muted mt-0.5">
                        {dateStr}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
                  </View>

                  {hasDistance ? (
                    <View className="flex-row justify-between items-start pt-3">
                      <View className="flex-1">
                        <StatValue
                          label={t('social.distance', 'DISTANCE')}
                          labelPosition="bottom"
                          value={act.distance_km!.toFixed(1)}
                          unit="km"
                          size="md"
                          align="left"
                        />
                      </View>
                      <View className="flex-1 items-center">
                        <StatValue
                          label={t('social.time', 'TIME')}
                          labelPosition="bottom"
                          value={formatClock(movingSec)}
                          size="md"
                          align="center"
                        />
                      </View>
                      <View className="flex-1 items-end">
                        <StatValue
                          label={paceParts?.label || t('social.pace', 'PACE')}
                          labelPosition="bottom"
                          value={paceParts?.value || '--'}
                          unit={paceParts?.unit}
                          size="md"
                          align="right"
                        />
                      </View>
                    </View>
                  ) : (
                    <View className="flex-row justify-between items-start pt-3">
                      <View className="flex-1">
                        <StatValue
                          label={t('progress.duration', 'DURATION')}
                          labelPosition="bottom"
                          value={formatDuration(act.moving_time_min || 0)}
                          size="md"
                          align="left"
                        />
                      </View>
                      <View className="flex-1 items-end">
                        <StatValue
                          label={t('progress.effort', 'EFFORT')}
                          labelPosition="bottom"
                          value={`+${Math.round(act.rooka_score || act.tss || 0)}`}
                          size="md"
                          align="right"
                        />
                      </View>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>

      {/* Quest Detail BottomSheetModal */}
      <BottomSheetModal
        visible={isQuestModalOpen}
        onClose={() => setIsQuestModalOpen(false)}
        showHandle
        header={
          <View className="flex-row items-center justify-between mb-4">
            <View className="flex-row items-center gap-3">
              <View className="w-12 h-12 rounded-2xl bg-theme-accent/15 items-center justify-center">
                <Ionicons name="trophy" size={26} color={theme.tint} />
              </View>
              <View>
                <Text className="text-lg font-extrabold text-theme-text">{t('questUi.activeQuest')}</Text>
                <Text className="text-xs text-theme-muted font-bold">{t('questUi.weeklyChallenge')}</Text>
              </View>
            </View>
            {activeQuest?.reward_points ? (
              <Chip
                variant="points"
                size="md"
                label={Math.round(activeQuest.reward_points)}
              />
            ) : null}
          </View>
        }
      >

        <View className="bg-theme-bg p-4 rounded-2xl border border-theme-border/60 mb-5">
          <Text className="text-sm font-bold text-theme-text leading-relaxed font-rajdhani">
            {activeQuest?.description || t('coachExtra.questFallback')}
          </Text>
        </View>

        <View className="mb-6">
          <View className="flex-row justify-between items-center mb-2">
            <Text className="text-xs font-bold text-theme-muted">
              {t('questUi.progress', { current: currentProgress, target: targetVal })}
            </Text>
            <Text className="text-sm font-mono font-bold text-theme-accent">
              {questProgressPercent}%
            </Text>
          </View>
          <View className="w-full h-3 bg-theme-bg rounded-full overflow-hidden">
            <View
              className="h-full bg-theme-accent rounded-full"
              style={{ width: `${questProgressPercent}%` }}
            />
          </View>
        </View>

        <View className="flex-row gap-3">
          <TouchableOpacity
            onPress={handleGenerateQuest}
            disabled={questActionLoading}
            className="flex-1 py-3.5 bg-theme-bg border border-theme-border rounded-xl flex-row items-center justify-center gap-2"
          >
            {questActionLoading ? (
              <ActivityIndicator size="small" color={theme.tint} />
            ) : (
              <>
                <Ionicons name="refresh-outline" size={16} color={theme.textSecondary} />
                <Text className="text-xs font-bold text-theme-muted">{t('questUi.swapChallenge')}</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setIsQuestModalOpen(false)}
            className="flex-1 py-3.5 bg-theme-accent rounded-xl items-center justify-center"
          >
            <Text className="text-xs font-extrabold text-white">{t('common.gotIt')}</Text>
          </TouchableOpacity>
        </View>
      </BottomSheetModal>
    </View>
  );
};


