import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Card } from '../ui/Card';
import { LineChart } from 'react-native-gifted-charts';
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
  const { t } = useLanguage();
  const { user } = useUser();
  const { activities } = useActivities();
  const { physiqueLogs } = usePhysique();

  const computedInfo = getRookaLevelInfo(user?.total_rooka ?? 0);
  const activeLevelInfo = customLevelInfo || {
    level: computedInfo.level,
    currentXp: computedInfo.totalRooka,
    nextLevelXp: computedInfo.nextLevelThreshold,
    progressPercent: computedInfo.progressPercent,
  };

  const computedArchetype = calculateAthleteArchetype(activities, user?.athlete_metrics);
  const activeArchetypeData = customArchetypeData || computedArchetype;
  const activeArchetypeTitle = customArchetypeData?.title || computedArchetype.title;

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
      {/* SPARK LEVEL CARD */}
      <Card className="mb-4 bg-theme-card">
        <View className="flex-row items-center justify-between mb-2">
          <View className="flex-row items-center space-x-2">
            <View className="w-8 h-8 rounded-full bg-theme-accent/20 items-center justify-center">
              <Ionicons name="flash" size={18} color="#FF5A1F" />
            </View>
            <View className="flex-row items-baseline space-x-1.5">
              <Text className="text-xs font-bold text-theme-muted uppercase tracking-wider">
                {t('dashboard.sparkLevel')}
              </Text>
              <Text className="text-theme-accent text-xl font-black font-rajdhani leading-tight">
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
          <Text className="text-[11px] text-theme-muted">{t('dashboard.progressNextLevel')}</Text>
          <Text className="text-[11px] font-bold text-theme-accent">{xpPercent}%</Text>
        </View>
      </Card>

      {/* ATHLETE ARCHETYPE CARD */}
      <Card className="mb-4 bg-theme-card">
        <View className="flex-row items-center justify-between mb-3">
          <Text className="text-xs font-bold text-theme-muted uppercase tracking-wider">
            {t('dashboard.athleteArchetype')}
          </Text>
          <View className="px-2.5 py-1 bg-theme-accent/15 rounded-full">
            <Text className="text-[10px] font-bold text-theme-accent uppercase">{activeArchetypeTitle}</Text>
          </View>
        </View>

        <AthleteRadarChart data={activeArchetypeData} size={260} />
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
              <Text className="text-xs font-bold text-theme-muted uppercase tracking-wider">
                {t('dashboard.questsLog')}
              </Text>
            </View>
            <Text className="text-[11px] text-theme-muted">1 {t('dashboard.active')}</Text>
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
                <Ionicons name="trophy-outline" size={14} color="#FF5A1F" />
                <Text className="text-xs font-bold text-theme-accent">{t('dashboard.reward')}: 75 Spark</Text>
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
