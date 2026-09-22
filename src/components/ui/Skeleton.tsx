import React, { useEffect, useRef } from 'react';
import { Animated, StyleProp, ViewStyle } from 'react-native';
import { useTheme } from '@/hooks/use-theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
  className?: string;
}

export function Skeleton({
  width,
  height,
  borderRadius = 8,
  style,
  className = '',
}: SkeletonProps) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const pulseAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 900,
          useNativeDriver: false,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: 900,
          useNativeDriver: false,
        }),
      ])
    );
    animation.start();

    return () => animation.stop();
  }, [pulseAnim]);

  const backgroundColor = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: isDark
      ? ['#1E293B', '#334155'] // dark: backgroundElement -> backgroundSelected
      : ['#F1F5F9', '#E2E8F0'], // light: backgroundElement -> backgroundSelected
  });

  return (
    <Animated.View
      className={className}
      style={[
        {
          width: width as any,
          height: height as any,
          borderRadius,
          backgroundColor,
        },
        style,
      ]}
    />
  );
}

Skeleton.Circle = function SkeletonCircle({
  size = 40,
  style,
  className = '',
}: {
  size?: number;
  style?: StyleProp<ViewStyle>;
  className?: string;
}) {
  return (
    <Skeleton
      width={size}
      height={size}
      borderRadius={size / 2}
      style={style}
      className={className}
    />
  );
};

Skeleton.Line = function SkeletonLine({
  width = '100%',
  height = 14,
  borderRadius = 6,
  style,
  className = '',
}: {
  width?: number | string;
  height?: number | string;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
  className?: string;
}) {
  return (
    <Skeleton
      width={width}
      height={height}
      borderRadius={borderRadius}
      style={style}
      className={className}
    />
  );
};

Skeleton.Rect = function SkeletonRect({
  width = '100%',
  height = 48,
  borderRadius = 12,
  style,
  className = '',
}: {
  width?: number | string;
  height?: number | string;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
  className?: string;
}) {
  return (
    <Skeleton
      width={width}
      height={height}
      borderRadius={borderRadius}
      style={style}
      className={className}
    />
  );
};
