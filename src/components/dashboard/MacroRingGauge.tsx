import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';

interface MacroRingGaugeProps {
  label: 'Protein' | 'Carbs' | 'Fat';
  target: number;
  logged: number;
}

const CONFIG = {
  Protein: {
    trackColor: '#D0E1FD',
    progressColor: '#38BDF8',
    textColor: '#38BDF8',
    bgSoft: '#F0F6FE',
  },
  Carbs: {
    trackColor: '#D4ECCE',
    progressColor: '#10B981',
    textColor: '#10B981',
    bgSoft: '#F2FBF0',
  },
  Fat: {
    trackColor: '#FCD3D3',
    progressColor: '#EF4444',
    textColor: '#EF4444',
    bgSoft: '#FEF2F2',
  },
};

export function MacroRingGauge({ label, target, logged }: MacroRingGaugeProps) {
  const cfg = CONFIG[label];
  const size = 96;
  const strokeWidth = 11;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const hasData = logged > 0;
  const rawPct = target > 0 ? (logged / target) * 100 : 0;
  const actualPct = Math.round(rawPct);
  const clampedPct = Math.min(100, Math.max(0, actualPct));
  const strokeDashoffset = circumference - (circumference * clampedPct) / 100;

  // Calculate coordinates for percentage badge bubble along the circle arc
  const angleDeg = -90 + (clampedPct / 100) * 360;
  const angleRad = (angleDeg * Math.PI) / 180;
  const badgeX = size / 2 + radius * Math.cos(angleRad);
  const badgeY = size / 2 + radius * Math.sin(angleRad);

  // Badge background & text styles for high percentage intake
  let badgeBg = 'bg-white border-gray-300';
  let badgeText = 'text-gray-800';
  if (actualPct >= 120) {
    badgeBg = 'bg-red-100 border-red-400';
    badgeText = 'text-red-900';
  } else if (actualPct > 100) {
    badgeBg = 'bg-amber-100 border-amber-400';
    badgeText = 'text-amber-900';
  }

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
        <View className="absolute inset-0 items-center justify-center p-2">
          <Text className="text-xs font-extrabold text-theme-text text-center">
            {label}
          </Text>
          <Text className="text-[10px] font-mono text-theme-muted font-bold mt-0.5">
            {hasData ? `${logged}g / ${target}g` : `${target}g`}
          </Text>
        </View>

        {/* Floating Percentage Badge */}
        {hasData && (
          <View
            style={{
              position: 'absolute',
              left: badgeX - 14,
              top: badgeY - 14,
              width: 28,
              height: 28,
            }}
            className={`rounded-full border items-center justify-center shadow-md z-20 ${badgeBg}`}
          >
            <Text className={`text-[9px] font-extrabold ${badgeText}`}>
              {actualPct}%
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}
