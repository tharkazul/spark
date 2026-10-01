import React from 'react';
import { View, Text, useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScalePressable } from './ScalePressable';
import { sportColor } from '../../constants/theme';

export type ChipVariant = 'neutral' | 'accent' | 'sport' | 'status' | 'points' | 'tier';
export type ChipSize = 'sm' | 'md';
export type ChipStatus = 'success' | 'warning' | 'error';
export type ChipTier = 'common' | 'rare' | 'epic' | 'legendary';

export interface ChipProps {
  label?: string | number;
  variant?: ChipVariant;
  size?: ChipSize;
  sport?: string;
  status?: ChipStatus;
  tier?: ChipTier;
  icon?: React.ReactNode;
  onPress?: () => void;
  className?: string;
  children?: React.ReactNode;
}

/**
 * Chip component adhering to Rooka UI/UX Spec:
 * - Height: 26pt (sm) or 32pt (md), radius 999 (rounded-pill), horizontal padding 10
 * - Variants: neutral, accent, sport, status (success, warning, error), points (bolt icon + stat-sm Rajdhani)
 */
export function Chip({
  label,
  variant = 'neutral',
  size = 'md',
  sport,
  status = 'success',
  tier = 'common',
  icon,
  onPress,
  className = '',
  children,
}: ChipProps) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const isSm = size === 'sm';
  const heightClass = isSm ? 'h-[26px]' : 'h-[32px]';
  const textClass = isSm ? 'text-[11px]' : 'text-xs';

  if (variant === 'points') {
    return (
      <View
        className={`${heightClass} px-2.5 rounded-pill bg-theme-accent-soft flex-row items-center justify-center gap-1 ${className}`}
      >
        <Ionicons name="flash" size={isSm ? 12 : 14} color="#0EA5E9" />
        <Text
          numberOfLines={1}
          style={{ fontVariant: ['tabular-nums'] }}
          className="font-rajdhani font-bold text-theme-accent-text text-sm"
        >
          {label !== undefined ? (typeof label === 'number' && label > 0 ? `+${label}` : label) : ''}
        </Text>
        {children}
      </View>
    );
  }

  const chipHitSlop = { top: 8, bottom: 8, left: 6, right: 6 };

  if (variant === 'sport' && sport) {
    const sColor = sportColor(sport, scheme);
    const bgColor = `${sColor}24`; // ~14% opacity

    const content = (
      <View
        style={{ backgroundColor: bgColor }}
        className={`${heightClass} px-2.5 rounded-pill flex-row items-center justify-center gap-1.5 ${className}`}
      >
        {icon}
        {label !== undefined && (
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
            style={{ color: sColor }}
            className={`font-bold ${textClass}`}
          >
            {label}
          </Text>
        )}
        {children}
      </View>
    );

    if (onPress) {
      return (
        <ScalePressable
          onPress={onPress}
          activeScale={0.96}
          haptic="selection"
          hitSlop={chipHitSlop}
          accessibilityRole="button"
          accessibilityLabel={typeof label === 'string' ? label : undefined}
        >
          {content}
        </ScalePressable>
      );
    }
    return content;
  }

  if (variant === 'status') {
    let statusBg = 'bg-semantic-success-bg';
    let statusText = 'text-semantic-success-text';
    if (status === 'warning') {
      statusBg = 'bg-amber-500/15';
      statusText = 'text-[#B45309] dark:text-[#FCD34D]';
    } else if (status === 'error') {
      statusBg = 'bg-semantic-error-bg';
      statusText = 'text-semantic-error-text';
    }

    const content = (
      <View
        className={`${heightClass} px-2.5 rounded-pill ${statusBg} flex-row items-center justify-center gap-1.5 ${className}`}
      >
        {icon}
        {label !== undefined && (
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
            className={`font-bold ${textClass} ${statusText}`}
          >
            {label}
          </Text>
        )}
        {children}
      </View>
    );

    if (onPress) {
      return (
        <ScalePressable
          onPress={onPress}
          activeScale={0.96}
          haptic="selection"
          hitSlop={chipHitSlop}
          accessibilityRole="button"
          accessibilityLabel={typeof label === 'string' ? label : undefined}
        >
          {content}
        </ScalePressable>
      );
    }
    return content;
  }

  if (variant === 'tier') {
    let tierBg = 'bg-slate-500/15';
    let tierText = 'text-tier-common-text';
    if (tier === 'rare') {
      tierBg = 'bg-blue-500/15';
      tierText = 'text-tier-rare-text';
    } else if (tier === 'epic') {
      tierBg = 'bg-purple-500/15';
      tierText = 'text-tier-epic-text';
    } else if (tier === 'legendary') {
      tierBg = 'bg-amber-500/15';
      tierText = 'text-tier-legendary-text';
    }

    const content = (
      <View
        className={`${heightClass} px-2.5 rounded-pill ${tierBg} flex-row items-center justify-center gap-1.5 ${className}`}
      >
        {icon}
        {label !== undefined && (
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
            className={`font-bold ${textClass} ${tierText}`}
          >
            {label}
          </Text>
        )}
        {children}
      </View>
    );

    if (onPress) {
      return (
        <ScalePressable
          onPress={onPress}
          activeScale={0.96}
          haptic="selection"
          hitSlop={chipHitSlop}
          accessibilityRole="button"
          accessibilityLabel={typeof label === 'string' ? label : undefined}
        >
          {content}
        </ScalePressable>
      );
    }
    return content;
  }

  const getVariantStyles = () => {
    switch (variant) {
      case 'accent':
        return {
          bg: 'bg-theme-accent-soft',
          text: 'text-theme-accent-text font-bold',
        };
      case 'neutral':
      default:
        return {
          bg: 'bg-theme-inset',
          text: 'text-theme-muted font-semibold',
        };
    }
  };

  const vStyles = getVariantStyles();

  const content = (
    <View
      className={`${heightClass} px-2.5 rounded-pill ${vStyles.bg} flex-row items-center justify-center gap-1.5 ${className}`}
    >
      {icon}
      {label !== undefined && (
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
          className={`${textClass} ${vStyles.text}`}
        >
          {label}
        </Text>
      )}
      {children}
    </View>
  );

  if (onPress) {
    return (
      <ScalePressable
        onPress={onPress}
        activeScale={0.96}
        haptic="selection"
        hitSlop={chipHitSlop}
        accessibilityRole="button"
        accessibilityLabel={typeof label === 'string' ? label : undefined}
      >
        {content}
      </ScalePressable>
    );
  }
  return content;
}

export default Chip;
