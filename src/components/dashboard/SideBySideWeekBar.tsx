import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { DayAgenda } from './MicroPlanAgendaCard';
import { SportType } from '../../types/dashboard';

interface SideBySideWeekBarProps {
  agenda: DayAgenda[];
  selectedDayIndex?: number;
  onSelectDay: (index: number, dayName: string) => void;
}

export function SideBySideWeekBar({
  agenda,
  selectedDayIndex,
  onSelectDay,
}: SideBySideWeekBarProps) {
  const getSportIcon = (type: SportType) => {
    switch (type) {
      case 'RUN':
        return { icon: 'walk-outline', color: '#D9A62E' };
      case 'BIKE':
        return { icon: 'bicycle-outline', color: '#4CAF6D' };
      case 'SWIM':
        return { icon: 'water-outline', color: '#2E8FE0' };
      case 'STRENGTH':
        return { icon: 'barbell-outline', color: '#B36AE0' };
      case 'MOBILITY':
        return { icon: 'body-outline', color: '#2EBFAF' };
      default:
        return { icon: 'moon-outline', color: '#6F6F79' };
    }
  };

  return (
    <View className="flex-row gap-1.5 p-1.5 bg-theme-bg/80 rounded-2xl border border-slate-200 mb-3">
      {agenda.map((day, idx) => {
        const isSelected = selectedDayIndex === idx;
        const isToday = day.isToday;
        const totalSpark = day.workouts.reduce((acc, w) => acc + w.sparkPoints, 0);
        const hasWorkouts = day.workouts.length > 0;

        return (
          <TouchableOpacity
            key={`${day.dayName}-${day.dateStr}`}
            onPress={() => {
              Haptics.selectionAsync();
              onSelectDay(idx, day.dayName);
            }}
            activeOpacity={0.8}
            className={`flex-1 rounded-xl overflow-hidden border ${
              isToday
                ? 'border-theme-accent border-[1.5px] bg-theme-card'
                : isSelected
                ? 'border-amber-500 border-[1.5px] bg-theme-card'
                : 'border-slate-200 bg-theme-card'
            }`}
          >
            <View
              className={`py-1 items-center justify-center ${
                isToday
                  ? 'bg-theme-accent'
                  : isSelected
                  ? 'bg-amber-500'
                  : 'bg-[#3B82F6]'
              }`}
            >
              <Text className="text-[10px] font-extrabold text-white uppercase tracking-wider">
                {day.dayName}
              </Text>
            </View>

            {/* Content Body: SVG Discipline Icons & Spark Score (No border outlines on icons!) */}
            <View className="p-1 items-center justify-between min-h-[66px] bg-theme-card">
              {/* SVG Vector Icons */}
              <View className="items-center justify-center gap-1 my-1 flex-1">
                {hasWorkouts ? (
                  day.workouts.map((w) => {
                    const cfg = getSportIcon(w.type);
                    return (
                      <View
                        key={w.id}
                        className="w-6.5 h-6.5 rounded-lg bg-theme-bg items-center justify-center"
                      >
                        <Ionicons name={cfg.icon as any} size={14} color={cfg.color} />
                      </View>
                    );
                  })
                ) : (
                  <View className="w-6.5 h-6.5 rounded-lg bg-gray-500/10 items-center justify-center">
                    <Ionicons name="moon-outline" size={14} color="#6F6F79" />
                  </View>
                )}
              </View>

              {/* Spark points or Completion Check */}
              <View className="items-center justify-center pt-0.5 border-t border-slate-200 w-full">
                {hasWorkouts && day.workouts.every((w) => w.isCompleted) ? (
                  <Ionicons name="checkmark-circle" size={12} color="#10B981" />
                ) : (
                  <Text className="text-[8.5px] font-mono font-extrabold text-theme-accent">
                    {totalSpark > 0 ? `${totalSpark} Spark` : 'Rest'}
                  </Text>
                )}
              </View>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
