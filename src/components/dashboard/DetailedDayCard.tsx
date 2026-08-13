import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Card } from '../ui/Card';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { DayAgenda } from './MicroPlanAgendaCard';
import { WorkoutItem, SportType } from '../../types/dashboard';

interface DetailedDayCardProps {
  day: DayAgenda;
  weatherTemp?: string;
  onAdaptPress: () => void;
  onAddWorkout: (dayName: string, dateStr: string) => void;
  onSelectWorkout: (workout: WorkoutItem) => void;
  onDeleteWorkout: (workoutId: string) => void;
  onInvitePartner: (workout: WorkoutItem) => void;
}

export function DetailedDayCard({
  day,
  weatherTemp = '22°C',
  onAdaptPress,
  onAddWorkout,
  onSelectWorkout,
  onDeleteWorkout,
  onInvitePartner,
}: DetailedDayCardProps) {
  const getDisciplineConfig = (type: SportType) => {
    switch (type) {
      case 'SWIM':
        return {
          bg: 'bg-[#2E8FE0]/15',
          text: 'text-[#2E8FE0]',
          borderColor: 'border-[#2E8FE0]/40',
          borderLeft: 'border-l-[#2E8FE0]',
          label: 'SWIM',
          icon: 'water-outline',
          badgeColor: '#2E8FE0',
        };
      case 'RUN':
        return {
          bg: 'bg-[#D9A62E]/15',
          text: 'text-[#D9A62E]',
          borderColor: 'border-[#D9A62E]/40',
          borderLeft: 'border-l-[#D9A62E]',
          label: 'RUN',
          icon: 'walk-outline',
          badgeColor: '#D9A62E',
        };
      case 'BIKE':
        return {
          bg: 'bg-[#4CAF6D]/15',
          text: 'text-[#4CAF6D]',
          borderColor: 'border-[#4CAF6D]/40',
          borderLeft: 'border-l-[#4CAF6D]',
          label: 'BIKE',
          icon: 'bicycle-outline',
          badgeColor: '#4CAF6D',
        };
      case 'STRENGTH':
        return {
          bg: 'bg-[#B36AE0]/15',
          text: 'text-[#B36AE0]',
          borderColor: 'border-[#B36AE0]/40',
          borderLeft: 'border-l-[#B36AE0]',
          label: 'STRENGTH',
          icon: 'barbell-outline',
          badgeColor: '#B36AE0',
        };
      case 'MOBILITY':
        return {
          bg: 'bg-[#2EBFAF]/15',
          text: 'text-[#2EBFAF]',
          borderColor: 'border-[#2EBFAF]/40',
          borderLeft: 'border-l-[#2EBFAF]',
          label: 'MOBILITY',
          icon: 'body-outline',
          badgeColor: '#2EBFAF',
        };
      default:
        return {
          bg: 'bg-gray-500/15',
          text: 'text-gray-400',
          borderColor: 'border-gray-500/40',
          borderLeft: 'border-l-gray-400',
          label: 'REST',
          icon: 'moon-outline',
          badgeColor: '#6F6F79',
        };
    }
  };

  const hasWorkouts = day.workouts.length > 0;

  const formatHumanDuration = (durationStr?: string, sport?: SportType) => {
    if (!durationStr) return `45 min ${sport ? sport.toLowerCase() : 'session'}`;
    const cleanDur = durationStr.replace(/mins?/i, 'min').trim();
    const sportName = sport ? sport.toLowerCase() : 'session';
    return `${cleanDur} ${sportName}`;
  };

  return (
    <Card
      className={`p-4 md:p-5 mb-5 border shadow-sm ${
        day.isToday
          ? 'border-theme-accent border-[1.5px] bg-theme-card'
          : 'border-theme-border bg-theme-card'
      }`}
    >
      {/* Day Header Row matching TodaysPlanCard header format */}
      <View className="flex-row items-center justify-between pb-3 mb-3.5 border-b border-theme-border/50">
        <View className="flex-row items-center gap-3">
          <View className="w-10 h-10 rounded-xl bg-theme-accent/15 items-center justify-center">
            <Ionicons name="calendar-outline" size={20} color="#FF5F3B" />
          </View>

          <View>
            <View className="flex-row items-center gap-2">
              <Text className="text-base font-extrabold text-theme-text">{day.dayName} {day.dateStr}</Text>

              {day.isToday && (
                <View className="bg-theme-accent px-2 py-0.5 rounded-full">
                  <Text className="text-[9px] font-extrabold text-white uppercase tracking-wider">
                    Today
                  </Text>
                </View>
              )}
            </View>

            <Text className="text-[11px] text-theme-muted">{weatherTemp} · Scheduled</Text>
          </View>
        </View>

        {/* Adapt Plan Trigger matching TodaysPlanCard ADAPT button styling */}
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onAdaptPress();
          }}
          activeOpacity={0.7}
          className="bg-theme-card border border-amber-500/40 px-3.5 py-1.5 rounded-full flex-row items-center gap-1.5 shadow-sm"
        >
          <Ionicons name="flash-outline" size={13} color="#F97316" />
          <Text className="text-xs font-bold text-amber-500">ADAPT</Text>
        </TouchableOpacity>
      </View>

      {/* Workouts List for this Day */}
      {!hasWorkouts ? (
        <View className="p-5 rounded-2xl border border-theme-border bg-theme-bg/60 flex-col items-center justify-center gap-2">
          <Ionicons name="moon-outline" size={24} color="#6F6F79" />
          <Text className="text-sm font-bold text-theme-text">Rest & Recovery Day</Text>
          <Text className="text-xs text-theme-muted text-center px-4">
            No structured sessions scheduled for this day. Take time to stretch and refuel.
          </Text>

          <TouchableOpacity
            onPress={() => onAddWorkout(day.dayName, day.dateStr)}
            className="mt-2 flex-row items-center gap-1.5 px-4 py-2 rounded-xl bg-theme-accent"
          >
            <Ionicons name="add" size={16} color="#FFFFFF" />
            <Text className="text-xs font-extrabold text-white">Log Extra Activity</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View className="space-y-3">
          {day.workouts.map((workout) => {
            const cfg = getDisciplineConfig(workout.type);
            const humanDuration = formatHumanDuration(workout.duration, workout.type);

            return (
              <View
                key={workout.id}
                className={`p-4 rounded-2xl border border-l-4 ${cfg.borderLeft} ${cfg.borderColor} bg-theme-bg/60 flex-col gap-2`}
              >
                {/* Top Discipline Line */}
                <View className="flex-row items-center justify-between">
                  <View className={`px-2.5 py-0.5 rounded-md ${cfg.bg} flex-row items-center gap-1.5`}>
                    <Ionicons name={cfg.icon as any} size={13} color={cfg.badgeColor} />
                    <Text className={`text-xs font-extrabold ${cfg.text}`}>
                      {cfg.label}
                    </Text>
                  </View>

                  <View className="flex-row items-center gap-2">
                    <Text className="text-xs font-mono font-bold text-theme-accent">
                      +{workout.sparkPoints} Spark
                    </Text>

                    {workout.isStructured && (
                      <View className="px-2 py-0.5 bg-theme-card border border-theme-border/60 rounded">
                        <Text className="text-[9px] font-bold text-theme-muted">Structured</Text>
                      </View>
                    )}

                    {workout.isCompleted && (
                      <View className="flex-row items-center gap-1 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                        <Ionicons name="checkmark-circle" size={12} color="#10B981" />
                        <Text className="text-[9px] font-extrabold text-emerald-500">DONE</Text>
                      </View>
                    )}
                  </View>
                </View>

                {/* Workout Title */}
                <TouchableOpacity
                  onPress={() => onSelectWorkout(workout)}
                  activeOpacity={0.8}
                >
                  <Text className="text-sm font-extrabold text-theme-text leading-snug">
                    {workout.title}
                  </Text>
                </TouchableOpacity>

                {/* Subline: Clean Metric Summary */}
                <View className="flex-row items-center justify-between pt-1 border-t border-theme-border/40">
                  <Text className="text-xs text-theme-muted font-bold">
                    {humanDuration} · +{workout.sparkPoints} Spark
                  </Text>

                  {workout.actualMetrics && (
                    <Text className="text-xs font-mono text-emerald-500 font-bold">
                      {workout.actualMetrics}
                    </Text>
                  )}
                </View>

                {/* Action Bar: Edit, Push to Garmin, Invite, Remove */}
                <View className="flex-row items-center justify-between pt-2 mt-1 border-t border-theme-border/20">
                  <TouchableOpacity
                    onPress={() => onSelectWorkout(workout)}
                    className="flex-row items-center gap-1 px-3 py-1 bg-theme-card border border-theme-border/60 rounded-lg"
                  >
                    <Ionicons name="create-outline" size={13} color="#FF5F3B" />
                    <Text className="text-xs font-bold text-theme-accent">Edit</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={async () => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      try {
                        const { syncGarminWorkout } = require('../../api/integrations');
                        await syncGarminWorkout([{ date: day.dateStr || new Date().toISOString().split('T')[0], sport: workout.type }]);
                        const { Alert } = require('react-native');
                        Alert.alert('Garmin Push Complete', `"${workout.title}" has been pushed to your Garmin watch.`);
                      } catch (err: any) {
                        const { Alert } = require('react-native');
                        Alert.alert('Garmin Push Failed', err.message || 'Check your Garmin credentials in Settings.');
                      }
                    }}
                    className="flex-row items-center gap-1 px-3 py-1 bg-blue-500/10 border border-blue-500/30 rounded-lg"
                  >
                    <Ionicons name="watch-outline" size={13} color="#3B82F6" />
                    <Text className="text-xs font-bold text-blue-500">Garmin</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => onInvitePartner(workout)}
                    className="flex-row items-center gap-1 px-3 py-1 bg-theme-card border border-theme-border/60 rounded-lg"
                  >
                    <Ionicons name="person-add-outline" size={13} color="#6F6F79" />
                    <Text className="text-xs font-bold text-theme-muted">Invite</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => onDeleteWorkout(workout.id)}
                    className="flex-row items-center gap-1 px-2.5 py-1 bg-rose-500/10 border border-rose-500/30 rounded-lg"
                  >
                    <Ionicons name="trash-outline" size={13} color="#F43F5E" />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}

          {/* Add Workout Button for this Day */}
          <TouchableOpacity
            onPress={() => onAddWorkout(day.dayName, day.dateStr)}
            activeOpacity={0.8}
            className="w-full py-3 bg-theme-bg/60 border border-dashed border-theme-border rounded-2xl flex-row items-center justify-center gap-1.5 active:bg-theme-accent/10"
          >
            <Ionicons name="add-circle-outline" size={16} color="#FF5F3B" />
            <Text className="text-xs font-extrabold text-theme-accent">+ Add Exercise</Text>
          </TouchableOpacity>
        </View>
      )}
    </Card>
  );
}
