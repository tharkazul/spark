import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
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
    // The plan stores sport in title case ('Bike'), while these cases are
    // upper. Every workout therefore fell through to the REST branch and
    // rendered a moon. Normalise before matching.
    switch (String(type || '').toUpperCase()) {
      case 'SWIM':
        return {
          bg: 'bg-[#2E8FE0]/15',
          text: 'text-[#38BDF8]',
          borderLeft: 'border-l-[#38BDF8]',
          label: 'SWIM',
          icon: 'water-outline',
          badgeColor: '#38BDF8',
        };
      case 'RUN':
        return {
          bg: 'bg-[#FF5F3B]/15',
          text: 'text-[#FB923C]',
          borderLeft: 'border-l-[#FB923C]',
          label: 'RUN',
          icon: 'walk-outline',
          badgeColor: '#FB923C',
        };
      case 'BIKE':
        return {
          bg: 'bg-[#10B981]/15',
          text: 'text-[#34D399]',
          borderLeft: 'border-l-[#34D399]',
          label: 'BIKE',
          icon: 'bicycle-outline',
          badgeColor: '#34D399',
        };
      case 'STRENGTH':
        return {
          bg: 'bg-[#A855F7]/15',
          text: 'text-[#C084FC]',
          borderLeft: 'border-l-[#C084FC]',
          label: 'STRENGTH',
          icon: 'barbell-outline',
          badgeColor: '#C084FC',
        };
      case 'MOBILITY':
        return {
          bg: 'bg-[#14B8A6]/15',
          text: 'text-[#2DD4BF]',
          borderLeft: 'border-l-[#2DD4BF]',
          label: 'MOBILITY',
          icon: 'body-outline',
          badgeColor: '#2DD4BF',
        };
      default:
        return {
          bg: 'bg-slate-700/20',
          text: 'text-slate-400',
          borderLeft: 'border-l-slate-400',
          label: 'REST',
          icon: 'moon-outline',
          badgeColor: '#94A3B8',
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
    <View className="p-0 overflow-hidden mb-8 rounded-3xl bg-theme-card/80 shadow-sm">
      {/* Header & Week Navigator */}
      <View className="p-4 bg-theme-bg/40">
        <View className="flex-row items-center justify-between gap-2 mb-3">
          {/* Title */}
          <View className="flex-row items-center gap-2">
            <View className="w-8 h-8 rounded-xl bg-theme-accent/15 items-center justify-center">
              <Ionicons name="calendar-outline" size={16} color="#38BDF8" />
            </View>
            <Text className="text-lg font-extrabold text-theme-text">Week Plan</Text>
          </View>

          {/* Week Selector Navigator */}
          <View className="flex-row items-center bg-theme-bg/80 rounded-xl px-2 py-1 shrink-0">
            <TouchableOpacity onPress={handlePrev} className="px-2 py-1 active:opacity-60">
              <Ionicons name="chevron-back" size={14} color="#38BDF8" />
            </TouchableOpacity>

            <Text className="text-xs font-mono font-extrabold text-theme-text px-1">
              {weekRangeLabel}
            </Text>

            <TouchableOpacity onPress={handleNext} className="px-2 py-1 active:opacity-60">
              <Ionicons name="chevron-forward" size={14} color="#38BDF8" />
            </TouchableOpacity>
          </View>
        </View>

        {/* AI Action Button */}
        <TouchableOpacity
          onPress={handleGenerate}
          disabled={isLoading}
          activeOpacity={0.85}
          className={`w-full bg-theme-accent py-3 px-4 rounded-2xl flex-row items-center justify-center gap-2 ${
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
              <Ionicons name="flash" size={16} color="#FFFFFF" />
              <Text className="text-sm font-extrabold text-white">
                Auto-Generate Week with AI Coach
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
                  className="bg-theme-bg/60 p-3 rounded-2xl flex-row items-center justify-between gap-2 active:bg-theme-accent/10"
                >
                  <View className="flex-row items-center gap-2.5 flex-1 min-w-0">
                    <Text className="text-xs font-extrabold text-theme-muted shrink-0">
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
                              className={`px-2 py-0.5 rounded-md ${cfg.bg} flex-row items-center gap-1 shrink min-w-0`}
                            >
                              <Ionicons name={cfg.icon as any} size={11} color={cfg.badgeColor} />
                              <Text
                                numberOfLines={1}
                                className={`text-xs font-bold ${cfg.text} shrink`}
                              >
                                {w.title}
                              </Text>
                            </View>
                          );
                        })}
                      </View>
                    ) : (
                      <View className="px-2 py-0.5 rounded-md bg-slate-700/20 flex-row items-center gap-1">
                        <Ionicons name="moon-outline" size={11} color="#94A3B8" />
                        <Text className="text-xs font-bold text-slate-400">Rest / Recovery Day</Text>
                      </View>
                    )}
                  </View>

                  <View className="flex-row items-center gap-2 shrink-0">
                    {hasWorkouts && day.workouts.every((w) => w.isCompleted) && (
                      <View className="flex-row items-center gap-1 bg-emerald-500/15 px-2 py-0.5 rounded-full">
                        <Ionicons name="checkmark-circle" size={11} color="#10B981" />
                        <Text className="text-xs font-extrabold text-emerald-500">DONE</Text>
                      </View>
                    )}

                    {/* Distinct Expand Chevron */}
                    <View className="w-6 h-6 rounded-full bg-theme-bg/80 items-center justify-center">
                      <Ionicons name="chevron-down" size={13} color="#38BDF8" />
                    </View>
                  </View>
                </TouchableOpacity>
              ) : (
                /* FULL EXPANDED VIEW */
                <View
                  className={`rounded-2xl ${
                    day.isToday
                      ? 'bg-theme-card/90'
                      : 'bg-theme-card/60'
                  } overflow-hidden`}
                >
                  {/* Interactive Header Row */}
                  <TouchableOpacity
                    onPress={() => toggleDayExpanded(day)}
                    activeOpacity={0.75}
                    className={`px-3.5 py-2.5 flex-row items-center justify-between ${
                      day.isToday
                        ? 'bg-theme-accent-soft/20'
                        : 'bg-theme-bg/60'
                    }`}
                  >
                    <View className="flex-row items-center gap-2">
                      <Text className="text-xs font-extrabold text-theme-muted">
                        {day.dayName}
                      </Text>
                      <Text className="text-xs font-extrabold text-theme-text">{day.dateStr}</Text>

                      {day.isToday && (
                        <View className="bg-theme-accent px-2.5 py-0.5 rounded-full">
                          <Text className="text-xs font-extrabold text-white">
                            Today
                          </Text>
                        </View>
                      )}

                      <Ionicons name="chevron-up" size={14} color="#38BDF8" />
                    </View>

                    {/* "+ Add" Button */}
                    <TouchableOpacity
                      onPress={(e) => {
                        e.stopPropagation();
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        onAddWorkoutToDay(day.dayName, day.dateStr);
                      }}
                      activeOpacity={0.8}
                      className="flex-row items-center gap-1 px-3 py-1 rounded-full bg-theme-accent/15 active:bg-theme-accent/30"
                    >
                      <Ionicons name="add-circle-outline" size={14} color="#38BDF8" />
                      <Text className="text-xs font-extrabold text-theme-accent">Add</Text>
                    </TouchableOpacity>
                  </TouchableOpacity>

                  {/* Day Workouts Container */}
                  <View className="p-3 bg-theme-bg/30 space-y-2.5">
                    {!hasWorkouts ? (
                      <View className="py-3 px-3.5 bg-theme-bg/40 rounded-xl flex-row items-center gap-2">
                        <Ionicons name="moon-outline" size={16} color="#94A3B8" />
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
                            className={`p-3.5 rounded-xl border-l-4 ${cfg.borderLeft} bg-theme-card/80 flex-col gap-2 active:bg-theme-accent/5`}
                          >
                            {/* Top Line: Discipline Tag & Rooka Score */}
                            <View className="flex-row items-center justify-between">
                              <View className={`px-2.5 py-0.5 rounded-md ${cfg.bg} flex-row items-center gap-1.5`}>
                                <Ionicons name={cfg.icon as any} size={13} color={cfg.badgeColor} />
                                <Text className={`text-xs font-extrabold ${cfg.text}`}>
                                  {cfg.label}
                                </Text>
                              </View>

                              <View className="flex-row items-center gap-2">
                                <Text className="text-xs font-mono font-bold text-theme-accent">
                                  +{Math.round(workout.rookaPoints || 0)} Rooka
                                </Text>

                                {workout.isCompleted && (
                                  <View className="flex-row items-center gap-1 bg-emerald-500/15 px-2 py-0.5 rounded-full">
                                    <Ionicons name="checkmark-circle" size={12} color="#10B981" />
                                    <Text className="text-xs font-extrabold text-emerald-500">DONE</Text>
                                  </View>
                                )}
                              </View>
                            </View>

                            {/* Workout Title */}
                            <Text className="text-sm font-extrabold text-theme-text leading-snug">
                              {workout.title}
                            </Text>

                            {/* Subline: Human Duration & Chevron */}
                            <View className="flex-row items-center justify-between pt-1">
                              <Text className="text-xs text-theme-muted font-medium">
                                {workout.duration || '45 min'} session · +{Math.round(workout.rookaPoints || 0)} Rooka
                              </Text>

                              {workout.actualMetrics ? (
                                <Text className="text-xs font-mono font-bold text-emerald-500">
                                  {workout.actualMetrics}
                                </Text>
                              ) : (
                                <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
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
    </View>
  );
}
