import React, { useState } from 'react';
import { useTheme } from '@/hooks/use-theme';
import { View, Text, TouchableOpacity } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';

import { Card } from '../ui/Card';
import { Chip } from '../ui/Chip';
import { Button } from '../ui/Button';
import { LevelProgress } from '../ui/LevelProgress';
import { AthleteRadarChart } from './AthleteRadarChart';
import { SeasonRoadmapCard } from '../dashboard/SeasonRoadmapCard';
import { BottomSheetModal, BottomSheetHeader } from '../ui/BottomSheetModal';
import { ActiveQuestSkeleton } from '../skeletons/ActiveQuestSkeleton';

import { useUser } from '../../context/UserStore';
import { useActivities } from '../../context/ActivityStore';
import { usePhysique } from '../../context/PhysiqueStore';
import { useGamification } from '../../context/GamificationStore';
import { useSeasonGoal } from '../../hooks/use-season-goal';
import { useLanguage } from '../../context/LanguageContext';
import { canAccessQuests } from '../../utils/permissions';
import { getRookaLevelInfo } from '../../utils/gamification';
import { calculateAthleteArchetype, ArchetypeData } from '../../utils/archetypeUtils';

interface OverviewSubTabProps {
  onOpenNutrition?: () => void;
  archetypeData?: ArchetypeData;
}

