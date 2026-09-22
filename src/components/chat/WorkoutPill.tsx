import React from 'react';
import { View, Text, useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/use-theme';
import { getDisciplineConfig } from '../../utils/disciplineConfig';
import { RookaPoints } from '../ui/RookaPoints';
import { ProposedWorkoutItem } from '../../types/chat';
import { ScalePressable } from '../ui/ScalePressable';

interface WorkoutPillProps {
  workout: ProposedWorkoutItem;
  onPress?: (workout: ProposedWorkoutItem) => void;
}

const formatWorkoutDate = (dateStr?: string): string => {
  if (!dateStr) return '';
  try {
    const [y, m, d] = dateStr.split('-').map((v) => parseInt(v, 10));
    if (!y || !m || !d) return dateStr;
    const target = new Date(y, m - 1, d);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diffDays = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays === -1) return 'Yesterday';

    return target.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  } catch (_) {
    return dateStr;
  }
};

export const WorkoutPill: React.FC<WorkoutPillProps> = ({ workout, onPress }) => {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const theme = useTheme();
  const cfg = getDisciplineConfig(workout?.sport, scheme);
  const dateLabel = formatWorkoutDate(workout?.date);
  const isRest = (workout?.sport || '').toLowerCase() === 'rest';

  return (
    <ScalePressable
      activeScale={0.97}
      haptic="light"
      onPress={() => onPress?.(workout)}
      className="mt-2.5 px-3 py-2.5 rounded-2xl bg-theme-bg/80 border border-theme-border/80 flex-row items-center justify-between shadow-2xs"
    >
      {/* Left icon + details */}
      <View className="flex-row items-center flex-1 mr-2.5">
        <View
          style={{ backgroundColor: cfg.tint }}
          className="w-8 h-8 rounded-xl items-center justify-center mr-2.5"
        >
          <Ionicons name={cfg.icon as any} size={17} color={cfg.color} />
        </View>

        <View className="flex-1">
          <View className="flex-row items-center gap-1.5 mb-0.5">
            <Text
              style={{ color: cfg.color }}
              className="text-[11px] font-extrabold uppercase tracking-wide font-rajdhani"
            >
              {cfg.label}
            </Text>
            {dateLabel ? (
              <>
                <Text className="text-[10px] text-theme-muted font-bold">•</Text>
                <Text className="text-[11px] text-theme-muted font-semibold">
                  {dateLabel}
                </Text>
              </>
            ) : null}
          </View>

          <Text
            numberOfLines={1}
            className="text-xs font-bold text-theme-text leading-tight"
          >
            {workout.description || (isRest ? 'Rest & Recovery' : `${workout.sport} Workout`)}
          </Text>
        </View>
      </View>

      {/* Right side: rooka points + chevron */}
      <View className="flex-row items-center gap-1.5">
        {workout.target_rooka && workout.target_rooka > 0 ? (
          <RookaPoints value={Math.round(workout.target_rooka)} variant="badge" />
        ) : null}
        <Ionicons name="chevron-forward" size={15} color={theme.textSecondary} />
      </View>
    </ScalePressable>
  );
};
