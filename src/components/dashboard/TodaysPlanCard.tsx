import React from 'react';
import { useTheme } from '@/hooks/use-theme';
import { getDisciplineConfig } from '../../utils/disciplineConfig';
import { View, Text, TouchableOpacity, useColorScheme } from 'react-native';
import { Card } from '../ui/Card';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { WorkoutItem, SportType } from '../../types/dashboard';
import { useLanguage } from '../../context/LanguageContext';

interface TodaysPlanCardProps {
  dateLabel: string; // e.g. 'FRI Jul 24'
  tempLabel: string; // e.g. '24°C'
  weatherIcon?: string;
  workouts: WorkoutItem[];
  onAdaptPress: () => void;
  onAddWorkout: () => void;
  onSelectWorkout: (workout: WorkoutItem) => void;
}

export function TodaysPlanCard({
  dateLabel,
  tempLabel,
  weatherIcon = 'partly-sunny-outline',
  workouts,
  onAdaptPress,
  onAddWorkout,
  onSelectWorkout,
}: TodaysPlanCardProps) {
    const theme = useTheme();
  const { t } = useLanguage();

    // One palette for every screen; see utils/disciplineConfig.
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';


  const handleAdapt = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onAdaptPress();
  };

  const handleAdd = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onAddWorkout();
  };

  const formatHumanDuration = (durationStr?: string, sport?: SportType) => {
    if (!durationStr) return `45 min ${sport ? sport.toLowerCase() : 'session'}`;
    const cleanDur = durationStr.replace(/mins?/i, 'min').trim();
    const sportName = sport ? sport.toLowerCase() : 'session';
    return `${cleanDur} ${sportName}`;
  };

  return (
    <View className="mb-5">
      {/* Header Bar */}
      <View className="flex-row items-center justify-between mb-3 px-1">
        <View className="flex-row items-center gap-2">
          <Text className="text-base font-extrabold text-theme-text">{t('dashboard.todaysPlan')}</Text>
          <Text className="text-xs text-theme-muted font-bold">· {tempLabel}</Text>
        </View>

        {/* Adapt Plan Action Trigger Button */}
        <TouchableOpacity
          onPress={handleAdapt}
          activeOpacity={0.7}
          className="bg-theme-card px-3.5 py-1.5 rounded-full flex-row items-center gap-1.5"
        >
          <Ionicons name="flash-outline" size={13} color={theme.tint} />
          <Text className="text-xs font-bold text-theme-accent">{t('dashboard.adapt')}</Text>
        </TouchableOpacity>
      </View>

      {/* Single-layer Workout Items */}
      {workouts.length === 0 ? (
        <Card className="p-4 bg-theme-card flex-row items-center justify-between">
          <View className="flex-row items-center gap-3 flex-1">
            <View className="w-10 h-10 rounded-xl bg-gray-500/15 items-center justify-center">
              <Ionicons name="moon-outline" size={20} color={theme.textSecondary} />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-extrabold text-theme-text">{t('dashboard.restRecoveryDay')}</Text>
              <Text className="text-xs text-theme-muted font-medium">{t('dashboard.stretchHydrateAbsorb')}</Text>
            </View>
          </View>
          <View className="items-end gap-1">
            <Text className="text-sm font-mono font-extrabold text-theme-muted">0 ⚡</Text>
            <TouchableOpacity
              onPress={handleAdd}
              className="px-2.5 py-1 rounded-lg bg-theme-accent/15"
            >
              <Text className="text-xs font-extrabold text-theme-accent">+ Log</Text>
            </TouchableOpacity>
          </View>
        </Card>
      ) : (
        <View className="space-y-2.5">
          {workouts.map((workout) => {
            const isRest = workout.type === 'REST' || 
                           (workout.title || '').toLowerCase().includes('rest') || 
                           (workout.title || '').toLowerCase().includes('recovery');
            const rookaVal = isRest ? 0 : Math.round(workout.rookaPoints || 0);
            const cfg = getDisciplineConfig(isRest ? 'REST' : workout.type, scheme);
            const humanDuration = formatHumanDuration(workout.duration, workout.type);

            return (
              <Card
                key={workout.id}
                className="p-3.5 bg-theme-card"
              >
                <TouchableOpacity
                  onPress={() => {
                    Haptics.selectionAsync();
                    onSelectWorkout(workout);
                  }}
                  activeOpacity={0.75}
                  className="flex-row items-center justify-between"
                >
                  {/* Left: Sport Icon + Title & Duration */}
                  <View className="flex-row items-center gap-3 flex-1 mr-3">
                    <View
                      style={{ backgroundColor: cfg.tint }}
                      className="w-10 h-10 rounded-xl items-center justify-center"
                    >
                      <Ionicons name={cfg.icon as any} size={20} color={cfg.color} />
                    </View>
                    <View className="flex-1">
                      <Text className="text-sm font-extrabold text-theme-text" numberOfLines={1}>
                        {workout.title}
                      </Text>
                      <Text className="text-xs text-theme-muted font-bold mt-0.5">
                        {isRest ? t('dashboard.restAbsorbTraining') : humanDuration} {workout.actualMetrics ? `· ${workout.actualMetrics}` : ''}
                      </Text>
                    </View>
                  </View>

                  {/* Right: Rooka Points + Status */}
                  <View className="items-end gap-1">
                    <Text className={`text-sm font-mono font-extrabold ${rookaVal > 0 ? 'text-theme-accent' : 'text-theme-muted'}`}>
                      +{rookaVal} ⚡
                    </Text>
                    {workout.isCompleted ? (
                      <View className="flex-row items-center gap-1 bg-emerald-500/15 px-2 py-0.5 rounded-full">
                        <Ionicons name="checkmark-circle" size={10} color="#10B981" />
                        <Text className="text-xs font-extrabold text-emerald-500">DONE</Text>
                      </View>
                    ) : (
                      <Text className="text-xs text-theme-muted font-bold">{t('dashboard.tapToEdit')}</Text>
                    )}
                  </View>
                </TouchableOpacity>
              </Card>
            );
          })}

          {/* Quick Add Button */}
          <TouchableOpacity
            onPress={handleAdd}
            activeOpacity={0.8}
            className="w-full py-2.5 bg-theme-card/60 rounded-xl flex-row items-center justify-center gap-1.5"
          >
            <Ionicons name="add-circle-outline" size={15} color={theme.tint} />
            <Text className="text-xs font-extrabold text-theme-accent">+ {t('dashboard.addExercise')}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
