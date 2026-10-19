import React from 'react';
import { useTheme } from '@/hooks/use-theme';
import { View, Text } from 'react-native';
import { SubscriptionTier } from '../../types/user';
import { SparklinePoint } from '../common/Sparkline';
import { Card } from '../ui/Card';
import { MetricTile, MetricDeltaTone } from '../ui/MetricTile';
import { useLanguage } from '../../context/LanguageContext';
import { PMCMetricsSkeleton } from '../skeletons/PMCMetricsSkeleton';

interface PMCMetricsProps {
  ctl?: number;
  atl?: number;
  tsb?: number;
  readinessScore?: number;
  weightKg?: number;
  ctlDelta?: number;
  atlDelta?: number;
  ctlHistory?: number[];
  atlHistory?: number[];
  tsbHistory?: number[];
  weightHistory?: number[];
  weightPoints?: SparklinePoint[];
  tier?: SubscriptionTier;
  loading?: boolean;
}

export const PMCMetricsCard: React.FC<PMCMetricsProps> = ({
  ctl = 0,
  atl = 0,
  tsb = 0,
  weightKg = 0,
  ctlDelta = 0,
  atlDelta = 0,
  ctlHistory = [],
  atlHistory = [],
  tsbHistory = [],
  weightHistory = [],
  weightPoints = [],
  loading = false,
}) => {
  const theme = useTheme();
  const { t } = useLanguage();

  if (loading) {
    return <PMCMetricsSkeleton />;
  }

  const hasAnyValue = (series: number[]) => series.some((n) => Number(n) > 0);
  const hasTrainingData = ctl > 0 || atl > 0 || hasAnyValue(ctlHistory) || hasAnyValue(atlHistory);
  const hasWeightData = weightKg > 0 || hasAnyValue(weightHistory) || (weightPoints && weightPoints.length > 0);

  const getTsbState = (val: number): { label: string; color: string; tone: MetricDeltaTone } => {
    if (val > 25) return { label: t('dashboard.tsbFreshUndertrained', 'Fresh'), color: '#38BDF8', tone: 'accent' };
    if (val > 5) return { label: t('dashboard.tsbFresh', 'Fresh'), color: '#10B981', tone: 'good' };
    if (val >= -10) return { label: t('dashboard.tsbNeutral', 'Neutral'), color: '#0EA5E9', tone: 'accent' };
    if (val >= -30) return { label: t('dashboard.tsbOptimal', 'Optimal'), color: '#10B981', tone: 'good' };
    return { label: t('dashboard.tsbOverreaching', 'High load'), color: '#EF4444', tone: 'bad' };
  };
  const tsbState = getTsbState(tsb);

  const formatSigned = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(1)}`;

  return (
    <Card>
      {/* Header Row */}
      <View className="flex-row items-center justify-between mb-3">
        <Text className="text-xs font-bold text-theme-muted uppercase tracking-wider">
          {t('dashboard.fitnessAndFatigue')}
        </Text>
        {hasTrainingData && (
          <View className="flex-row items-center gap-1.5">
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: tsbState.color }} />
            <Text className="text-xs font-semibold text-theme-text">{tsbState.label}</Text>
          </View>
        )}
      </View>

      {/* Row 1: Fitness (CTL) & Fatigue (ATL) */}
      <View className="flex-row gap-2.5">
        <MetricTile
          label={t('dashboard.fitness')}
          value={ctl.toFixed(1)}
          delta={Math.abs(ctlDelta) >= 0.05 ? formatSigned(ctlDelta) : null}
          deltaTone={ctlDelta > 0 ? 'good' : 'neutral'}
          series={ctlHistory}
          color="#10B981"
        />
        <MetricTile
          label={t('dashboard.fatigue')}
          value={atl.toFixed(1)}
          delta={Math.abs(atlDelta) >= 0.05 ? formatSigned(atlDelta) : null}
          deltaTone={atlDelta > 0 ? 'warn' : 'neutral'}
          series={atlHistory}
          color="#F59E0B"
        />
      </View>

      {/* Row 2: Form (TSB) & Weight */}
      <View className="flex-row gap-2.5 mt-2.5">
        <MetricTile
          label={t('dashboard.form', 'Form')}
          value={hasTrainingData ? formatSigned(tsb) : '–'}
          delta={hasTrainingData ? tsbState.label : null}
          deltaTone={tsbState.tone}
          series={tsbHistory}
          baseline={0}
          color={tsbState.color}
        />
        <MetricTile
          label={t('physique.weightInput')}
          value={weightKg > 0 ? weightKg.toFixed(1) : '–'}
          unit={weightKg > 0 ? 'kg' : undefined}
          series={hasWeightData ? (weightPoints && weightPoints.length > 0 ? weightPoints : weightHistory) : []}
          color={theme.tint}
          minRangePadding={1.5}
          emptyHint={!hasWeightData ? t('dashboard.logWeightPrompt') : undefined}
        />
      </View>
    </Card>
  );
};

