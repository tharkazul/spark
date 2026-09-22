import React from 'react';
import { Text, ActivityIndicator } from 'react-native';
import { BrandColors } from '@/constants/theme';
import { ScalePressable, ScalePressableProps } from './ScalePressable';

export interface ButtonProps extends Omit<ScalePressableProps, 'children'> {
  label: string;
  variant?: 'primary' | 'secondary' | 'outline';
  isLoading?: boolean;
  className?: string;
  children?: React.ReactNode;
}

export function Button({ 
  label, 
  variant = 'primary', 
  isLoading = false, 
  disabled = false,
  className = '', 
  children,
  activeScale = 0.96,
  haptic = 'selection',
  ...props 
}: ButtonProps) {
  
  const getVariantClasses = () => {
    switch (variant) {
      case 'secondary':
        return 'bg-theme-accent-soft border-transparent';
      case 'outline':
        return 'bg-transparent border-theme-border border-2';
      case 'primary':
      default:
        return 'bg-theme-accent border-transparent';
    }
  };

  const getTextClasses = () => {
    switch (variant) {
      case 'secondary':
        return 'text-theme-accent font-semibold';
      case 'outline':
        return 'text-theme-text font-semibold';
      case 'primary':
      default:
        return 'text-white font-bold';
    }
  };

  const isDisabled = Boolean(isLoading || disabled);

  return (
    <ScalePressable 
      className={`py-3.5 px-6 rounded-control flex-row items-center justify-center border ${getVariantClasses()} ${isDisabled ? 'opacity-50' : ''} ${className}`}
      disabled={isDisabled}
      activeScale={activeScale}
      haptic={haptic}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: isLoading }}
      {...props}
    >
      {isLoading ? (
        <ActivityIndicator color={variant === 'primary' ? 'white' : BrandColors.primary} />
      ) : (
        <>
          <Text className={`text-base text-center ${getTextClasses()}`}>{label}</Text>
          {children}
        </>
      )}
    </ScalePressable>
  );
}

export default Button;
