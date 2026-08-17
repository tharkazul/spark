import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Card } from '../ui/Card';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { WorkoutItem, SportType } from '../../types/dashboard';

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
  const getDisciplineConfig = (type: SportType) => {
    switch (type) {
      case 'SWIM':
        return {
          bg: 'bg-[#2E8FE0]/15',
          text: 'text-[#2E8FE0]',
          borderLeft: 'border-l-[#2E8FE0]',
          borderColor: 'border-[#2E8FE0]/40',
          label: 'SWIM',
          icon: 'water-outline',
          badgeColor: '#2E8FE0',
        };
      case 'RUN':
        return {
          bg: 'bg-[#D9A62E]/15',
          text: 'text-[#D9A62E]',
          borderLeft: 'border-l-[#D9A62E]',
          borderColor: 'border-[#D9A62E]/40',
          label: 'RUN',
          icon: 'walk-outline',
          badgeColor: '#D9A62E',
        };
      case 'BIKE':
        return {
          bg: 'bg-[#4CAF6D]/15',
          text: 'text-[#4CAF6D]',
          borderLeft: 'border-l-[#4CAF6D]',
          borderColor: 'border-[#4CAF6D]/40',
          label: 'BIKE',
          icon: 'bicycle-outline',
          badgeColor: '#4CAF6D',
        };
      case 'STRENGTH':
        return {
          bg: 'bg-[#B36AE0]/15',
          text: 'text-[#B36AE0]',
          borderLeft: 'border-l-[#B36AE0]',
          borderColor: 'border-[#B36AE0]/40',
          label: 'STRENGTH',
          icon: 'barbell-outline',
          badgeColor: '#B36AE0',
        };
      case 'MOBILITY':
        return {
          bg: 'bg-[#2EBFAF]/15',
          text: 'text-[#2EBFAF]',
          borderLeft: 'border-l-[#2EBFAF]',
          borderColor: 'border-[#2EBFAF]/40',
          label: 'MOBILITY',
          icon: 'body-outline',
          badgeColor: '#2EBFAF',
        };
      default:
        return {
          bg: 'bg-gray-500/15',
          text: 'text-gray-400',
          borderLeft: 'border-l-gray-400',
          borderColor: 'border-gray-500/40',
          label: 'REST',
          icon: 'moon-outline',
          badgeColor: '#6F6F79',
        };
    }
  };

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
          <Text className="text-base font-extrabold text-theme-text">Today's Plan</Text>
          <Text className="text-xs text-theme-muted font-bold">· {tempLabel}</Text>
        </View>

        {/* Adapt Plan Action Trigger Button */}
        <TouchableOpacity
          onPress={handleAdapt}
          activeOpacity={0.7}
          className="bg-theme-card px-3.5 py-1.5 rounded-full flex-row items-center gap-1.5"
        >
          <Ionicons name="flash-outline" size={13} color="#FF5F3B" />
          <Text className="text-xs font-bold text-theme-accent">ADAPT</Text>
        </TouchableOpacity>
      </View>

      {/* Single-layer Workout Items */}
      {workouts.length === 0 ? (
        <Card className="p-4 bg-theme-card flex-row items-center justify-between">
          <View className="flex-row items-center gap-3 flex-1">
            <View className="w-10 h-10 rounded-xl bg-gray-500/15 items-center justify-center">
              <Ionicons name="moon-outline" size={20} color="#6F6F79" />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-extrabold text-theme-text">Rest & Recovery Day</Text>
              <Text className="text-xs text-theme-muted font-medium">Stretch, hydrate and absorb recent training</Text>
            </View>
          </View>
          <View className="items-end gap-1">
            <Text className="text-sm font-mono font-extrabold text-theme-muted">0 ⚡</Text>
            <TouchableOpacity
              onPress={handleAdd}
              className="px-2.5 py-1 rounded-lg bg-theme-accent/15"
            >
              <Text className="text-[10px] font-extrabold text-theme-accent">+ Log</Text>
            </TouchableOpacity>
          </View>
        </Card>
      ) : (
        <View className="space-y-2.5">
          {workouts.map((workout) => {
            const isRest = workout.type === 'REST' || 
                           (workout.title || '').toLowerCase().includes('rest') || 
                           (workout.title || '').toLowerCase().includes('recovery');
            const sparkVal = isRest ? 0 : Math.round(workout.sparkPoints || 0);
            const cfg = getDisciplineConfig(isRest ? 'REST' : workout.type);
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
                    <View className={`w-10 h-10 rounded-xl ${cfg.bg} items-center justify-center`}>
                      <Ionicons name={cfg.icon as any} size={20} color={cfg.badgeColor} />
                    </View>
                    <View className="flex-1">
                      <Text className="text-sm font-extrabold text-theme-text" numberOfLines={1}>
                        {workout.title}
                      </Text>
                      <Text className="text-xs text-theme-muted font-bold mt-0.5">
                        {isRest ? 'Rest & Absorb Training' : humanDuration} {workout.actualMetrics ? `· ${workout.actualMetrics}` : ''}
                      </Text>
                    </View>
                  </View>

                  {/* Right: Spark Points + Status */}
                  <View className="items-end gap-1">
                    <Text className={`text-sm font-mono font-extrabold ${sparkVal > 0 ? 'text-theme-accent' : 'text-theme-muted'}`}>
                      +{sparkVal} ⚡
                    </Text>
                    {workout.isCompleted ? (
                      <View className="flex-row items-center gap-1 bg-emerald-500/15 px-2 py-0.5 rounded-full">
                        <Ionicons name="checkmark-circle" size={10} color="#10B981" />
                        <Text className="text-[9px] font-extrabold text-emerald-500">DONE</Text>
                      </View>
                    ) : (
                      <Text className="text-[10px] text-theme-muted font-bold">Tap to edit</Text>
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
            <Ionicons name="add-circle-outline" size={15} color="#FF5F3B" />
            <Text className="text-xs font-extrabold text-theme-accent">+ Add Exercise</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
