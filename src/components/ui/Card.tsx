import React from 'react';
import { View, ViewProps } from 'react-native';
import { ScalePressable, ScalePressableProps } from './ScalePressable';

export type CardVariant = 'default' | 'inset' | 'accent' | 'warning';

export interface CardProps extends ViewProps {
  variant?: CardVariant;
  padding?: number;
  className?: string;
  onPress?: ScalePressableProps['onPress'];
  activeScale?: number;
  haptic?: ScalePressableProps['haptic'];
  disabled?: boolean;
}

/**
 * Card Component per Rooka UI/UX Spec:
 * - default: bg-theme-card, radius 20 (rounded-card), 1px border-theme-border, no shadow.
 * - inset: bg-theme-inset, radius 14 (rounded-inset), no border. Use inside cards instead of bordered boxes.
 * - accent: bg-theme-accent-soft, 1px border-theme-accent-border, rounded-card.
 * - warning: bg-semantic-warning-bg text-semantic-warning-text, rounded-card.
 *
 * Default padding is 16 (p-4).
 * If `onPress` is provided, renders with subtle spring scaling (0.98) and haptic feedback.
 */
export function Card({
  variant = 'default',
  padding,
  className = '',
  children,
  onPress,
  activeScale = 0.98,
  haptic = 'selection',
  disabled = false,
  style,
  ...props
}: CardProps) {
  const getVariantClasses = () => {
    switch (variant) {
      case 'inset':
        return 'bg-theme-inset rounded-inset border-0';
      case 'accent':
        return 'bg-theme-accent-soft border border-theme-accent-border rounded-card';
      case 'warning':
        return 'bg-semantic-warning-bg border border-transparent rounded-card';
      case 'default':
      default:
        return 'bg-theme-card border border-theme-border rounded-card';
    }
  };

  // If user passes explicit className with padding (e.g. p-0, p-5), allow it; otherwise default to p-4 (16pt)
  const hasPaddingClass = /\bp(-\w+)?-\d+\b/.test(className);
  const paddingClass = hasPaddingClass ? '' : 'p-4';

  const cardClasses = `${getVariantClasses()} ${paddingClass} ${className}`.trim();
  const customPaddingStyle = padding !== undefined ? { padding } : undefined;

  if (onPress) {
    return (
      <ScalePressable
        className={cardClasses}
        style={[customPaddingStyle, style]}
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
      style={[customPaddingStyle, style]}
      {...props}
    >
      {children}
    </View>
  );
}

export default Card;
