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

  return (
    <Card
      className={`p-4 md:p-5 mb-5 border shadow-sm ${
        day.isToday
          ? 'border-theme-accent border-[1.5px] bg-theme-card'
          : 'border-theme-border bg-theme-card'
      }`}
    >
      {/* Day Header Row matching Quest Card header format */}
      <View className="flex-row items-center justify-between pb-3 mb-3.5">
        <View className="flex-row items-center gap-2.5">
          <View className="flex-row items-center gap-2">
            <Text className="text-xs font-black uppercase tracking-wider text-theme-muted">
              {day.dayName}
            </Text>
            <Text className="text-base font-extrabold text-theme-text">{day.dateStr}</Text>

            {day.isToday && (
              <View className="bg-theme-accent px-2 py-0.5 rounded-full">
                <Text className="text-[9px] font-extrabold text-white uppercase tracking-wider">
                  Today
                </Text>
              </View>
            )}
          </View>

          {/* Weather Badge */}
          <View className="flex-row items-center gap-1 bg-theme-bg px-2 py-0.5 rounded-full">
            <Ionicons name="cloud-outline" size={12} color="#8E9BA4" />
            <Text className="text-[10px] font-bold text-theme-muted">{weatherTemp}</Text>
          </View>
        </View>

        {/* Adapt Plan Trigger matching Quest Card pill button design */}
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onAdaptPress();
          }}
          className="bg-theme-card px-3.5 py-1.5 rounded-full flex-row items-center gap-1.5 shadow-sm"
        >
          <Ionicons name="flash-outline" size={13} color="#F97316" />
          <Text className="text-xs font-bold text-amber-500">ADAPT</Text>
        </TouchableOpacity>
      </View>

      {/* Workouts List for this Day */}
      {!hasWorkouts ? (
        <View className="p-4 bg-theme-bg/60 rounded-2xl flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            <Ionicons name="moon-outline" size={16} color="#6F6F79" />
            <Text className="text-xs font-bold text-theme-muted">Rest / Recovery Day</Text>
          </View>

          <TouchableOpacity
            onPress={() => onAddWorkout(day.dayName, day.dateStr)}
            className="flex-row items-center gap-1 px-3 py-1 rounded-full bg-theme-accent/10"
          >
            <Ionicons name="add" size={13} color="#FF5F3B" />
            <Text className="text-xs font-bold text-theme-accent">Add Workout</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View className="space-y-3">
          {day.workouts.map((workout) => {
            const cfg = getDisciplineConfig(workout.type);

            return (
              <View
                key={workout.id}
                className={`p-4 rounded-2xl border-l-4 ${cfg.borderLeft} bg-theme-bg/60 flex-col gap-2`}
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
                      {workout.sparkPoints} Spark
                    </Text>

                    {workout.isStructured && (
                      <View className="px-2 py-0.5 bg-theme-card rounded">
                        <Text className="text-[9px] font-bold text-theme-muted">Structured</Text>
                      </View>
                    )}

                    {workout.isCompleted && (
                      <View className="flex-row items-center gap-1 bg-emerald-500/15 px-2 py-0.5 rounded-full">
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
                  <Text className="text-xs text-theme-muted font-bold mt-0.5">
                    Duration: {workout.duration || '45 mins'}
                  </Text>

                  {workout.actualMetrics && (
                    <Text className="text-xs font-mono text-emerald-500 font-bold mt-0.5">
                      {workout.actualMetrics}
                    </Text>
                  )}
                </TouchableOpacity>

                {/* Action Bar: Edit, Invite, Remove */}
                <View className="flex-row items-center justify-between pt-2 mt-1">
                  <TouchableOpacity
                    onPress={() => onSelectWorkout(workout)}
                    className="flex-row items-center gap-1 px-3 py-1 bg-theme-card rounded-lg"
                  >
                    <Ionicons name="create-outline" size={13} color="#FF5F3B" />
                    <Text className="text-xs font-bold text-theme-accent">Edit</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => onInvitePartner(workout)}
                    className="flex-row items-center gap-1 px-3 py-1 bg-theme-card rounded-lg"
                  >
                    <Ionicons name="person-add-outline" size={13} color="#6F6F79" />
                    <Text className="text-xs font-bold text-theme-muted">Invite Partner</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => onDeleteWorkout(workout.id)}
                    className="flex-row items-center gap-1 px-3 py-1 bg-rose-500/10 rounded-lg"
                  >
                    <Ionicons name="trash-outline" size={13} color="#F43F5E" />
                    <Text className="text-xs font-bold text-rose-500">Remove</Text>
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
