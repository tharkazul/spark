import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Text, View } from 'react-native';

import { Card } from '../ui/Card';
import { Sparkline } from '../common/Sparkline';
import { useLanguage } from '../../context/LanguageContext';
import { BodyStatus, GoalStatusKind } from '../../types/season';

const STATUS_COLOR: Record<GoalStatusKind, string> = {
  on_track: '#22C55E',
  within_reach: '#0EA5E9',
  ambitious: '#F59E0B',
  building: '#8B5CF6',
};

const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(2)}`;

/** Body-weight goal: where you are, the trend so far and the trend needed. */
export function BodyGoalCard({ status }: { status: BodyStatus }) {
  const { t } = useLanguage();
  const color = STATUS_COLOR[status.status];
  const headline =
    status.currentKg === null
      ? t('goal.bodyNoData')
      : t(`goal.weight_${status.status}`, { target: status.targetKg });

  return (
    <Card>
      <Text className="text-xs font-bold uppercase tracking-wider text-theme-muted mb-2">{status.goalName}</Text>
      <View className="flex-row items-center gap-2">
        <Ionicons name="scale-outline" size={20} color={color} />
        <Text className="text-lg font-extrabold text-theme-text flex-1">{headline}</Text>
      </View>
      {status.currentKg !== null && (
        <View className="flex-row items-end justify-between mt-2">
          <Text className="text-2xl font-extrabold text-theme-text font-rajdhani">
            {status.currentKg} <Text className="text-theme-muted">→ {status.targetKg} kg</Text>
          </Text>
          {status.trend.length >= 2 && (
            <Sparkline data={status.trend.map((p) => p.value)} color={color} gradientFrom={`${color}33`} gradientTo={`${color}00`} height={36} width={120} />
          )}
        </View>
      )}
      {status.ratePerWeek !== null && status.ratePerWeek !== undefined && status.neededPerWeek !== null && status.neededPerWeek !== undefined && (
        <Text className="text-xs text-theme-muted mt-2">
          {t('goal.bodyRates', { rate: signed(status.ratePerWeek), needed: signed(status.neededPerWeek) })}
        </Text>
      )}
      {status.status === 'ambitious' && <Text className="text-xs text-theme-muted mt-1">{t('goal.bodyAmbitiousNote')}</Text>}
    </Card>
  );
}
