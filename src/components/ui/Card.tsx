import React from 'react';
import { View, ViewProps } from 'react-native';
import { ScalePressable, ScalePressableProps } from './ScalePressable';

export interface CardProps extends ViewProps {
  className?: string;
  onPress?: ScalePressableProps['onPress'];
  activeScale?: number;
  haptic?: ScalePressableProps['haptic'];
  disabled?: boolean;
}

/**
 * Card component.
 *
 * If `onPress` is provided, automatically renders as an interactive `ScalePressable`
 * with subtle spring scaling (default 0.98) and haptic feedback.
 * Otherwise renders as a lightweight static surface `View`.
 */
export function Card({ 
  className = '', 
  children, 
  onPress,
  activeScale = 0.98,
  haptic = 'selection',
  disabled = false,
  ...props 
}: CardProps) {
  const cardClasses = `bg-theme-card border border-theme-border rounded-card p-6 ${className}`;

  if (onPress) {
    return (
      <ScalePressable
        className={cardClasses}
        onPress={onPress}
        activeScale={activeScale}
        haptic={haptic}
        disabled={disabled}
        accessibilityRole="button"
        {...(props as any)}
      >
        {children}
      </ScalePressable>
    );
  }

  return (
    <View 
      className={cardClasses}
      {...props}
    >
      {children}
    </View>
  );
}

export default Card;
