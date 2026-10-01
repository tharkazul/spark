import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/use-theme';
import { ProposedWorkoutItem } from '../../types/chat';
import { SportMedallion } from '../ui/SportMedallion';
import { Chip } from '../ui/Chip';
import { formatRelativeDay } from '../../utils/format';
import { useLanguage } from '../../context/LanguageContext';

interface WorkoutPillProps {
  workout: ProposedWorkoutItem;
  onPress?: (workout: ProposedWorkoutItem) => void;
}

export const WorkoutPill: React.FC<WorkoutPillProps> = ({ workout, onPress }) => {
  const theme = useTheme();
  const { language } = useLanguage();

  const sportName = (workout?.sport || 'WORKOUT').toUpperCase();
  const relativeDate = workout?.date ? formatRelativeDay(workout.date, language).toUpperCase() : 'TODAY';
  const captionLine = `${sportName}, ${relativeDate}`;

  const isToday = relativeDate === 'TODAY' || relativeDate === 'VANDAAG' || relativeDate === 'HEUTE';
  const isCompleted = Boolean((workout as any)?.is_completed || (workout as any)?.completed);
  const isMissed = Boolean((workout as any)?.is_missed);

  const points = Math.round(workout?.target_rooka || (workout as any)?.rookaPoints || 0);

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={() => onPress?.(workout)}
      className={`min-h-[64px] p-3 rounded-inset bg-theme-inset flex-row items-center justify-between my-1.5 ${
        isToday ? 'border border-theme-accent' : 'border border-transparent'
      } ${isMissed ? 'opacity-60' : 'opacity-100'}`}
    >
      {/* Left: SportMedallion 40pt */}
      <View className="flex-row items-center flex-1 pr-2.5">
        <SportMedallion sport={workout?.sport} size={40} />

        <View className="flex-1 ml-3">
          {/* Line 1: Caption "SWIM, YESTERDAY" */}
          <Text className="text-[11px] font-semibold text-theme-muted uppercase tracking-wider">
            {captionLine}
          </Text>

          {/* Line 2: Workout title in body Bold, up to 2 lines */}
          <Text
            numberOfLines={2}
            className="text-sm font-bold text-theme-text mt-0.5 leading-snug"
          >
            {workout?.description || workout?.sport || 'Workout'}
          </Text>
        </View>
      </View>

      {/* Right: Points chip, then check or chevron */}
      <View className="flex-row items-center gap-x-2 pl-1">
        {points > 0 && (
          <Chip variant="points" size="sm" label={`+${points}`} />
        )}

        {isCompleted ? (
          <View className="w-6 h-6 rounded-full bg-emerald-500/15 items-center justify-center">
            <Ionicons name="checkmark" size={14} color="#10B981" />
          </View>
        ) : (
          <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
        )}
      </View>
    </TouchableOpacity>
  );
};
