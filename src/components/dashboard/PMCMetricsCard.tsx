import React from 'react';
import { useTheme } from '@/hooks/use-theme';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SubscriptionTier } from '../../types/user';
import { SparklinePoint } from '../common/Sparkline';
import { Card } from '../ui/Card';
import { MetricTile, MetricDeltaTone } from '../ui/MetricTile';
import { GarminAttribution } from '../ui/GarminAttribution';
import { useLanguage } from '../../context/LanguageContext';
import { PMCMetricsSkeleton } from '../skeletons/PMCMetricsSkeleton';
import { calculateFitnessTargetRange } from '../../utils/pmcUtils';

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
  /** "Garmin" when Garmin workouts feed these numbers (Garmin's brand rules), shown under the title. */
  garminLabel?: string | null;
  onPressInfo?: () => void;
  fitnessTargetRange?: { targetUpper: number; targetLower: number };
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
  garminLabel = null,
  onPressInfo,
  fitnessTargetRange,
}) => {
  const theme = useTheme();
  const { t } = useLanguage();

  if (loading) {
    return <PMCMetricsSkeleton />;
  }

  const hasAnyValue = (series: number[]) => series.some((n) => Number(n) > 0);
  const hasTrainingData = ctl > 0 || atl > 0 || hasAnyValue(ctlHistory) || hasAnyValue(atlHistory);
  const hasWeightData = weightKg > 0 || hasAnyValue(weightHistory) || (weightPoints && weightPoints.length > 0);

  const resolvedFitnessTargetRange =
    fitnessTargetRange ||
    calculateFitnessTargetRange(
      ctl,
      ctlHistory.map((v) => ({ ctl: v }))
    );

  // Fatigue dynamic range relative to fitness:
  // Upper: overload warning threshold (TSB < -20); Lower: recovered/fresh threshold
  const fatigueTargetUpper = Math.max(Math.round(ctl + 20), Math.round(ctl * 1.35), 25);
  const fatigueTargetLower = Math.max(5, Math.round(ctl * 0.7));

  // Weight dynamic stability band around recent average
  const validWeights = weightHistory.filter((w) => typeof w === 'number' && w > 0);
  const avgWeight =
    validWeights.length > 0
      ? validWeights.reduce((a, b) => a + b, 0) / validWeights.length
      : weightKg;

  const getTsbState = (val: number): { label: string; color: string; tone: MetricDeltaTone } => {
    if (val > 25) return { label: t('dashboard.tsbFreshUndertrained', 'Fresh'), color: '#38BDF8', tone: 'accent' };
    if (val > 5) return { label: t('dashboard.tsbFresh', 'Fresh'), color: '#10B981', tone: 'good' };
    if (val >= -10) return { label: t('dashboard.tsbNeutral', 'Neutral'), color: '#0EA5E9', tone: 'accent' };
    if (val >= -30) return { label: t('dashboard.tsbOptimal', 'Optimal'), color: '#10B981', tone: 'good' };
    return { label: t('dashboard.tsbOverreaching', 'High load'), color: '#EF4444', tone: 'bad' };
  };
  const tsbState = getTsbState(tsb);

  const getRelationshipSummary = (val: number): string => {
    if (val > 25) return t('dashboard.pmcRelUndertrained', 'Well rested — ready to build');
    if (val > 5) return t('dashboard.pmcRelFresh', 'Fresh legs & race ready');
    if (val >= -10) return t('dashboard.pmcRelNeutral', 'Balanced fitness & fatigue');
    if (val >= -30) return t('dashboard.pmcRelOptimal', 'Productive fitness building');
    return t('dashboard.pmcRelOverreaching', 'High load — prioritize rest');
  };

  const getRelationshipIcon = (val: number): keyof typeof Ionicons.glyphMap => {
    if (val > 25) return 'battery-charging-outline';
    if (val > 5) return 'trophy-outline';
    if (val >= -10) return 'swap-horizontal-outline';
    if (val >= -30) return 'trending-up-outline';
    return 'warning-outline';
  };

  const formatSigned = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(1)}`;

  return (
    <Card>
      {/* Header Row */}
      <View className="flex-row items-center justify-between mb-3">
        <View className="flex-1 mr-2">
          <View className="flex-row items-center gap-1.5">
            <Text className="text-xs font-bold text-theme-muted uppercase tracking-wider">
              {t('dashboard.fitnessAndFatigue')}
            </Text>
            {onPressInfo && (
              <TouchableOpacity
                onPress={onPressInfo}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel={t('dashboard.pmcFormula', 'How they relate')}
              >
                <Ionicons name="information-circle-outline" size={15} color={theme.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
          <GarminAttribution label={garminLabel} className="mt-0.5" />
        </View>
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
          targetUpper={hasTrainingData ? resolvedFitnessTargetRange.targetUpper : null}
          targetLower={hasTrainingData ? resolvedFitnessTargetRange.targetLower : null}
          targetUpperColor="#10B981"
          targetLowerColor="#F43F5E"
        />
        <MetricTile
          label={t('dashboard.fatigue')}
          value={atl.toFixed(1)}
          delta={Math.abs(atlDelta) >= 0.05 ? formatSigned(atlDelta) : null}
          deltaTone={atlDelta > 0 ? 'warn' : 'neutral'}
          series={atlHistory}
          color="#F59E0B"
          targetUpper={hasTrainingData ? fatigueTargetUpper : null}
          targetLower={hasTrainingData ? fatigueTargetLower : null}
          targetUpperColor="#F43F5E"
          targetLowerColor="#10B981"
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
          targetUpper={hasTrainingData ? 10 : null}
          targetLower={hasTrainingData ? -20 : null}
          targetUpperColor="#10B981"
          targetLowerColor="#F43F5E"
          color={tsbState.color}
        />
        <MetricTile
          label={t('physique.weightInput')}
          value={weightKg > 0 ? weightKg.toFixed(1) : '–'}
          unit={weightKg > 0 ? 'kg' : undefined}
          series={hasWeightData ? (weightPoints && weightPoints.length > 0 ? weightPoints : weightHistory) : []}
          color={theme.tint}
          targetUpper={hasWeightData && avgWeight > 0 ? Math.round((avgWeight + 1.0) * 10) / 10 : null}
          targetLower={hasWeightData && avgWeight > 0 ? Math.round((avgWeight - 1.0) * 10) / 10 : null}
          targetUpperColor={theme.tint}
          targetLowerColor={theme.tint}
          minRangePadding={1.5}
          emptyHint={!hasWeightData ? t('dashboard.logWeightPrompt') : undefined}
        />
      </View>

      {/* Compact Visual Relationship Strip */}
      {hasTrainingData && (
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={onPressInfo}
          className="mt-3 pt-2.5 border-t border-theme-border/30 flex-row items-center justify-between"
          accessibilityLabel={t('dashboard.pmcFormula', 'How they relate')}
        >
          <View className="flex-row items-center gap-1.5 flex-1 mr-2">
            <Ionicons name={getRelationshipIcon(tsb)} size={14} color={tsbState.color} />
            <Text className="text-xs font-bold text-theme-accent font-rajdhani tabular-nums">
              {ctl.toFixed(1)} − {atl.toFixed(1)} = {formatSigned(tsb)}
            </Text>
            <Text className="text-xs text-theme-muted">·</Text>
            <Text className="text-xs text-theme-text flex-1" numberOfLines={1}>
              {getRelationshipSummary(tsb)}
            </Text>
          </View>
          {onPressInfo && (
            <Ionicons name="chevron-forward" size={14} color={theme.textSecondary} />
          )}
        </TouchableOpacity>
      )}
    </Card>
  );
};

