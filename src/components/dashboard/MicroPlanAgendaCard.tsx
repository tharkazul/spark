import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Card } from '../ui/Card';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { WorkoutItem, SportType } from '../../types/dashboard';

export interface DayAgenda {
  dayName: string; // e.g. 'MON', 'TUE'
  dateStr: string; // e.g. 'Jul 20'
  isToday?: boolean;
  workouts: WorkoutItem[];
}

interface MicroPlanAgendaCardProps {
  weekRangeLabel: string; // e.g. 'Jul 20 - Jul 26'
  agenda: DayAgenda[];
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onAutoGenerate: () => void;
  onAddWorkoutToDay: (dayName: string, dateStr: string) => void;
  onSelectWorkout: (workout: WorkoutItem) => void;
}

export function MicroPlanAgendaCard({
  weekRangeLabel,
  agenda,
  onPrevWeek,
  onNextWeek,
  onAutoGenerate,
  onAddWorkoutToDay,
  onSelectWorkout,
}: MicroPlanAgendaCardProps) {

  const getDisciplineConfig = (type: SportType) => {
    switch (type) {
      case 'SWIM':
        return {
          bg: 'bg-blue-500/10',
          text: 'text-blue-500',
          borderLeft: 'border-l-blue-500',
          borderColor: 'border-blue-500/30',
          label: 'SWIM',
          icon: 'water-outline',
        };
      case 'RUN':
        return {
          bg: 'bg-amber-500/10',
          text: 'text-amber-500',
          borderLeft: 'border-l-amber-500',
          borderColor: 'border-amber-500/30',
          label: 'RUN',
          icon: 'walk-outline',
        };
      case 'BIKE':
        return {
          bg: 'bg-emerald-500/10',
          text: 'text-emerald-500',
          borderLeft: 'border-l-emerald-500',
          borderColor: 'border-emerald-500/30',
          label: 'BIKE',
          icon: 'bicycle-outline',
        };
      case 'STRENGTH':
        return {
          bg: 'bg-purple-500/10',
          text: 'text-purple-500',
          borderLeft: 'border-l-purple-500',
          borderColor: 'border-purple-500/30',
          label: 'STRENGTH',
          icon: 'barbell-outline',
        };
      case 'MOBILITY':
        return {
          bg: 'bg-teal-500/10',
          text: 'text-teal-500',
          borderLeft: 'border-l-teal-500',
          borderColor: 'border-teal-500/30',
          label: 'MOBILITY',
          icon: 'body-outline',
        };
      default:
        return {
          bg: 'bg-gray-500/10',
          text: 'text-gray-400',
          borderLeft: 'border-l-gray-400',
          borderColor: 'border-gray-500/30',
          label: 'REST',
          icon: 'moon-outline',
        };
    }
  };

  const handlePrev = () => {
    Haptics.selectionAsync();
    onPrevWeek();
  };

  const handleNext = () => {
    Haptics.selectionAsync();
    onNextWeek();
  };

  const handleGenerate = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onAutoGenerate();
  };

  return (
    <Card className="p-0 overflow-hidden mb-8 border-theme-border shadow-sm">
      {/* Top Header & Actions Bar */}
      <View className="px-5 py-4 border-b border-theme-border/70 bg-theme-bg/60">
        <View className="flex-row items-center justify-between mb-3">
          <View className="flex-row items-center gap-2.5">
            <View className="w-8 h-8 rounded-xl bg-theme-accent/15 border border-theme-accent/30 items-center justify-center">
              <Ionicons name="list-outline" size={16} color="#16ACBD" />
            </View>
            <View>
              <Text className="text-base font-extrabold text-theme-text">Micro Plan Agenda</Text>
              <Text className="text-[10px] text-theme-muted">Weekly Workouts Overview</Text>
            </View>
          </View>

          {/* Week Selector */}
          <View className="flex-row items-center bg-theme-card border border-theme-border rounded-xl px-1 py-0.5 shadow-sm">
            <TouchableOpacity onPress={handlePrev} className="px-2.5 py-1">
              <Ionicons name="chevron-back" size={14} color="#8E9BA4" />
            </TouchableOpacity>

            <Text className="text-xs font-mono font-medium text-theme-text px-1">
              {weekRangeLabel}
            </Text>

            <TouchableOpacity onPress={handleNext} className="px-2.5 py-1">
              <Ionicons name="chevron-forward" size={14} color="#8E9BA4" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Auto Generate Button */}
        <TouchableOpacity
          onPress={handleGenerate}
          activeOpacity={0.8}
          className="w-full bg-theme-card border border-theme-accent/40 py-2.5 px-4 rounded-xl flex-row items-center justify-center gap-1.5 shadow-sm"
        >
          <Ionicons name="sparkles" size={14} color="#16ACBD" />
          <Text className="text-xs font-bold text-theme-accent">Auto-Generate Week</Text>
        </TouchableOpacity>
      </View>

      {/* Week Agenda Days List */}
      <View className="divide-y divide-theme-border/60">
        {agenda.map((day) => (
          <View
            key={`${day.dayName}-${day.dateStr}`}
            className={`p-4 ${day.isToday ? 'bg-theme-accent-soft/10' : 'bg-theme-card'}`}
          >
            {/* Day Header */}
            <View className="flex-row items-center justify-between mb-2.5">
              <View className="flex-row items-center gap-2">
                <Text className="text-xs font-bold uppercase tracking-wider text-theme-muted">
                  {day.dayName}
                </Text>
                <Text className="text-xs font-bold text-theme-text">{day.dateStr}</Text>

                {day.isToday && (
                  <View className="bg-theme-accent px-2 py-0.5 rounded-md">
                    <Text className="text-[9px] font-extrabold text-white uppercase">Today</Text>
                  </View>
                )}
              </View>

              {/* Day + Add Button */}
              <TouchableOpacity
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onAddWorkoutToDay(day.dayName, day.dateStr);
                }}
                className="flex-row items-center gap-0.5 px-2.5 py-1 bg-theme-bg rounded-lg border border-theme-border"
              >
                <Ionicons name="add" size={12} color="#16ACBD" />
                <Text className="text-[10px] font-bold text-theme-accent">Add</Text>
              </TouchableOpacity>
            </View>

            {/* Workouts inside this Day */}
            {day.workouts.length === 0 ? (
              <View className="py-2.5 px-3 bg-theme-bg/40 rounded-xl border border-dashed border-theme-border/60">
                <Text className="text-[11px] text-theme-muted/60 italic">Rest / Recovery Day</Text>
              </View>
            ) : (
              <View className="space-y-2">
                {day.workouts.map((workout) => {
                  const cfg = getDisciplineConfig(workout.type);

                  return (
                    <TouchableOpacity
                      key={workout.id}
                      onPress={() => {
                        Haptics.selectionAsync();
                        onSelectWorkout(workout);
                      }}
                      activeOpacity={0.85}
                      className={`p-3.5 rounded-xl border border-l-4 ${cfg.borderLeft} ${cfg.borderColor} bg-theme-card shadow-sm my-1`}
                    >
                      <View className="flex-row items-center justify-between mb-1">
                        <View className={`px-2 py-0.5 rounded ${cfg.bg} flex-row items-center gap-1`}>
                          <Ionicons name={cfg.icon as any} size={11} color={workout.type === 'SWIM' ? '#208AEF' : workout.type === 'RUN' ? '#F97316' : workout.type === 'BIKE' ? '#10B981' : '#A855F7'} />
                          <Text className={`text-[10px] font-extrabold tracking-wider ${cfg.text}`}>
                            {cfg.label}
                          </Text>
                        </View>

                        {workout.isCompleted ? (
                          <View className="flex-row items-center gap-1 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                            <Ionicons name="checkmark-circle" size={12} color="#10B981" />
                            <Text className="text-[9px] font-extrabold text-emerald-500">DONE</Text>
                          </View>
                        ) : (
                          <Text className="text-[10px] text-theme-muted font-mono">
                            {workout.sparkPoints} Spark
                          </Text>
                        )}
                      </View>

                      <Text className="text-sm font-extrabold text-theme-text mb-1">
                        {workout.title}
                      </Text>

                      <View className="flex-row items-center justify-between">
                        <Text className="text-[11px] text-theme-muted">
                          {workout.duration || '45 mins'}
                        </Text>

                        {workout.isStructured && (
                          <Text className="text-[10px] text-theme-accent font-semibold">
                            Structured
                          </Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        ))}
      </View>
    </Card>
  );
}
