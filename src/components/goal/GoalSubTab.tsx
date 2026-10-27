import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { LevelProgress } from '../ui/LevelProgress';
import { Skeleton } from '../ui/Skeleton';
import { GoalStatusCard } from './GoalStatusCard';
import { RoadToRaceCard } from './RoadToRaceCard';
import { RacePlanCard, shouldShowRacePlan } from './RacePlanCard';
import { BodyGoalCard } from './BodyGoalCard';
import { GoalsTab } from '../profile/GoalsTab';

import { useActivities } from '../../context/ActivityStore';
import { useLanguage } from '../../context/LanguageContext';
import { useSeason } from '../../context/SeasonStore';
import { useUser } from '../../context/UserStore';
import { useTheme } from '@/hooks/use-theme';

/**
 * Progress -> Goal: everything about getting to the goal in one place. The road
 * to race day, whether the goal is on track, the race plan when it's close, and
 * body goals. All numbers come from the server (GET /api/season).
 */
export function GoalSubTab() {
  const { t } = useLanguage();
  const theme = useTheme();
  const router = useRouter();
  const { user } = useUser();
  const { activities } = useActivities();
  const { data, loaded, refresh } = useSeason();
  const [isEditing, setIsEditing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const season = data?.season || null;
  const raceStatus = data?.raceStatus || null;
  const bodyStatus = data?.bodyStatus || null;
  const racePlan = data?.racePlan || null;

  const totalRooka = Math.round(
    user?.total_rooka && user.total_rooka > 0 ? user.total_rooka : activities.reduce((sum, a) => sum + (a.rooka_score || 0), 0)
  );

  if (!loaded && !data) {
    return (
      <View className="gap-y-4">
        <Skeleton height={140} />
        <Skeleton height={200} />
      </View>
    );
  }

  if (isEditing) {
    return (
      <View className="gap-y-4">
        <View className="flex-row items-center justify-between mb-1">
          <Text className="text-base font-bold text-theme-text font-rajdhani">
            {t('goals.editGoalsTitle', 'Edit Goals & Calendar')}
          </Text>
          <TouchableOpacity
            onPress={() => {
              Haptics.selectionAsync();
              setIsEditing(false);
              refresh();
            }}
            className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full bg-theme-accent-strong"
            activeOpacity={0.8}
          >
            <Ionicons name="checkmark" size={14} color="#FFF" />
            <Text className="text-white text-xs font-bold font-rajdhani">
              {t('common.done', 'Done')}
            </Text>
          </TouchableOpacity>
        </View>

        <GoalsTab
          onDone={() => {
            setIsEditing(false);
            refresh();
          }}
          onSaved={() => {
            refresh();
          }}
        />
      </View>
    );
  }

  return (
    <View className="gap-y-4">
      {!season && !bodyStatus && (
        <View className="flex-row items-center justify-end">
          <TouchableOpacity
            onPress={() => {
              Haptics.selectionAsync();
              setIsEditing(true);
            }}
            className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full bg-theme-accent/10 border border-theme-accent/20"
            activeOpacity={0.7}
          >
            <Ionicons name="add" size={14} color={theme.tint} />
            <Text className="text-theme-accent text-xs font-bold font-rajdhani">
              {t('goals.addGoal', 'Add Goal')}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {season ? (
        <>
          <GoalStatusCard
            status={raceStatus}
            season={season}
            onEdit={() => setIsEditing(true)}
          />
          {shouldShowRacePlan(season, racePlan) && <RacePlanCard season={season} plan={racePlan} />}
          <RoadToRaceCard season={season} />
        </>
      ) : (
        !bodyStatus && (
          <Card>
            <View className="flex-row items-center gap-3">
              <View className="w-10 h-10 rounded-xl bg-theme-accent/15 items-center justify-center">
                <Ionicons name="flag-outline" size={20} color={theme.tint} />
              </View>
              <View className="flex-1">
                <Text className="text-base font-bold text-theme-text">{t('goal.emptyTitle')}</Text>
                <Text className="text-xs text-theme-muted mt-0.5 leading-relaxed">{t('goal.emptyBody')}</Text>
              </View>
            </View>
            <Button
              variant="secondary"
              size="sm"
              className="mt-3"
              label={t('progress.noGoalCta', 'Add a goal')}
              onPress={() => {
                Haptics.selectionAsync();
                setIsEditing(true);
              }}
            />
          </Card>
        )
      )}

      {bodyStatus && (
        <BodyGoalCard
          status={bodyStatus}
          onEdit={() => setIsEditing(true)}
        />
      )}

      <Card className="bg-theme-card">
        <LevelProgress totalRooka={totalRooka} levelTitle={t('dashboard.sparkLevel') || 'Athlete Level'} />
      </Card>
    </View>
  );
}
