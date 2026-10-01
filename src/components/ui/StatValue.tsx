import React from 'react';
import { View, Text, StyleProp, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export type StatSize = 'sm' | 'md' | 'lg' | 'xl';

export interface StatValueProps {
  label?: string;
  labelPosition?: 'top' | 'bottom';
  value: string | number;
  unit?: string;
  size?: StatSize;
  trend?: 'up' | 'down' | 'neutral';
  delta?: string | number;
  align?: 'left' | 'center' | 'right';
  className?: string;
  style?: StyleProp<ViewStyle>;
}

const VALUE_SIZE_CLASSES: Record<StatSize, string> = {
  sm: 'text-base',
  md: 'text-xl',
  lg: 'text-2xl',
  xl: 'text-4xl',
};

const UNIT_SIZE_CLASSES: Record<StatSize, string> = {
  sm: 'text-xs',
  md: 'text-xs',
  lg: 'text-sm',
  xl: 'text-base',
};

/**
 * Universal StatValue Component (Ticket R2-16):
 * - Displays high-contrast stat value in Rajdhani-Bold with tabular-nums.
 * - Unit baseline aligned with non-breaking space (never wraps alone).
 * - Optional uppercase caption label with letter spacing (top or bottom).
 * - Optional trend arrow and delta indicator.
 */
export function StatValue({
  label,
  labelPosition = 'top',
  value,
  unit,
  size = 'md',
  trend,
  delta,
  align = 'left',
  className = '',
  style,
}: StatValueProps) {
  const alignClass =
    align === 'center'
      ? 'items-center text-center'
      : align === 'right'
      ? 'items-end text-right'
      : 'items-start text-left';

  return (
    <View style={style} className={`${alignClass} ${className}`}>
      {/* Optional Top Label Caption */}
      {label && labelPosition !== 'bottom' && (
        <Text
          numberOfLines={1}
          className="text-[10px] font-semibold text-theme-muted uppercase tracking-wider mb-0.5"
        >
          {label}
        </Text>
      )}

      {/* Value + Unit Row */}
      <View className="flex-row items-baseline">
        <Text
          numberOfLines={1}
          style={{ fontVariant: ['tabular-nums'] }}
          className={`font-bold font-rajdhani text-theme-text ${VALUE_SIZE_CLASSES[size]}`}
        >
          {value}
        </Text>
        {unit && (
          <Text
            numberOfLines={1}
            className={`font-medium text-theme-muted ml-1 ${UNIT_SIZE_CLASSES[size]}`}
          >
            {unit}
          </Text>
        )}
      </View>

      {/* Optional Bottom Label Caption */}
      {label && labelPosition === 'bottom' && (
        <Text
          numberOfLines={1}
          className="text-[10px] font-semibold text-theme-muted uppercase tracking-wider mt-0.5"
        >
          {label}
        </Text>
      )}

      {/* Optional Trend Row */}
      {trend && delta !== undefined && (
        <View className="flex-row items-center gap-0.5 mt-0.5">
          <Ionicons
            name={trend === 'up' ? 'arrow-up' : trend === 'down' ? 'arrow-down' : 'remove'}
            size={11}
            color={trend === 'up' ? '#10B981' : trend === 'down' ? '#EF4444' : '#94A3B8'}
          />
          <Text
            style={{ fontVariant: ['tabular-nums'] }}
            className={`text-[11px] font-bold ${
              trend === 'up' ? 'text-emerald-500' : trend === 'down' ? 'text-rose-500' : 'text-theme-muted'
            }`}
          >
            {delta}
          </Text>
        </View>
      )}
    </View>
  );
}

export default StatValue;
