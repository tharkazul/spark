import React from 'react';
import { Text, ActivityIndicator, View } from 'react-native';
import { ScalePressable, ScalePressableProps } from './ScalePressable';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive' | 'outline';
export type ButtonSize = 'lg' | 'md' | 'sm';

export interface ButtonProps extends Omit<ScalePressableProps, 'children'> {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  disabled?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}

/**
 * Button component per Rooka UI/UX Spec:
 * - primary: bg-theme-accent-strong, white bold label
 * - secondary: bg-theme-accent-soft, text-theme-accent-text
 * - ghost: no fill, text-theme-accent-text, 44pt minimum hit area
 * - destructive: bg-semantic-error-bg, text-semantic-error-text
 * - Sizes: lg (52pt, radius 16), md (44pt, radius 12), sm (34pt, pill)
 * - Spring scale 0.98 on press, disabled at 40% opacity
 */
export function Button({
  label,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  disabled = false,
  leftIcon,
  rightIcon,
  className = '',
  children,
  activeScale = 0.98,
  haptic = 'selection',
  style,
  ...props
}: ButtonProps) {
  const getVariantClasses = () => {
    switch (variant) {
      case 'secondary':
        return 'bg-theme-accent-soft border border-transparent';
      case 'ghost':
        return 'bg-transparent border border-transparent';
      case 'destructive':
        return 'bg-semantic-error-bg border border-transparent';
      case 'outline':
        return 'bg-transparent border border-theme-border';
      case 'primary':
      default:
        return 'bg-theme-accent-strong border border-transparent';
    }
  };

  const getTextClasses = () => {
    switch (variant) {
      case 'secondary':
      case 'ghost':
        return 'text-theme-accent-text font-bold';
      case 'destructive':
        return 'text-semantic-error-text font-bold';
      case 'outline':
        return 'text-theme-text font-semibold';
      case 'primary':
      default:
        return 'text-white font-bold';
    }
  };

  const getSizeClasses = () => {
    switch (size) {
      case 'lg':
        return 'h-[52px] px-6 rounded-button';
      case 'sm':
        return 'h-[34px] px-3.5 rounded-pill';
      case 'md':
      default:
        return 'h-[44px] px-4 rounded-button-md';
    }
  };

  const getTextSizeClasses = () => {
    switch (size) {
      case 'lg':
        return 'text-base';
      case 'sm':
        return 'text-xs';
      case 'md':
      default:
        return 'text-sm';
    }
  };

  const isDisabled = Boolean(isLoading || disabled);
  const defaultHitSlop = size === 'sm' ? { top: 6, bottom: 6, left: 6, right: 6 } : undefined;

  return (
    <ScalePressable
      className={`flex-row items-center justify-center ${getSizeClasses()} ${getVariantClasses()} ${
        isDisabled ? 'opacity-40' : ''
      } ${className}`.trim()}
      disabled={isDisabled}
      activeScale={activeScale}
      haptic={haptic}
      hitSlop={props.hitSlop ?? defaultHitSlop}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: isLoading }}
      style={style}
      {...props}
    >
      {isLoading ? (
        <ActivityIndicator color={variant === 'primary' ? '#FFFFFF' : '#0284C7'} />
      ) : (
        <View className="flex-row items-center justify-center gap-2">
          {leftIcon && <View className="items-center justify-center">{leftIcon}</View>}
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
            className={`text-center ${getTextSizeClasses()} ${getTextClasses()}`}
          >
            {label}
          </Text>
          {rightIcon && <View className="items-center justify-center">{rightIcon}</View>}
          {children}
        </View>
      )}
    </ScalePressable>
  );
}

export default Button;
