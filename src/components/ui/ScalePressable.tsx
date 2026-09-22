import React, { forwardRef, useCallback } from 'react';
import {
  Pressable,
  PressableProps,
  GestureResponderEvent,
  Platform,
  StyleProp,
  ViewStyle,
  View,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  WithSpringConfig,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

export type HapticType =
  | 'selection'
  | 'light'
  | 'medium'
  | 'heavy'
  | 'success'
  | 'warning'
  | 'error'
  | 'none'
  | false
  | null;

export interface ScalePressableProps extends Omit<PressableProps, 'style'> {
  /** Target scale when pressed down. Default is 0.96 for buttons, recommended 0.98 for large cards. */
  activeScale?: number;
  /** Reanimated spring physics configuration. Defaults to { damping: 15, stiffness: 250 }. */
  springConfig?: WithSpringConfig;
  /** Haptic feedback style triggered on release. Defaults to 'selection'. Set to false or 'none' to disable. */
  haptic?: HapticType;
  /** Style object, array, or style callback. */
  style?: StyleProp<ViewStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle>);
  /** NativeWind class names */
  className?: string;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export const DEFAULT_SPRING_CONFIG: WithSpringConfig = {
  damping: 15,
  stiffness: 250,
};

/**
 * ScalePressable
 *
 * Tactile, physics-based pressable with spring compression and subtle haptic feedback.
 * Replaces flat `TouchableOpacity` across buttons, cards, and interactive chips.
 */
export const ScalePressable = forwardRef<View, ScalePressableProps>(function ScalePressable(
  {
    activeScale = 0.96,
    springConfig = DEFAULT_SPRING_CONFIG,
    haptic = 'selection',
    disabled,
    onPress,
    onPressIn,
    onPressOut,
    style,
    className,
    children,
    ...rest
  },
  ref
) {
  const scale = useSharedValue(1);

  const triggerHaptic = useCallback(async (type: HapticType) => {
    if (!type || type === 'none' || Platform.OS === 'web') return;
    try {
      switch (type) {
        case 'selection':
          await Haptics.selectionAsync();
          break;
        case 'light':
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          break;
        case 'medium':
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          break;
        case 'heavy':
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
          break;
        case 'success':
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          break;
        case 'warning':
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          break;
        case 'error':
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          break;
      }
    } catch {
      // Silently ignore haptic failures on unsupported platforms
    }
  }, []);

  const handlePressIn = useCallback(
    (event: GestureResponderEvent) => {
      if (!disabled) {
        scale.value = withSpring(activeScale, springConfig);
      }
      onPressIn?.(event);
    },
    [disabled, activeScale, springConfig, onPressIn, scale]
  );

  const handlePressOut = useCallback(
    (event: GestureResponderEvent) => {
      if (!disabled) {
        scale.value = withSpring(1, springConfig);
      }
      onPressOut?.(event);
    },
    [disabled, springConfig, onPressOut, scale]
  );

  const handlePress = useCallback(
    (event: GestureResponderEvent) => {
      if (disabled) return;
      if (haptic) {
        triggerHaptic(haptic);
      }
      onPress?.(event);
    },
    [disabled, haptic, triggerHaptic, onPress]
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      ref={ref}
      disabled={disabled}
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={
        typeof style === 'function'
          ? (state) => [animatedStyle, style(state)]
          : [animatedStyle, style]
      }
      className={className}
      {...rest}
    >
      {children}
    </AnimatedPressable>
  );
});

export default ScalePressable;
