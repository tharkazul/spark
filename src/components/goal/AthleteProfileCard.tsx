import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Text, View } from 'react-native';

import { Card } from '../ui/Card';
import { AthleteRadarChart } from '../progress/AthleteRadarChart';
import { useActivities } from '../../context/ActivityStore';
import { useLanguage } from '../../context/LanguageContext';
import { useUser } from '../../context/UserStore';
import { useTheme } from '@/hooks/use-theme';
import { calculateAthleteArchetype } from '../../utils/archetypeUtils';

/** The athlete archetype spider chart. Lives in Profile -> Training, next to the athlete's other settings. */
export function AthleteProfileCard() {
  const theme = useTheme();
  const { t } = useLanguage();
  const { user } = useUser();
  const { activities } = useActivities();

  const archetype = calculateAthleteArchetype(activities, user?.athlete_metrics);
  const hasData = (activities?.length ?? 0) > 0;

  return (
    <Card className="bg-theme-card p-6">
      <View className="flex-row items-center justify-between mb-3">
        <Text className="text-xs font-bold text-theme-muted uppercase tracking-wider">{t('dashboard.athleteArchetype')}</Text>
        {hasData && (
          <View className="px-2.5 py-1 bg-theme-accent/15 rounded-full">
            <Text className="text-xs font-bold text-theme-accent">{archetype.title}</Text>
          </View>
        )}
      </View>
      {hasData ? (
        <>
          <AthleteRadarChart data={archetype} size={260} />
          {archetype.description ? (
            <View className="mt-3 pt-3 border-t border-theme-border/40">
              <Text className="text-xs text-theme-muted text-center leading-relaxed">{archetype.description}</Text>
            </View>
          ) : null}
        </>
      ) : (
        <View className="items-center justify-center py-8 px-4">
          <Ionicons name="analytics-outline" size={34} color={theme.textSecondary} />
          <Text className="text-theme-text font-bold text-base mt-3 text-center">{t('progress.noSessionsYet', 'No sessions yet')}</Text>
          <Text className="text-theme-muted text-xs mt-1.5 text-center leading-relaxed">
            {t('progress.noSessionsSubtitle', 'Log or sync a workout and your athlete profile will build itself from what you actually train.')}
          </Text>
        </View>
      )}
    </Card>
  );
}
