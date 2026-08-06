import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Card } from '../ui/Card';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { WorkoutItem, SportType } from '../../types/dashboard';

export interface DayAgenda {
  dayName: string; // e.g. 'MON', 'TUE'
  dateStr: string; // e.g. 'Aug 3'
  isToday?: boolean;
  isPast?: boolean;
  workouts: WorkoutItem[];
}

interface MicroPlanAgendaCardProps {
  weekRangeLabel: string; // e.g. 'Aug 3 - Aug 9'
  agenda: DayAgenda[];
  isGenerating?: boolean; // Controls loading state during AI generation
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onAutoGenerate: () => void | Promise<void>;
  onAddWorkoutToDay: (dayName: string, dateStr: string) => void;
  onSelectWorkout: (workout: WorkoutItem) => void;
}

export function MicroPlanAgendaCard({
  weekRangeLabel,
  agenda,
  isGenerating,
  onPrevWeek,
  onNextWeek,
  onAutoGenerate,
  onAddWorkoutToDay,
  onSelectWorkout,
}: MicroPlanAgendaCardProps) {
  // Track expanded state per day
  const [expandedDays, setExpandedDays] = useState<Record<string, boolean>>({});
  const [internalGenerating, setInternalGenerating] = useState(false);

  const isLoading = isGenerating !== undefined ? isGenerating : internalGenerating;

  const isDayExpanded = (day: DayAgenda): boolean => {
    const key = `${day.dayName}-${day.dateStr}`;
    if (expandedDays[key] !== undefined) {
      return expandedDays[key];
    }
    const isPastOrCompleted =
      day.isPast ||
      (!day.isToday &&
        (day.workouts.length === 0 || day.workouts.every((w) => w.isCompleted)));
    return !isPastOrCompleted;
  };

  const toggleDayExpanded = (day: DayAgenda) => {
    const key = `${day.dayName}-${day.dateStr}`;
    const current = isDayExpanded(day);
    Haptics.selectionAsync();
    setExpandedDays((prev) => ({
      ...prev,
      [key]: !current,
    }));
  };

  const getDisciplineConfig = (type: SportType) => {
    switch (type) {
      case 'SWIM':
        return {
          bg: 'bg-blue-500/15',
          text: 'text-blue-500',
          borderColor: 'border-blue-500',
          borderLeft: 'border-l-blue-500',
          label: 'SWIM',
          icon: 'water-outline',
          badgeColor: '#208AEF',
        };
      case 'RUN':
        return {
          bg: 'bg-amber-500/15',
          text: 'text-amber-500',
          borderColor: 'border-amber-500',
          borderLeft: 'border-l-amber-500',
          label: 'RUN',
          icon: 'walk-outline',
          badgeColor: '#F97316',
        };
      case 'BIKE':
        return {
          bg: 'bg-emerald-500/15',
          text: 'text-emerald-500',
          borderColor: 'border-emerald-500',
          borderLeft: 'border-l-emerald-500',
          label: 'BIKE',
          icon: 'bicycle-outline',
          badgeColor: '#10B981',
        };
      case 'STRENGTH':
        return {
          bg: 'bg-purple-500/15',
          text: 'text-purple-500',
          borderColor: 'border-purple-500',
          borderLeft: 'border-l-purple-500',
          label: 'STRENGTH',
          icon: 'barbell-outline',
          badgeColor: '#A855F7',
        };
      case 'MOBILITY':
        return {
          bg: 'bg-teal-500/15',
          text: 'text-teal-500',
          borderColor: 'border-teal-500',
          borderLeft: 'border-l-teal-500',
          label: 'MOBILITY',
          icon: 'body-outline',
          badgeColor: '#16ACBD',
        };
      default:
        return {
          bg: 'bg-gray-500/15',
          text: 'text-gray-400',
          borderColor: 'border-gray-500',
          borderLeft: 'border-l-gray-400',
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

  const handleGenerate = async () => {
    if (isLoading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    if (isGenerating === undefined) {
      setInternalGenerating(true);
    }
    
    try {
      await onAutoGenerate();
    } finally {
      if (isGenerating === undefined) {
        setTimeout(() => {
          setInternalGenerating(false);
        }, 2200);
      }
    }
  };

  return (
    <Card className="p-0 overflow-hidden mb-8 border-theme-border/60 bg-theme-card">
      {/* Header & Week Navigator */}
      <View className="p-4 border-b border-theme-border/50 bg-theme-bg/40">
        <View className="flex-row items-center justify-between gap-2 mb-3">
          {/* Title */}
          <View className="flex-row items-center gap-2">
            <View className="w-8 h-8 rounded-xl bg-theme-accent/15 border border-theme-accent/30 items-center justify-center">
              <Ionicons name="calendar-outline" size={16} color="#16ACBD" />
            </View>
            <Text className="text-lg font-extrabold text-theme-text">Week Plan</Text>
          </View>

          {/* Week Selector Navigator */}
          <View className="flex-row items-center bg-theme-bg border border-theme-border/70 rounded-xl px-2 py-1 shrink-0">
            <TouchableOpacity onPress={handlePrev} className="px-2 py-1 active:opacity-60">
              <Ionicons name="chevron-back" size={14} color="#16ACBD" />
            </TouchableOpacity>

            <Text className="text-xs font-mono font-extrabold text-theme-text px-1">
              {weekRangeLabel}
            </Text>

            <TouchableOpacity onPress={handleNext} className="px-2 py-1 active:opacity-60">
              <Ionicons name="chevron-forward" size={14} color="#16ACBD" />
            </TouchableOpacity>
          </View>
        </View>

        {/* PROMINENT AI PRIMARY ACTION BUTTON (Solid background, never disappears!) */}
        <TouchableOpacity
          onPress={handleGenerate}
          disabled={isLoading}
          activeOpacity={0.85}
          className={`w-full bg-theme-accent py-3 px-4 rounded-xl flex-row items-center justify-center gap-2 ${
            isLoading ? 'opacity-80' : 'active:opacity-90'
          }`}
        >
          {isLoading ? (
            <View className="flex-row items-center justify-center gap-2">
              <ActivityIndicator size="small" color="#FFFFFF" />
              <Text className="text-sm font-extrabold text-white">
                Building your training week...
              </Text>
            </View>
          ) : (
            <View className="flex-row items-center justify-center gap-2">
              <Ionicons name="sparkles" size={16} color="#FFFFFF" />
              <Text className="text-sm font-extrabold text-white">
                Auto-Generate Week with Spark AI
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* 7-Day Agenda List */}
      <View className="p-4 space-y-3.5">
        {agenda.map((day) => {
          const expanded = isDayExpanded(day);
          const hasWorkouts = day.workouts.length > 0;

          return (
            <View key={`${day.dayName}-${day.dateStr}`}>
              {/* COLLAPSED 1-LINE VIEW */}
              {!expanded ? (
                <TouchableOpacity
                  onPress={() => toggleDayExpanded(day)}
                  activeOpacity={0.75}
                  className="bg-theme-bg/80 border border-theme-border/60 p-3 rounded-2xl flex-row items-center justify-between gap-2 active:bg-theme-accent/10"
                >
                  <View className="flex-row items-center gap-2.5 flex-1 min-w-0">
                    <Text className="text-xs font-black uppercase tracking-wider text-theme-muted shrink-0">
                      {day.dayName} {day.dateStr}
                    </Text>

                    {/* Summary Badges */}
                    {hasWorkouts ? (
                      <View className="flex-row items-center gap-1.5 flex-1 min-w-0">
                        {day.workouts.map((w) => {
                          const cfg = getDisciplineConfig(w.type);
                          return (
                            <View
                              key={w.id}
                              className={`px-2 py-0.5 rounded-md ${cfg.bg} border border-theme-border/40 flex-row items-center gap-1 shrink min-w-0`}
                            >
                              <Ionicons name={cfg.icon as any} size={11} color={cfg.badgeColor} />
                              <Text
                                numberOfLines={1}
                                className={`text-[10px] font-bold ${cfg.text} shrink`}
                              >
                                {w.title}
                              </Text>
                            </View>
                          );
                        })}
                      </View>
                    ) : (
                      <View className="px-2 py-0.5 rounded-md bg-gray-500/15 border border-gray-500/20 flex-row items-center gap-1">
                        <Ionicons name="moon-outline" size={11} color="#8E9BA4" />
                        <Text className="text-[10px] font-bold text-gray-400">Rest / Recovery Day</Text>
                      </View>
                    )}
                  </View>

                  <View className="flex-row items-center gap-2 shrink-0">
                    {hasWorkouts && day.workouts.every((w) => w.isCompleted) && (
                      <View className="flex-row items-center gap-1 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                        <Ionicons name="checkmark-circle" size={11} color="#10B981" />
                        <Text className="text-[9px] font-extrabold text-emerald-500">DONE</Text>
                      </View>
                    )}

                    {/* Distinct Expand Chevron */}
                    <View className="w-6 h-6 rounded-full bg-theme-card border border-theme-border/60 items-center justify-center">
                      <Ionicons name="chevron-down" size={13} color="#16ACBD" />
                    </View>
                  </View>
                </TouchableOpacity>
              ) : (
                /* FULL EXPANDED VIEW */
                <View
                  className={`rounded-2xl border ${
                    day.isToday
                      ? 'bg-theme-card border-theme-accent/50'
                      : 'bg-theme-card border-theme-border/70'
                  } overflow-hidden`}
                >
                  {/* Interactive Header Row */}
                  <TouchableOpacity
                    onPress={() => toggleDayExpanded(day)}
                    activeOpacity={0.75}
                    className={`px-3.5 py-2.5 flex-row items-center justify-between border-b ${
                      day.isToday
                        ? 'bg-theme-accent-soft/30 border-theme-accent/30'
                        : 'bg-theme-bg/80 border-theme-border/40'
                    }`}
                  >
                    <View className="flex-row items-center gap-2">
                      <Text className="text-xs font-black uppercase tracking-wider text-theme-muted">
                        {day.dayName}
                      </Text>
                      <Text className="text-xs font-extrabold text-theme-text">{day.dateStr}</Text>

                      {day.isToday && (
                        <View className="bg-theme-accent px-2.5 py-0.5 rounded-full">
                          <Text className="text-[9px] font-extrabold text-white uppercase tracking-wider">
                            Today
                          </Text>
                        </View>
                      )}

                      <Ionicons name="chevron-up" size={14} color="#16ACBD" />
                    </View>

                    {/* Distinct "+ Add" Button */}
                    <TouchableOpacity
                      onPress={(e) => {
                        e.stopPropagation();
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        onAddWorkoutToDay(day.dayName, day.dateStr);
                      }}
                      activeOpacity={0.8}
                      className="flex-row items-center gap-1 px-3 py-1 rounded-xl bg-theme-accent/15 border border-theme-accent/40 active:bg-theme-accent/30"
                    >
                      <Ionicons name="add-circle-outline" size={14} color="#16ACBD" />
                      <Text className="text-xs font-extrabold text-theme-accent">Add</Text>
                    </TouchableOpacity>
                  </TouchableOpacity>

                  {/* Day Workouts Container */}
                  <View className="p-3 bg-theme-bg/30 space-y-2.5">
                    {!hasWorkouts ? (
                      <View className="py-3 px-3.5 bg-theme-bg/60 rounded-xl border border-theme-border/40 flex-row items-center gap-2">
                        <Ionicons name="moon-outline" size={16} color="#8E9BA4" />
                        <Text className="text-xs font-bold text-theme-muted">Rest / Recovery Day</Text>
                      </View>
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
                            activeOpacity={0.75}
                            className={`p-3.5 rounded-xl border border-l-4 ${cfg.borderLeft} ${cfg.borderColor} bg-theme-card shadow-sm flex-col gap-2 active:bg-theme-accent/5`}
                          >
                            {/* Top Line: Discipline Tag & Spark Score */}
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

                                {workout.isCompleted && (
                                  <View className="flex-row items-center gap-1 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                                    <Ionicons name="checkmark-circle" size={12} color="#10B981" />
                                    <Text className="text-[9px] font-extrabold text-emerald-500">DONE</Text>
                                  </View>
                                )}
                              </View>
                            </View>

                            {/* Workout Title */}
                            <Text className="text-sm font-extrabold text-theme-text leading-snug">
                              {workout.title}
                            </Text>

                            {/* Subline: Duration, Telemetry & Clickable Edit Indicator */}
                            <View className="flex-row items-center justify-between pt-1 border-t border-theme-border/30">
                              <Text className="text-xs text-theme-muted font-bold">
                                Duration: {workout.duration || '45 mins'}
                              </Text>

                              {workout.actualMetrics ? (
                                <Text className="text-xs font-mono font-bold text-emerald-500">
                                  {workout.actualMetrics}
                                </Text>
                              ) : (
                                <View className="flex-row items-center gap-1">
                                  <Text className="text-xs font-bold text-theme-accent">Tap to edit</Text>
                                  <Ionicons name="arrow-forward" size={12} color="#16ACBD" />
                                </View>
                              )}
                            </View>
                          </TouchableOpacity>
                        );
                      })
                    )}
                  </View>
                </View>
              )}
            </View>
          );
        })}
      </View>
    </Card>
  );
}