export const OverviewSubTab: React.FC<OverviewSubTabProps> = ({
  onOpenNutrition,
  archetypeData: customArchetypeData,
}) => {
  const theme = useTheme();
  const { t } = useLanguage();
  const { user } = useUser();
  const { activities } = useActivities();
  const { nutrition } = usePhysique();
  const { quests, loading: gamificationLoading, generateQuest: generateNewQuest, swapQuest: swapActiveQuest } = useGamification();
  const { hasSeasonGoal, seasonInfo } = useSeasonGoal();

  const [isQuestModalOpen, setIsQuestModalOpen] = useState(false);
  const [questActionLoading, setQuestActionLoading] = useState(false);

  const activeQuest = quests?.find((q) => q.status === 'active') || null;
  const currentVal = activeQuest
    ? Math.round(activeQuest.current_value !== undefined ? activeQuest.current_value : (activeQuest.progress || 0))
    : 0;
  const targetVal = activeQuest ? Math.round(activeQuest.target_value || 1) : 1;
  const progressPercent = activeQuest
    ? (activeQuest.progress_percent !== undefined
        ? activeQuest.progress_percent
        : Math.min(100, Math.round((currentVal / targetVal) * 100)))
    : 0;

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
      console.error('Generate quest error in OverviewSubTab:', err);
    } finally {
      setQuestActionLoading(false);
    }
  };

  const activitiesTotalRooka = Math.round(
    activities.reduce((sum, a) => sum + (a.rooka_score || 0), 0)
  );
  const effectiveTotalRooka = Math.round((user?.total_rooka && user.total_rooka > 0)
    ? user.total_rooka
    : activitiesTotalRooka);

  const computedArchetype = calculateAthleteArchetype(activities, user?.athlete_metrics);
  const activeArchetypeData = customArchetypeData || computedArchetype;
  const activeArchetypeTitle = customArchetypeData?.title || computedArchetype.title;
  const hasArchetypeData = Boolean(customArchetypeData) || (activities?.length ?? 0) > 0;

  return (
    <View className="gap-y-4">
      {/* 1. ATHLETE LEVEL & XP PROGRESS CARD */}
      <Card className="bg-theme-card">
        <LevelProgress totalRooka={effectiveTotalRooka} levelTitle={t('dashboard.sparkLevel') || 'Athlete Level'} />
      </Card>

      {/* 2. ATHLETE ARCHETYPE RADAR CARD */}
      <Card className="bg-theme-card p-6">
        <View className="flex-row items-center justify-between mb-3">
          <Text className="text-xs font-bold text-theme-muted uppercase tracking-wider">
            {t('dashboard.athleteArchetype')}
          </Text>
          {hasArchetypeData && (
            <View className="px-2.5 py-1 bg-theme-accent/15 rounded-full">
              <Text className="text-xs font-bold text-theme-accent">{activeArchetypeTitle}</Text>
            </View>
          )}
        </View>

        {hasArchetypeData ? (
          <>
            <AthleteRadarChart data={activeArchetypeData} size={260} />
            {activeArchetypeData.description ? (
              <View className="mt-3 pt-3 border-t border-theme-border/40">
                <Text className="text-xs text-theme-muted text-center leading-relaxed">
                  {activeArchetypeData.description}
                </Text>
              </View>
            ) : null}
          </>
        ) : (
          <View className="items-center justify-center py-8 px-4">
            <Ionicons name="analytics-outline" size={34} color={theme.textSecondary} />
            <Text className="text-theme-text font-bold text-base mt-3 text-center">
              {t('progress.noSessionsYet', 'No sessions yet')}
            </Text>
            <Text className="text-theme-muted text-xs mt-1.5 text-center leading-relaxed">
              {t('progress.noSessionsSubtitle', 'Log or sync a workout and your athlete profile will build itself from what you actually train.')}
            </Text>
          </View>
        )}
      </Card>

      {/* 3. SEASON ROADMAP CARD */}
      {hasSeasonGoal && seasonInfo && (
        <Card className="p-4 md:p-5">
          <SeasonRoadmapCard info={seasonInfo} />
        </Card>
      )}

      {/* 4. FUELING & NUTRITION PREVIEW CARD */}
      <Card className="bg-theme-card p-4">
        <View className="flex-row items-center justify-between mb-3">
          <View className="flex-row items-center gap-x-2">
            <Ionicons name="nutrition-outline" size={16} color={theme.tint} />
            <Text className="text-xs font-bold text-theme-muted uppercase tracking-wider">
              {t('progress.fuelingNutrition', 'Fueling & Nutrition')}
            </Text>
          </View>
          {onOpenNutrition && (
            <Button
              variant="ghost"
              size="sm"
              label={t('progress.viewPlan', 'View Plan')}
              rightIcon={<Ionicons name="chevron-forward" size={14} color="#0EA5E9" />}
              onPress={onOpenNutrition}
            />
          )}
        </View>

        {nutrition ? (
          <View className="flex-row items-center justify-between bg-theme-inset rounded-inset p-3">
            <View className="items-center flex-1">
              <Text className="text-lg font-bold font-rajdhani text-theme-text">
                {nutrition.carbsTarget || nutrition.proteinTarget || nutrition.fatTarget
                  ? Math.round((nutrition.carbsTarget || 0) * 4 + (nutrition.proteinTarget || 0) * 4 + (nutrition.fatTarget || 0) * 9)
                  : '—'}
              </Text>
              <Text className="text-[10px] text-theme-muted uppercase font-bold">kcal</Text>
            </View>
            <View className="w-px h-6 bg-theme-border/60" />
            <View className="items-center flex-1">
              <Text className="text-lg font-bold font-rajdhani text-theme-text">
                {nutrition.carbsTarget ? Math.round(nutrition.carbsTarget) : (nutrition.carbs ? Math.round(nutrition.carbs) : '—')}g
              </Text>
              <Text className="text-[10px] text-theme-muted uppercase font-bold">{t('dashboard.carbs', 'Carbs')}</Text>
            </View>
            <View className="w-px h-6 bg-theme-border/60" />
            <View className="items-center flex-1">
              <Text className="text-lg font-bold font-rajdhani text-theme-text">
                {nutrition.proteinTarget ? Math.round(nutrition.proteinTarget) : (nutrition.protein ? Math.round(nutrition.protein) : '—')}g
              </Text>
              <Text className="text-[10px] text-theme-muted uppercase font-bold">{t('dashboard.protein', 'Protein')}</Text>
            </View>
            <View className="w-px h-6 bg-theme-border/60" />
            <View className="items-center flex-1">
              <Text className="text-lg font-bold font-rajdhani text-theme-text">
                {nutrition.fatTarget ? Math.round(nutrition.fatTarget) : (nutrition.fat ? Math.round(nutrition.fat) : '—')}g
              </Text>
              <Text className="text-[10px] text-theme-muted uppercase font-bold">{t('dashboard.fat', 'Fat')}</Text>
            </View>
          </View>
        ) : (
          <View className="bg-theme-inset rounded-inset p-3 items-center">
            <Text className="text-xs text-theme-muted">{t('progress.nutritionConfigureHint', 'Daily AI nutrition targets ready to configure.')}</Text>
          </View>
        )}
      </Card>

      {/* 5. WEEKLY QUESTS CARD */}
      {canAccessQuests(user?.subscription_tier) && (
        <Card className="bg-theme-card">
          <View className="flex-row items-center gap-x-2 mb-3">
            <View className="w-2.5 h-2.5 rounded-full bg-theme-accent" />
            <Text className="text-xs font-bold text-theme-muted">
              {t('dashboard.questsLog')}
            </Text>
          </View>

          {gamificationLoading && (!quests || quests.length === 0) ? (
            <ActiveQuestSkeleton variant="full" />
          ) : activeQuest ? (
            <Animated.View
              key={`active-${activeQuest.id || 'quest'}`}
              entering={FadeIn.duration(200)}
              exiting={FadeOut.duration(150)}
              layout={LinearTransition.duration(200)}
            >
              <TouchableOpacity
                onPress={() => {
                  Haptics.selectionAsync();
                  setIsQuestModalOpen(true);
                }}
                activeOpacity={0.8}
                className="bg-theme-bg/70 rounded-xl p-4"
              >
                <View className="flex-row justify-between items-start mb-1">
                  <Text className="text-sm font-bold text-theme-text flex-1 mr-2" numberOfLines={2}>
                    {activeQuest.description || 'Active Weekly Quest'}
                  </Text>
                  <Chip
                    variant="points"
                    size="sm"
                    label={Math.round(activeQuest.reward_points || 0)}
                  />
                </View>

                <View className="flex-row justify-between items-center mt-2 mb-1">
                  <Text className="text-xs text-theme-muted">{t('common.status', 'Progress')}</Text>
                  <Text className="text-xs font-bold text-theme-text">
                    {currentVal} / {targetVal} {activeQuest.unit || ''}
                  </Text>
                </View>

                <View className="h-1.5 w-full bg-theme-border/40 rounded-full overflow-hidden mt-1">
                  <View
                    style={{ width: `${progressPercent}%`, backgroundColor: theme.tint }}
                    className="h-full rounded-full"
                  />
                </View>
              </TouchableOpacity>
            </Animated.View>
          ) : (
            <View className="items-center py-4 bg-theme-bg/70 rounded-xl px-4">
              <Text className="text-sm text-theme-muted text-center mb-3">
                {t('progress.noActiveQuest', 'No active quest right now. Generate one to earn bonus Rooka points!')}
              </Text>
              <Button
                size="sm"
                label={questActionLoading ? t('progress.generating', 'Generating...') : t('progress.generateQuest', 'Generate Quest')}
                disabled={questActionLoading}
                onPress={handleGenerateQuest}
              />
            </View>
          )}
        </Card>
      )}

      {/* QUEST MODAL */}
      <BottomSheetModal
        visible={isQuestModalOpen}
        onClose={() => setIsQuestModalOpen(false)}
        showHandle
        header={
          <View className="mb-2">
            <Text className="text-lg font-bold text-theme-text">{t('progress.weeklyQuestDetails', 'Weekly Quest Details')}</Text>
          </View>
        }
      >
        <View className="pb-6">
          {activeQuest && (
            <>
              <Text className="text-sm text-theme-muted mb-4">{activeQuest.description}</Text>
              <View className="bg-theme-inset rounded-inset p-3 mb-4">
                <Text className="text-xs text-theme-muted">{t('progress.reward', 'Reward')}</Text>
                <Text className="text-xl font-bold font-rajdhani text-theme-accent">
                  +{Math.round(activeQuest.reward_points || 0)} {t('progress.rookaPoints', 'Rooka Points')}
                </Text>
              </View>
            </>
          )}
          <Button
            variant="ghost"
            label={t('progress.swapQuest', 'Swap for New Quest')}
            isLoading={questActionLoading}
            onPress={handleGenerateQuest}
          />
        </View>
      </BottomSheetModal>
    </View>
  );
};
