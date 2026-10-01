import React, { useEffect } from 'react';
import { View, Text } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  Easing,
  useReducedMotion,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export interface MacroRingGaugeProps {
  label: 'Protein' | 'Carbs' | 'Fat';
  target: number;
  logged: number;
  size?: number;
  showCaptionBelow?: boolean;
}

const MACRO_COLORS = {
  Carbs: {
    color: '#F59E0B',
    track: 'rgba(245, 158, 11, 0.15)',
  },
  Protein: {
    color: '#8B5CF6',
    track: 'rgba(139, 92, 246, 0.15)',
  },
  Fat: {
    color: '#F43F5E',
    track: 'rgba(244, 63, 94, 0.15)',
  },
};

export function MacroRingGauge({
  label,
  target,
  logged,
  size = 92,
  showCaptionBelow = true,
}: MacroRingGaugeProps) {
  const cfg = MACRO_COLORS[label] || MACRO_COLORS.Carbs;
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const reducedMotion = useReducedMotion();

  const progress = useSharedValue(0);

  const rawFraction = target > 0 ? logged / target : 0;
  const clampedFraction = Math.min(1, Math.max(0, rawFraction));

  useEffect(() => {
    if (reducedMotion) {
      progress.value = clampedFraction;
    } else {
      progress.value = 0;
      progress.value = withTiming(clampedFraction, {
        duration: 700,
        easing: Easing.out(Easing.quad),
      });
    }
  }, [clampedFraction, reducedMotion, progress]);

  const animatedCircleProps = useAnimatedProps(() => {
    const strokeDashoffset = circumference * (1 - progress.value);
    return {
      strokeDashoffset,
    };
  });

  const remaining = Math.max(0, target - logged);
  const isTargetMet = logged >= target && target > 0;

  return (
    <View className="items-center">
      {/* SVG RING GAUGE */}
      <View style={{ width: size, height: size }} className="items-center justify-center relative">
        <Svg width={size} height={size}>
          <G rotation="-90" origin={`${size / 2}, ${size / 2}`}>
            {/* Background Track Ring (15% opacity) */}
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={cfg.track}
              strokeWidth={strokeWidth}
              fill="transparent"
            />

            {/* Saturated Progress Arc */}
            <AnimatedCircle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={cfg.color}
              strokeWidth={strokeWidth}
              strokeDasharray={`${circumference} ${circumference}`}
              animatedProps={animatedCircleProps}
              strokeLinecap="round"
              fill="transparent"
            />
          </G>
        </Svg>

        {/* Center: Eaten Grams in stat-lg Rajdhani */}
        <View className="absolute inset-0 items-center justify-center">
          <View className="flex-row items-baseline">
            <Text className="text-xl font-bold font-rajdhani text-theme-text tabular-nums">
              {Math.round(logged)}
            </Text>
            <Text className="text-xs font-normal text-theme-muted ml-0.5">g</Text>
          </View>
        </View>
      </View>

      {/* Caption Under Ring */}
      {showCaptionBelow && (
        <View className="items-center mt-2">
          {/* Label with 6pt colored dot for color-blind accessibility */}
          <View className="flex-row items-center gap-x-1.5 mb-0.5">
            <View style={{ backgroundColor: cfg.color }} className="w-1.5 h-1.5 rounded-full" />
            <Text className="text-[11px] font-bold text-theme-muted uppercase tracking-wider">
              {label}
            </Text>
          </View>

          <Text className="text-xs text-theme-muted font-medium tabular-nums">
            of {target} g
          </Text>

          <View className="mt-0.5">
            {isTargetMet ? (
              <View className="flex-row items-center gap-x-1">
                <Ionicons name="checkmark-circle" size={12} color="#10B981" />
                <Text className="text-xs font-bold text-emerald-500">Target met</Text>
              </View>
            ) : (
              <Text style={{ color: cfg.color }} className="text-xs font-bold tabular-nums">
                {remaining} g left
              </Text>
            )}
          </View>
        </View>
      )}
    </View>
  );
}
