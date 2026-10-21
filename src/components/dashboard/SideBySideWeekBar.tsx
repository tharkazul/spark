import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { DayAgenda } from './MicroPlanAgendaCard';
import { SportType } from '../../types/dashboard';
import { SportMedallion } from '../ui/SportMedallion';
import { useLanguage } from '../../context/LanguageContext';
import { getLocalizedDayAbbr } from './DetailedDayCard';

interface SideBySideWeekBarProps {
  agenda: DayAgenda[];
  selectedDayIndex?: number;
  onSelectDay: (index: number, dayName: string) => void;
}

interface WeekStripProps {
  agenda: DayAgenda[];
  selectedDayIndex?: number;
  onSelectDay?: (index: number, dayName: string) => void;
}

function WeekStrip({ agenda, selectedDayIndex, onSelectDay }: WeekStripProps) {
  const { t } = useLanguage();
  return (
    <View className="flex-row gap-1.5 w-full">
      {agenda.map((day, idx) => {
        const isSelected = selectedDayIndex === idx;
        const isToday = day.isToday;
        const isRest = (sport?: SportType | string) => String(sport || '').toUpperCase() === 'REST';
        const activeWorkouts = (day.workouts || []).filter((w) => !isRest(w.type));
        const hasActiveWorkouts = activeWorkouts.length > 0;
        const isCompleted = hasActiveWorkouts && activeWorkouts.every((w) => w.isCompleted);
        const isMissed = day.isPast && hasActiveWorkouts && !isCompleted;
        // Only completed (past) days that the plan scheduled as rest get a check; today is still in
        // progress and unplanned days were never committed rest (same rule as the streak).
        const hasPlannedRest = (day.workouts || []).some((w) => isRest(w.type));
        const isRestHonored = !hasActiveWorkouts && hasPlannedRest && Boolean(day.isPast) && !isToday;

        // The day number from the localized date: "Oct 21" in English, "21 okt" in Dutch.
        const dayNumber = (day.dateStr.match(/\d+/) || [''])[0];

        return (
          <TouchableOpacity
            key={`${day.dayName}-${day.dateStr}`}
            disabled={!onSelectDay}
            onPress={() => {
              Haptics.selectionAsync();
              onSelectDay?.(idx, day.dayName);
            }}
            activeOpacity={0.8}
            accessibilityRole="tab"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={`${getLocalizedDayAbbr(day.dayName, t)} ${day.dateStr}, ${hasActiveWorkouts ? t(`sports.${String(activeWorkouts[0].type || '').toLowerCase()}`, String(activeWorkouts[0].type || '')) : t('common.restDay')}`}
            style={{ height: 84 }}
            className={`flex-1 rounded-[14px] items-center justify-between py-2 relative overflow-hidden ${
              isSelected
                ? 'bg-theme-accent-strong border border-transparent'
                : isToday
                ? 'bg-theme-inset border-[1.5px] border-theme-accent'
                : 'bg-theme-inset border border-transparent'
            }`}
          >
            {/* Top-Right Status Badge (Green check if completed workout or honored rest day, warning dot if missed) */}
            {(isCompleted || isRestHonored) && (
              <View className="absolute top-1 right-1 z-10">
                <Ionicons name="checkmark-circle" size={13} color="#10B981" />
              </View>
            )}
            {isMissed && (
              <View className="absolute top-1.5 right-1.5 z-10 w-1.5 h-1.5 rounded-full bg-semantic-warning" />
            )}

            {/* Top: Weekday Letter / Abbreviation in Caption */}
            <Text
              numberOfLines={1}
              className={`text-[11px] font-semibold uppercase tracking-wider font-jakarta ${
                isSelected ? 'text-white' : 'text-theme-muted'
              }`}
            >
              {getLocalizedDayAbbr(day.dayName, t)}
            </Text>

            {/* Middle: Date Number in stat-md Rajdhani */}
            <Text
              style={{ fontVariant: ['tabular-nums'] }}
              className={`text-lg font-bold font-rajdhani -my-1 ${
                isSelected ? 'text-white' : 'text-theme-text'
              }`}
            >
              {dayNumber}
            </Text>

            {/* Bottom: SportMedallion (28pt) or Moon Icon for Rest */}
            <View className="items-center justify-center h-7 relative">
              {hasActiveWorkouts ? (
                <View className="flex-row items-center justify-center">
                  <SportMedallion
                    sport={activeWorkouts[0].type}
                    size={28}
                    onAccent={isSelected}
                  />
                  {activeWorkouts.length > 1 && (
                    <View className={`absolute -top-1 -right-1.5 rounded-full px-1 py-0.2 ${isSelected ? 'bg-white' : 'bg-theme-accent-strong'}`}>
                      <Text className={`text-[9px] font-bold font-rajdhani ${isSelected ? 'text-theme-accent-strong' : 'text-white'}`}>
                        +{activeWorkouts.length - 1}
                      </Text>
                    </View>
                  )}
                </View>
              ) : (
                <Ionicons
                  name="moon"
                  size={16}
                  color={isSelected ? '#FFFFFF' : '#94A3B8'}
                />
              )}
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/**
 * The 7 days of the shown week; tap a day to open it. Weeks change with the
 * < > buttons above. There used to be a swipe between weeks here, but it took
 * over on touch-down and swallowed taps on the days.
 */
export function SideBySideWeekBar({ agenda, selectedDayIndex, onSelectDay }: SideBySideWeekBarProps) {
  return (
    <View className="w-full">
      <WeekStrip agenda={agenda} selectedDayIndex={selectedDayIndex} onSelectDay={onSelectDay} />
    </View>
  );
}

export default SideBySideWeekBar;
