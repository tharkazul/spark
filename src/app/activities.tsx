import React from 'react';
import { View, Text, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card } from '../components/ui/Card';
import { SportMedallion } from '../components/ui/SportMedallion';
import { StatValue } from '../components/ui/StatValue';
import { useTabBarInset } from '../hooks/useTabBarInset';
import { useActivities } from '../context/ActivityStore';
import { useLanguage } from '../context/LanguageContext';
import { formatPaceOrSpeed, getPaceParts } from '../utils/paceFormat';
import { formatRelativeDay, formatDistance, formatDuration } from '../utils/format';

export default function ActivitiesScreen() {
  const { activities, loading, refreshActivities } = useActivities();
  const { t, language } = useLanguage();
  const tabBarInset = useTabBarInset();

  const formattedActivities = activities.map((act) => ({
    id: String(act.id),
    title: act.name,
    type: act.sport_type,
    distanceKm: act.distance_km,
    durationMin: act.moving_time_min,
    paceParts: getPaceParts(act.distance_km, act.moving_time_min, act.sport_type, act.name),
    pace: formatPaceOrSpeed(act.distance_km, act.moving_time_min, act.sport_type, act.name),
    relativeDate: formatRelativeDay(act.start_date_local || act.start_date || new Date(), language),
  }));

  return (
    <SafeAreaView className="flex-1 bg-theme-bg" edges={['top']}>
      <View className="px-4 my-6">
        <Text className="text-theme-text text-3xl font-extrabold font-jakarta">
          {t('activities.title', 'Activities')}
        </Text>
        <Text className="text-theme-muted text-sm mt-1 font-jakarta">
          {t('activities.subtitle', 'Past workouts and synced sessions')}
        </Text>
      </View>

      <FlatList
        data={formattedActivities}
        keyExtractor={(item) => item.id}
        refreshing={loading}
        onRefresh={refreshActivities}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: tabBarInset }}
        renderItem={({ item }) => (
          <Card variant="default" className="mb-3.5">
            <View className="flex-row items-center mb-3">
              <SportMedallion sport={item.type} size={40} className="mr-3" />
              <View className="flex-1">
                <Text numberOfLines={1} className="text-theme-text font-bold text-base font-jakarta">
                  {item.title}
                </Text>
                <Text className="text-theme-muted text-xs font-jakarta mt-0.5">
                  {item.relativeDate}
                </Text>
              </View>
            </View>

            {/* Metric Row with open styling (no nested boxes) */}
            <View className="flex-row items-center justify-between pt-2 border-t border-theme-border/40">
              <View className="flex-1">
                <StatValue
                  label={t('activities.distance', 'Distance')}
                  labelPosition="top"
                  value={item.distanceKm ? item.distanceKm.toFixed(1) : '0.0'}
                  unit="km"
                  size="md"
                  align="left"
                />
              </View>

              <View className="flex-1 items-center">
                <StatValue
                  label={t('activities.time', 'Time')}
                  labelPosition="top"
                  value={formatDuration(item.durationMin)}
                  size="md"
                  align="center"
                />
              </View>

              {item.paceParts ? (
                <View className="flex-1 items-end">
                  <StatValue
                    label={t('activities.pace', item.paceParts.label === 'SPEED' ? 'Speed' : 'Pace')}
                    labelPosition="top"
                    value={item.paceParts.value}
                    unit={item.paceParts.unit}
                    size="md"
                    align="right"
                  />
                </View>
              ) : null}
            </View>
          </Card>
        )}
      />
    </SafeAreaView>
  );
}
