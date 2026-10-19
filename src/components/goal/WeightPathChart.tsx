import React, { useState } from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Polygon, Polyline, Stop } from 'react-native-svg';

import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '@/hooks/use-theme';
import { TrendPoint } from '../../types/season';

interface WeightPathChartProps {
  points: TrendPoint[];
  targetKg: number;
  goalDate: string;
  color: string;
}

const day = (d: string) => new Date(String(d).slice(0, 10) + 'T12:00:00').getTime();

/**
 * Logged weigh-ins (solid) and the path still needed: a dashed line from the
 * latest weigh-in to the target weight on the goal date. Time runs left to right.
 */
export function WeightPathChart({ points, targetKg, goalDate, color }: WeightPathChartProps) {
  const { t } = useLanguage();
  const theme = useTheme();
  const [w, setW] = useState(0);
  const h = 64;
  const pad = 6;

  const last = points[points.length - 1];
  const start = day(points[0].date);
  const end = Math.max(day(goalDate), day(last.date) + 86400000);
  const values = [...points.map((p) => p.value), targetKg];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(0.5, max - min);

  const x = (d: string) => pad + ((day(d) - start) / (end - start)) * (w - pad * 2);
  const y = (v: number) => pad + ((max - v) / span) * (h - pad * 2);
  const dateLabel = (d: string) => new Date(day(d)).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

  const lineStr = points.map((p) => `${x(p.date)},${y(p.value)}`).join(' ');
  const areaStr = `${x(points[0].date)},${h} ${lineStr} ${x(last.date)},${h}`;

  return (
    <View className="mt-3">
      <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height: h }}>
        {w > 0 && (
          <Svg width={w} height={h}>
            <Defs>
              <LinearGradient id="weightPathGrad" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={color} stopOpacity={0.18} />
                <Stop offset="1" stopColor={color} stopOpacity={0.0} />
              </LinearGradient>
            </Defs>
            <Line x1={x(last.date)} y1={y(last.value)} x2={x(goalDate)} y2={y(targetKg)} stroke={theme.textSecondary} strokeWidth={1.5} strokeDasharray="3 3" strokeOpacity={0.6} />
            {points.length > 1 && <Polygon points={areaStr} fill="url(#weightPathGrad)" />}
            <Polyline points={lineStr} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            <Circle cx={x(last.date)} cy={y(last.value)} r={3} fill={color} />
            <Circle cx={x(goalDate)} cy={y(targetKg)} r={2.5} fill={theme.textSecondary} />
          </Svg>
        )}
      </View>
      <View className="flex-row justify-between mt-0.5">
        <Text className="text-[10px] text-theme-muted">
          {dateLabel(points[0].date)}: {points[0].value} kg
        </Text>
        <Text className="text-[10px] text-theme-muted">
          {t('goal.weightPathEnd', { date: dateLabel(goalDate), target: targetKg })}
        </Text>
      </View>
    </View>
  );
}
