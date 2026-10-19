import React from 'react';
import { View, Text } from 'react-native';
import { Card } from '../ui/Card';
import { MetricTile, MetricDeltaTone } from '../ui/MetricTile';
import { useTheme } from '../../hooks/use-theme';
import { useLanguage } from '../../context/LanguageContext';
import {
  AppleHealthDailyBiometrics,
  computeCardiovascularStrain,
} from '../../services/appleHealthService';

interface CardioRecoveryTrendsCardProps {
  todayBiometrics?: AppleHealthDailyBiometrics | null;
  recentBiometrics?: AppleHealthDailyBiometrics[];
}

export const CardioRecoveryTrendsCard: React.FC<CardioRecoveryTrendsCardProps> = ({
  todayBiometrics,
  recentBiometrics = [],
}) => {
  const theme = useTheme();
  const { t } = useLanguage();

  // Combine chronological series for sparklines (oldest -> newest)
  const combinedMap = new Map<string, AppleHealthDailyBiometrics>();
  for (const item of recentBiometrics) {
    if (item?.date) combinedMap.set(item.date, item);
  }
  if (todayBiometrics?.date) {
    combinedMap.set(todayBiometrics.date, todayBiometrics);
  }

  const chronologicalList = Array.from(combinedMap.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  const rhrHistory = chronologicalList.map((r) => r.resting_hr ?? null);
  const hrvHistory = chronologicalList.map((r) => r.hrv_sdnn ?? null);

  const hasRhr =
    (todayBiometrics?.resting_hr !== undefined &&
      todayBiometrics?.resting_hr !== null &&
      todayBiometrics?.resting_hr > 0) ||
    rhrHistory.some((v) => v !== null && v > 0);

  const hasHrv =
    (todayBiometrics?.hrv_sdnn !== undefined &&
      todayBiometrics?.hrv_sdnn !== null &&
      todayBiometrics?.hrv_sdnn > 0) ||
    hrvHistory.some((v) => v !== null && v > 0);

  if (!hasRhr && !hasHrv) {
    return null;
  }

  const strain = computeCardiovascularStrain(todayBiometrics, recentBiometrics);

  const getStrainStyle = () => {
    switch (strain.strainLevel) {
      case 'high':
        return {
          color: '#EF4444',
          label: t('progress.cardioStrainHigh', 'High Strain'),
        };
      case 'elevated':
        return {
          color: '#F59E0B',
          label: t('progress.cardioStrainElevated', 'Elevated Strain'),
        };
      case 'moderate':
        return {
          color: '#0EA5E9',
          label: t('progress.cardioStrainModerate', 'Moderate Load'),
        };
      default:
        return {
          color: '#22C55E',
          label: t('progress.cardioStrainFresh', 'Fresh & Primed'),
        };
    }
  };

  const strainStyle = getStrainStyle();

  const formatSigned = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${Math.abs(Math.round(n))}`;

  const rhrDeltaTone: MetricDeltaTone =
    strain.rhrDelta !== null && Math.abs(strain.rhrDelta) >= 2
      ? strain.rhrDelta < 0
        ? 'good'
        : 'warn'
      : 'neutral';

  const hrvDeltaTone: MetricDeltaTone =
    strain.hrvDelta !== null && Math.abs(strain.hrvDelta) >= 3
      ? strain.hrvDelta > 0
        ? 'good'
        : 'warn'
      : 'neutral';

  const latestRhrVal = strain.restingHr ?? rhrHistory.filter((v): v is number => v !== null && v > 0).slice(-1)[0];
  const latestHrvVal = strain.hrv ?? hrvHistory.filter((v): v is number => v !== null && v > 0).slice(-1)[0];

  return (
    <Card>
      {/* Header Row */}
      <View className="flex-row items-center justify-between">
        <Text className="text-xs font-bold text-theme-muted uppercase tracking-wider">
          {t('progress.cardioAutonomicRecovery', 'Cardio & Autonomic Recovery')}
        </Text>
        <Text className="text-xs font-medium text-theme-muted">
          {t('home.recoveryVsAvg', 'vs your last 7 days')}
        </Text>
      </View>

      {/* Status Headline + Concise 1-line Advice */}
      <View className="flex-row items-center gap-2 mt-1.5">
        <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: strainStyle.color }} />
        <Text className="text-base font-bold text-theme-text">{strainStyle.label}</Text>
      </View>
      <Text className="text-xs text-theme-muted mt-0.5 leading-snug" numberOfLines={2}>
        {strain.actionAdvice || strain.headline}
      </Text>

      {/* Telemetry Metric Tiles with Full-Width Sparklines */}
      <View className="flex-row gap-2.5 mt-3">
        {hasRhr && (
          <MetricTile
            label={t('progress.restingHr', 'Resting HR')}
            value={latestRhrVal !== undefined ? Math.round(latestRhrVal) : '–'}
            unit={latestRhrVal !== undefined ? t('progress.bpm', 'bpm') : undefined}
            delta={
              strain.rhrDelta !== null && Math.abs(strain.rhrDelta) >= 0.5
                ? formatSigned(strain.rhrDelta)
                : null
            }
            deltaTone={rhrDeltaTone}
            series={rhrHistory}
            baseline={strain.avgRhr ?? null}
            color={strain.rhrStatus === 'elevated' ? '#F59E0B' : theme.tint}
          />
        )}

        {hasHrv && (
          <MetricTile
            label={t('home.metricHrv', 'HRV')}
            value={latestHrvVal !== undefined ? Math.round(latestHrvVal) : '–'}
            unit={latestHrvVal !== undefined ? t('progress.ms', 'ms') : undefined}
            delta={
              strain.hrvDelta !== null && Math.abs(strain.hrvDelta) >= 1
                ? formatSigned(strain.hrvDelta)
                : null
            }
            deltaTone={hrvDeltaTone}
            series={hrvHistory}
            baseline={strain.avgHrv ?? null}
            color={strain.hrvStatus === 'suppressed' ? '#F59E0B' : '#10B981'}
          />
        )}
      </View>
    </Card>
  );
};

