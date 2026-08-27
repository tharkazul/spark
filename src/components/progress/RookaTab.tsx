import React from 'react';
import { useTheme } from '@/hooks/use-theme';
import { View, Text, TouchableOpacity } from 'react-native';
import { Card } from '../ui/Card';
import { AthleteRadarChart } from './AthleteRadarChart';
import { PMCMetricsCard } from '../dashboard/PMCMetricsCard';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useUser } from '../../context/UserStore';
import { useActivities } from '../../context/ActivityStore';
import { usePhysique } from '../../context/PhysiqueStore';
import { canAccessQuests } from '../../utils/permissions';
import { getRookaLevelInfo } from '../../utils/gamification';
import { calculateAthleteArchetype, ArchetypeData } from '../../utils/archetypeUtils';
import { calculatePMCMetrics } from '../../utils/pmcUtils';
import { useLanguage } from '../../context/LanguageContext';

interface RookaTabProps {
  levelInfo?: {
    level: number;
    currentXp: number;
    nextLevelXp: number;
    progressPercent?: number;
  };
  archetypeData?: ArchetypeData;
}

export const RookaTab: React.FC<RookaTabProps> = ({
  levelInfo: customLevelInfo,
  archetypeData: customArchetypeData,
}) => {
    const theme = useTheme();
  const { t } = useLanguage();
  const { user } = useUser();
  const { activities } = useActivities();
  const { physiqueLogs } = usePhysique();

  const activitiesTotalRooka = Math.round(
    activities.reduce((sum, a) => sum + (a.rooka_score ?? a.tss ?? 0), 0)
  );
  const effectiveTotalRooka = Math.max(user?.total_rooka ?? 0, activitiesTotalRooka);
  const computedInfo = getRookaLevelInfo(effectiveTotalRooka);
  const activeLevelInfo = customLevelInfo || {
    level: computedInfo.level,
    currentXp: computedInfo.totalRooka,
    nextLevelXp: computedInfo.nextLevelThreshold,
    progressPercent: computedInfo.progressPercent,
  };

  const computedArchetype = calculateAthleteArchetype(activities, user?.athlete_metrics);
  const activeArchetypeData = customArchetypeData || computedArchetype;
  const activeArchetypeTitle = customArchetypeData?.title || computedArchetype.title;
  // The radar is only meaningful once there is something to shape it.
  const hasArchetypeData = Boolean(customArchetypeData) || (activities?.length ?? 0) > 0;

  const pmcMetrics = calculatePMCMetrics(
    activities,
    user?.athlete_metrics?.weight_kg || 0,
    physiqueLogs
  );

  const xpPercent = activeLevelInfo.progressPercent !== undefined
    ? activeLevelInfo.progressPercent
    : Math.min(
        100,
        Math.round((activeLevelInfo.currentXp / (activeLevelInfo.nextLevelXp || 1)) * 100)
      );

  return (
    <View className="space-y-4">
      {/* ROOKA LEVEL CARD */}
      <Card className="mb-4 bg-theme-card">
        <View className="flex-row items-center justify-between mb-2">
          <View className="flex-row items-center space-x-2">
            <View className="w-8 h-8 rounded-full bg-theme-accent/20 items-center justify-center">
              <Ionicons name="flash" size={18} color={theme.tint} />
            </View>
            <View className="flex-row items-baseline space-x-1.5">
              <Text className="text-xs font-bold text-theme-muted">
                {t('dashboard.sparkLevel')}
              </Text>
              <Text className="text-theme-accent text-xl font-extrabold font-rajdhani leading-tight">
                {Math.round(activeLevelInfo.level)}
              </Text>
            </View>
          </View>
          <Text className="text-xs font-semibold text-theme-muted font-rajdhani leading-tight">
            {Math.round(activeLevelInfo.currentXp)} <Text className="text-theme-text font-bold">/ {Math.round(activeLevelInfo.nextLevelXp)} XP</Text>
          </Text>
        </View>

        {/* Progress Fill Bar */}
        <View className="w-full h-3 bg-theme-bg rounded-full overflow-hidden my-2">
          <View
            style={{ width: `${xpPercent}%` }}
            className="h-full bg-theme-accent rounded-full"
          />
        </View>

        <View className="flex-row justify-between items-center mt-1">
          <Text className="text-xs text-theme-muted">{t('dashboard.progressNextLevel')}</Text>
          <Text className="text-xs font-bold text-theme-accent">{xpPercent}%</Text>
        </View>
      </Card>

      {/* ATHLETE ARCHETYPE CARD */}
      <Card className="mb-4 bg-theme-card">
        <View className="flex-row items-center justify-between mb-3">
          <Text className="text-xs font-bold text-theme-muted">
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
          /* With no sessions every axis floors at 25%, drawing a perfect
             pentagon that looks like a real measurement of nothing. Say what
             is needed instead. */
          <View className="items-center justify-center py-10 px-6">
            <Ionicons name="analytics-outline" size={34} color={theme.textSecondary} />
            <Text className="text-theme-text font-bold text-base mt-3 text-center">
              No sessions yet
            </Text>
            <Text className="text-theme-muted text-sm mt-1.5 text-center">
              Log or sync a workout and your athlete profile will build itself from
              what you actually train.
            </Text>
          </View>
        )}
      </Card>

      {/* PMC TELEMETRY METRICS CARDS WITH SPARKLINES */}
      <PMCMetricsCard
        ctl={pmcMetrics.ctl}
        atl={pmcMetrics.atl}
        tsb={pmcMetrics.tsb}
        readinessScore={pmcMetrics.readinessScore}
        weightKg={pmcMetrics.weightKg}
        ctlDelta={pmcMetrics.ctlDelta}
        atlDelta={pmcMetrics.atlDelta}
        ctlHistory={pmcMetrics.ctlHistory}
        atlHistory={pmcMetrics.atlHistory}
        tsbHistory={pmcMetrics.tsbHistory}
        weightHistory={pmcMetrics.weightHistory}
        tier={user?.subscription_tier || 'free'}
      />

      {/* QUESTS LOG */}
      {canAccessQuests(user?.subscription_tier) && (
        <Card className="mb-6 bg-theme-card">
          <View className="flex-row items-center justify-between mb-3">
            <View className="flex-row items-center space-x-2">
              <View className="w-2.5 h-2.5 rounded-full bg-theme-accent" />
              <Text className="text-xs font-bold text-theme-muted">
                {t('dashboard.questsLog')}
              </Text>
            </View>
            <Text className="text-xs text-theme-muted">1 {t('dashboard.active')}</Text>
          </View>

          <View className="bg-theme-bg/70 rounded-xl p-4">
            <Text className="text-sm font-bold text-theme-text mb-1">
              Complete 10km Total Distance
            </Text>
            <Text className="text-xs text-theme-muted mb-3 leading-4">
              Across any combination of your favorite activities (Run, Ride, or Swim) over the next 3 days.
            </Text>

            <View className="flex-row justify-between items-center pt-2">
              <View className="flex-row items-center space-x-1">
                <Ionicons name="trophy-outline" size={14} color={theme.tint} />
                <Text className="text-xs font-bold text-theme-accent">{t('dashboard.reward')}: 75 Rooka</Text>
              </View>

              <TouchableOpacity
                onPress={() => Haptics.selectionAsync()}
                className="px-3 py-1 bg-theme-accent/15 border border-theme-accent/30 rounded-lg"
              >
                <Text className="text-xs font-bold text-theme-accent">{t('dashboard.active')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Card>
      )}
    </View>
  );
};
