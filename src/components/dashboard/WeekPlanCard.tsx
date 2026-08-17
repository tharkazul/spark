import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { Card } from '../ui/Card';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { SideBySideWeekBar } from './SideBySideWeekBar';
import { DetailedDayCard } from './DetailedDayCard';
import { DayAgenda } from './MicroPlanAgendaCard';
import { WorkoutItem } from '../../types/dashboard';

interface WeekPlanCardProps {
  weekRangeLabel: string; // e.g. 'Aug 3 - Aug 9'
  agenda: DayAgenda[];
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onAdaptPress: () => void;
  onAddWorkoutToDay: (dayName: string, dateStr: string) => void;
  onSelectWorkout: (workout: WorkoutItem) => void;
  onDeleteWorkout: (workoutId: string) => void;
}

export function WeekPlanCard({
  weekRangeLabel,
  agenda,
  onPrevWeek,
  onNextWeek,
  onAdaptPress,
  onAddWorkoutToDay,
  onSelectWorkout,
  onDeleteWorkout,
}: WeekPlanCardProps) {
  const [selectedDayIndex, setSelectedDayIndex] = useState<number>(() => {
    const idx = agenda.findIndex((d) => d.isToday);
    return idx >= 0 ? idx : 0;
  });

  const dayCardRefs = useRef<Record<number, View | null>>({});

  const handleInvitePartner = (workout: WorkoutItem) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  return (
    <View className="mb-8">
      {/* 1. Header & Week Navigator (Auto Generate button removed!) */}
      <Card className="p-4 bg-theme-card mb-4">
        <View className="flex-row items-center justify-between gap-2">
          {/* Title */}
          <View className="flex-row items-center gap-2">
            <View className="w-8 h-8 rounded-xl bg-theme-accent/15 items-center justify-center">
              <Ionicons name="calendar-outline" size={16} color="#16ACBD" />
            </View>
            <Text className="text-lg font-extrabold text-theme-text">Week Plan</Text>
          </View>

          {/* Week Selector Navigator */}
          <View className="flex-row items-center bg-theme-bg rounded-xl px-2 py-1 shrink-0">
            <TouchableOpacity onPress={onPrevWeek} className="px-2 py-1 active:opacity-60">
              <Ionicons name="chevron-back" size={14} color="#16ACBD" />
            </TouchableOpacity>

            <Text className="text-xs font-mono font-extrabold text-theme-text px-1">
              {weekRangeLabel}
            </Text>

            <TouchableOpacity onPress={onNextWeek} className="px-2 py-1 active:opacity-60">
              <Ionicons name="chevron-forward" size={14} color="#16ACBD" />
            </TouchableOpacity>
          </View>
        </View>
      </Card>

      {/* 2. Side-by-Side Day Overview Bar (7 vertical cards with SVG icons) */}
      <SideBySideWeekBar
        agenda={agenda}
        selectedDayIndex={selectedDayIndex}
        onSelectDay={(idx) => {
          setSelectedDayIndex(idx);
        }}
      />

      {/* 3. Detailed Day Cards Feed */}
      <View className="space-y-4">
        {agenda.map((day, idx) => (
          <View
            key={`${day.dayName}-${day.dateStr}`}
            ref={(el) => {
              dayCardRefs.current[idx] = el;
            }}
          >
            <DetailedDayCard
              day={day}
              onAdaptPress={onAdaptPress}
              onAddWorkout={onAddWorkoutToDay}
              onSelectWorkout={onSelectWorkout}
              onDeleteWorkout={onDeleteWorkout}
              onInvitePartner={handleInvitePartner}
            />
          </View>
        ))}
      </View>
    </View>
  );
}
