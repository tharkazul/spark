import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

import { Card } from '../ui/Card';
import { WeightPathChart } from './WeightPathChart';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '@/hooks/use-theme';
import { BodyStatus, GoalStatusKind } from '../../types/season';

const STATUS_COLOR: Record<GoalStatusKind, string> = {
  on_track: '#22C55E',
  within_reach: '#0EA5E9',
  ambitious: '#F59E0B',
  building: '#8B5CF6',
};

const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(2)}`;

/** Body-weight goal: where you are, the trend so far and the trend needed. */
export function BodyGoalCard({
  status,
  onEdit,
}: {
  status: BodyStatus;
  onEdit?: () => void;
}) {
  const { t } = useLanguage();
  const theme = useTheme();
  const color = STATUS_COLOR[status.status];
  const headline =
    status.currentKg === null
      ? t('goal.bodyNoData')
      : t(`goal.weight_${status.status}`, { target: status.targetKg });

  return (
    <Card>
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-xs font-bold uppercase tracking-wider text-theme-muted">{status.goalName}</Text>
        {onEdit && (
          <TouchableOpacity
            onPress={onEdit}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            className="p-1.5 rounded-full bg-theme-inset border border-theme-border/50"
            activeOpacity={0.7}
            accessibilityLabel={t('goals.editGoals', 'Edit Goals')}
          >
            <Ionicons name="pencil" size={12} color={theme.textSecondary} />
          </TouchableOpacity>
        )}
      </View>
      <View className="flex-row items-center gap-2">
        <Ionicons name="scale-outline" size={18} color={color} />
        <Text className="text-base font-bold text-theme-text flex-1">{headline}</Text>
      </View>
      {status.currentKg !== null && (
        <View className="flex-row items-baseline gap-1.5 mt-2">
          <Text className="text-2xl font-bold text-theme-text font-rajdhani tabular-nums">
            {status.currentKg}
          </Text>
          <Text className="text-sm font-semibold text-theme-muted">
            → {status.targetKg} kg
          </Text>
        </View>
      )}
      {status.ratePerWeek !== null && status.ratePerWeek !== undefined && status.neededPerWeek !== null && status.neededPerWeek !== undefined && (
        <Text className="text-xs text-theme-muted mt-1">
          {t('goal.bodyRates', { rate: signed(status.ratePerWeek), needed: signed(status.neededPerWeek) })}
        </Text>
      )}
      {status.status === 'ambitious' && <Text className="text-xs text-theme-muted mt-1">{t('goal.bodyAmbitiousNote')}</Text>}
      {status.trend.length >= 2 && status.goalDate ? (
        <WeightPathChart points={status.trend} targetKg={status.targetKg} goalDate={status.goalDate} color={color} />
      ) : null}
    </Card>
  );
}
