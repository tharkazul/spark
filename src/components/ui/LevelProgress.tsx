import React, { useEffect } from 'react';
import { View, Text } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  useReducedMotion,
  Easing,
} from 'react-native-reanimated';
import { useTheme } from '@/hooks/use-theme';
import { RookaMark } from './RookaPoints';
import { getRookaLevelInfo } from '../../utils/gamification';
import { formatNumber } from '../../utils/format';

export interface LevelProgressProps {
  totalRooka?: number;
  level?: number;
  levelTitle?: string;
  className?: string;
  showCard?: boolean;
}

/**
 * Standardized LevelProgress Component (Ticket R2-12 / R2-07):
 * - Formula:
 *     xpThisLevel = xp_total - level_start_xp
 *     xpNeeded = next_level_xp - level_start_xp
 *     progress = xpThisLevel / xpNeeded
 * - 10pt (h-2.5) animated progress bar with theme.tint fill.
 * - Math row: "{xpThisLevel} / {xpNeeded} XP"
 * - Subtitle: "{next_level_xp - xp_total} XP to Level {level + 1}"
 */
export function LevelProgress({
  totalRooka = 0,
  level: overrideLevel,
  levelTitle,
  className = '',
}: LevelProgressProps) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();

  const levelInfo = getRookaLevelInfo(totalRooka);
  const displayLevel = totalRooka > 0 ? levelInfo.level : (overrideLevel !== undefined ? overrideLevel : levelInfo.level);
  const targetPercent = Math.min(Math.max(levelInfo.progress * 100, 0), 100);

  const animatedWidth = useSharedValue(reducedMotion ? targetPercent : 0);

  useEffect(() => {
    if (reducedMotion) {
      animatedWidth.value = targetPercent;
    } else {
      animatedWidth.value = withTiming(targetPercent, {
        duration: 800,
        easing: Easing.out(Easing.cubic),
      });
    }
  }, [targetPercent, reducedMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    width: `${animatedWidth.value}%`,
  }));

  return (
    <View className={`w-full ${className}`}>
      {/* Header Row: Icon + Title + Level Number */}
      <View className="flex-row items-center justify-between mb-3">
        <View className="flex-row items-center gap-x-3">
          <View className="w-10 h-10 rounded-full bg-theme-accent-soft items-center justify-center border border-theme-accent/20">
            <RookaMark size={20} color={theme.tint} />
          </View>
          <View>
            <Text className="text-[11px] font-semibold text-theme-muted uppercase tracking-wider">
              {levelTitle || 'Athlete Level'}
            </Text>
            <Text className="text-base font-extrabold text-theme-text font-rajdhani">
              Level {displayLevel}
            </Text>
          </View>
        </View>

        <Text className="text-4xl font-rajdhani font-bold text-theme-accent tabular-nums">
          {displayLevel}
        </Text>
      </View>

      {/* 10pt (h-2.5) Progress Bar */}
      <View className="w-full h-2.5 bg-theme-inset rounded-full overflow-hidden my-1.5 border border-theme-border/40">
        <Animated.View
          style={[animatedStyle, { backgroundColor: theme.tint }]}
          className="h-full rounded-full"
        />
      </View>

      {/* Math & Caption Row */}
      <View className="flex-row justify-between items-center mt-1">
        <Text
          style={{ fontVariant: ['tabular-nums'] }}
          className="text-xs text-theme-muted font-medium font-rajdhani"
        >
          {formatNumber(levelInfo.xpThisLevel)} / {formatNumber(levelInfo.xpNeeded)} XP
        </Text>
        <Text
          style={{ fontVariant: ['tabular-nums'] }}
          className="text-xs font-bold text-theme-accent-text font-mono"
        >
          {formatNumber(levelInfo.xpRemaining)} XP to Level {displayLevel + 1}
        </Text>
      </View>
    </View>
  );
}
