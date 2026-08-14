import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';

interface MacroRingGaugeProps {
  label: 'Protein' | 'Carbs' | 'Fat';
  target: number;
  logged: number;
  size?: number;
}

const CONFIG = {
  Protein: {
    trackColor: 'rgba(56, 189, 248, 0.20)',
    progressColor: '#0284C7',
    textColor: '#0284C7',
    bgSoft: '#F0F6FE',
  },
  Carbs: {
    trackColor: 'rgba(16, 185, 129, 0.20)',
    progressColor: '#10B981',
    textColor: '#059669',
    bgSoft: '#F2FBF0',
  },
  Fat: {
    trackColor: 'rgba(239, 68, 68, 0.20)',
    progressColor: '#EF4444',
    textColor: '#DC2626',
    bgSoft: '#FEF2F2',
  },
};

export function MacroRingGauge({ label, target, logged, size = 96 }: MacroRingGaugeProps) {
  const cfg = CONFIG[label];
  const strokeWidth = Math.max(6, Math.floor(size * 0.11));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const hasData = logged > 0;
  const rawPct = target > 0 ? (logged / target) * 100 : 0;
  const actualPct = Math.round(rawPct);
  const clampedPct = Math.min(100, Math.max(0, actualPct));
  const strokeDashoffset = circumference - (circumference * clampedPct) / 100;

  // Percentage color styling for high/overflow intake
  let pctColor = cfg.textColor;
  if (actualPct >= 120) {
    pctColor = '#DC2626'; // red-600
  } else if (actualPct > 100) {
    pctColor = '#D97706'; // amber-600
  }

  const isSmall = size < 80;

  return (
    <View className="items-center justify-center relative">
      <View style={{ width: size, height: size }} className="items-center justify-center relative">
        <Svg width={size} height={size}>
          <G rotation="-90" origin={`${size / 2}, ${size / 2}`}>
            {/* Background Track Ring */}
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={cfg.trackColor}
              strokeWidth={strokeWidth}
              fill="transparent"
            />

            {/* Active Filled Progress Arc */}
            {hasData && (
              <Circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                stroke={cfg.progressColor}
                strokeWidth={strokeWidth}
                strokeDasharray={`${circumference} ${circumference}`}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                fill="transparent"
              />
            )}
          </G>
        </Svg>

        {/* Center Content */}
        <View className="absolute inset-0 items-center justify-center p-1">
          <Text className={`${isSmall ? 'text-[11px]' : 'text-xs'} font-medium text-theme-text text-center`}>
            {label}
          </Text>

          {hasData ? (
            <>
              <Text
                style={{ color: pctColor }}
                className={`${isSmall ? 'text-xs my-0.5' : 'text-sm my-0.5'} font-medium text-center`}
                numberOfLines={1}
              >
                {actualPct}%
              </Text>
              <Text className={`${isSmall ? 'text-[9px]' : 'text-[10px]'} font-normal text-theme-muted text-center`}>
                {logged}g / {target}g
              </Text>
            </>
          ) : (
            <Text className={`${isSmall ? 'text-[9px] mt-0.5' : 'text-[10px] mt-0.5'} font-normal text-theme-muted text-center`}>
              {target}g
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}
