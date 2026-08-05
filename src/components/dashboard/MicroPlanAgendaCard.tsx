import React, { useState } from 'react';
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
  // Track expanded state per day (default today or none expanded for maximum overview density)
  const [expandedDays, setExpandedDays] = useState<Record<string, boolean>>({
    'FRI-Jul 24': true, // Keep today expanded by default
  });

  const toggleDayExpanded = (dayKey: string) => {
    Haptics.selectionAsync();
    setExpandedDays((prev) => ({
      ...prev,
      [dayKey]: !prev[dayKey],
    }));
  };

  const getDisciplineConfig = (type: SportType) => {
    switch (type) {
      case 'SWIM':
        return {
          bg: 'bg-blue-500/15',
          text: 'text-blue-500',
          borderColor: 'border-blue-500/30',
          label: 'SWIM',
          icon: 'water-outline',
          badgeColor: '#208AEF',
        };
      case 'RUN':
        return {
          bg: 'bg-amber-500/15',
          text: 'text-amber-500',
          borderColor: 'border-amber-500/30',
          label: 'RUN',
          icon: 'walk-outline',
          badgeColor: '#F97316',
        };
      case 'BIKE':
        return {
          bg: 'bg-emerald-500/15',
          text: 'text-emerald-500',
          borderColor: 'border-emerald-500/30',
          label: 'BIKE',
          icon: 'bicycle-outline',
          badgeColor: '#10B981',
        };
      case 'STRENGTH':
        return {
          bg: 'bg-purple-500/15',
          text: 'text-purple-500',
          borderColor: 'border-purple-500/30',
          label: 'STRENGTH',
          icon: 'barbell-outline',
          badgeColor: '#A855F7',
        };
      case 'MOBILITY':
        return {
          bg: 'bg-teal-500/15',
          text: 'text-teal-500',
          borderColor: 'border-teal-500/30',
          label: 'MOBILITY',
          icon: 'body-outline',
          badgeColor: '#16ACBD',
        };
      default:
        return {
          bg: 'bg-gray-500/15',
          text: 'text-gray-400',
          borderColor: 'border-gray-500/30',
          label: 'REST',
          icon: 'moon-outline',
          badgeColor: '#8E9BA4',
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
      <View className="p-4 border-b border-theme-border bg-theme-bg/50">
        <View className="flex-row items-center justify-between gap-2 mb-3">
          {/* Title: Week Plan */}
          <View className="flex-row items-center gap-2 flex-1">
            <View className="w-8 h-8 rounded-xl bg-theme-accent/15 border border-theme-accent/30 items-center justify-center">
              <Ionicons name="calendar-outline" size={16} color="#16ACBD" />
            </View>
            <Text className="text-base font-extrabold text-theme-text">Week Plan</Text>
          </View>

          {/* Week Selector Navigator (Fixed width, never falls off page!) */}
          <View className="flex-row items-center bg-theme-card border border-theme-border rounded-xl px-1.5 py-1 shadow-sm shrink-0">
            <TouchableOpacity onPress={handlePrev} className="px-1.5 py-0.5">
              <Ionicons name="chevron-back" size={14} color="#8E9BA4" />
            </TouchableOpacity>

            <Text className="text-xs font-mono font-bold text-theme-text px-1">
              {weekRangeLabel}
            </Text>

            <TouchableOpacity onPress={handleNext} className="px-1.5 py-0.5">
              <Ionicons name="chevron-forward" size={14} color="#8E9BA4" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Auto Generate Button */}
        <TouchableOpacity
          onPress={handleGenerate}
          activeOpacity={0.8}
          className="w-full bg-theme-card border border-theme-accent/40 py-2 px-3 rounded-xl flex-row items-center justify-center gap-1.5 shadow-sm"
        >
          <Ionicons name="sparkles" size={13} color="#16ACBD" />
          <Text className="text-xs font-bold text-theme-accent">Auto-Generate Week</Text>
        </TouchableOpacity>
      </View>

      {/* Condensed 7-Day Agenda List */}
      <View className="divide-y divide-theme-border/50">
        {agenda.map((day) => {
          const dayKey = `${day.dayName}-${day.dateStr}`;
          const isExpanded = !!expandedDays[dayKey];
          const hasWorkouts = day.workouts.length > 0;

          return (
            <View
              key={dayKey}
              className={`${day.isToday ? 'bg-theme-accent-soft/10' : 'bg-theme-card'}`}
            >
              {/* Condensed Day Summary Row (Always Visible!) */}
              <TouchableOpacity
                onPress={() => toggleDayExpanded(dayKey)}
                activeOpacity={0.7}
                className="p-3 flex-row items-center justify-between gap-3"
              >
                {/* Left: Day & Date Badge */}
                <View className="w-24 flex-row items-center gap-1.5 shrink-0">
                  <View className="flex-row items-center gap-1">
                    <Text className="text-xs font-extrabold uppercase tracking-wider text-theme-muted">
                      {day.dayName}
                    </Text>
                    <Text className="text-xs font-bold text-theme-text">{day.dateStr}</Text>
                  </View>

                  {day.isToday && (
                    <View className="bg-theme-accent px-1.5 py-0.5 rounded">
                      <Text className="text-[8px] font-extrabold text-white uppercase">Today</Text>
                    </View>
                  )}
                </View>

                {/* Middle: Condensed Workout Summary Pills (Supports Multi-Sport!) */}
                <View className="flex-1 space-y-1">
                  {!hasWorkouts ? (
                    <Text className="text-[11px] text-theme-muted/60 italic">Rest / Recovery Day</Text>
                  ) : (
                    day.workouts.map((workout) => {
                      const cfg = getDisciplineConfig(workout.type);

                      return (
                        <TouchableOpacity
                          key={workout.id}
                          onPress={() => {
                            Haptics.selectionAsync();
                            onSelectWorkout(workout);
                          }}
                          activeOpacity={0.8}
                          className="flex-row items-center justify-between bg-theme-bg/80 border border-theme-border/60 px-2.5 py-1.5 rounded-lg gap-2"
                        >
                          <View className="flex-row items-center gap-1.5 flex-1 min-w-0">
                            <Ionicons name={cfg.icon as any} size={12} color={cfg.badgeColor} />
                            <Text
                              numberOfLines={1}
                              className="text-xs font-bold text-theme-text flex-1"
                            >
                              {workout.title}
                            </Text>
                          </View>

                          <View className="flex-row items-center gap-1.5 shrink-0">
                            <Text className="text-[10px] font-mono font-bold text-theme-accent">
                              {workout.sparkPoints} Spark
                            </Text>
                            {workout.isCompleted && (
                              <Ionicons name="checkmark-circle" size={13} color="#10B981" />
                            )}
                          </View>
                        </TouchableOpacity>
                      );
                    })
                  )}
                </View>

                {/* Right: Expand Chevron */}
                <View className="flex-row items-center gap-1 shrink-0">
                  <Ionicons
                    name={isExpanded ? 'chevron-up' : 'chevron-down'}
                    size={15}
                    color="#8E9BA4"
                  />
                </View>
              </TouchableOpacity>

              {/* Expanded Details Area */}
              {isExpanded && (
                <View className="px-3 pb-3 pt-1 bg-theme-bg/30 border-t border-theme-border/30">
                  <View className="flex-row justify-between items-center mb-2">
                    <Text className="text-[10px] uppercase font-bold text-theme-muted tracking-wider">
                      Full Day Details
                    </Text>
                    <TouchableOpacity
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        onAddWorkoutToDay(day.dayName, day.dateStr);
                      }}
                      className="flex-row items-center gap-1 px-2.5 py-1 bg-theme-accent/15 rounded-md border border-theme-accent/30"
                    >
                      <Ionicons name="add" size={12} color="#16ACBD" />
                      <Text className="text-[10px] font-bold text-theme-accent">Add Exercise</Text>
                    </TouchableOpacity>
                  </View>

                  {!hasWorkouts ? (
                    <Text className="text-xs text-theme-muted italic py-1">No workouts planned for this day.</Text>
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
                            className={`p-3 rounded-xl border border-l-4 ${cfg.borderColor} bg-theme-card shadow-sm`}
                          >
                            <View className="flex-row items-center justify-between mb-1">
                              <View className={`px-2 py-0.5 rounded ${cfg.bg} flex-row items-center gap-1`}>
                                <Ionicons name={cfg.icon as any} size={11} color={cfg.badgeColor} />
                                <Text className={`text-[10px] font-extrabold ${cfg.text}`}>
                                  {cfg.label}
                                </Text>
                              </View>
                              <Text className="text-[10px] text-theme-muted font-mono">
                                {workout.sparkPoints} Spark
                              </Text>
                            </View>

                            <Text className="text-sm font-bold text-theme-text mb-1">
                              {workout.title}
                            </Text>

                            <View className="flex-row items-center justify-between text-xs">
                              <Text className="text-xs text-theme-muted">
                                Duration: {workout.duration || '45 mins'}
                              </Text>
                              <Text className="text-[10px] font-bold text-theme-accent">Tap to Edit</Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </View>
              )}
            </View>
          );
        })}
      </View>
    </Card>
  );
}
