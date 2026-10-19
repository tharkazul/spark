import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../ui/Card';
import { MetricTile, MetricDeltaTone } from '../ui/MetricTile';
import { AppleHealthDailyBiometrics } from '../../services/appleHealthService';
import { useLanguage } from '../../context/LanguageContext';

interface SonarVitalsCardProps {
  biometrics: AppleHealthDailyBiometrics | null | undefined;
  recentBiometrics?: AppleHealthDailyBiometrics[];
}

export const SonarVitalsCard: React.FC<SonarVitalsCardProps> = ({
  biometrics,
  recentBiometrics = [],
}) => {
  const { t } = useLanguage();
  if (!biometrics) return null;

  const hasRhr = biometrics.resting_hr !== undefined && biometrics.resting_hr !== null && biometrics.resting_hr > 0;
  const hasHrv = biometrics.hrv_sdnn !== undefined && biometrics.hrv_sdnn !== null && biometrics.hrv_sdnn > 0;
  const hasSteps = biometrics.steps !== undefined && biometrics.steps !== null && biometrics.steps > 0;
  const hasCalories = biometrics.active_calories !== undefined && biometrics.active_calories !== null && biometrics.active_calories > 0;
  const hasVo2 = biometrics.vo2_max !== undefined && biometrics.vo2_max !== null && biometrics.vo2_max > 0;

  const hasAnyVital = hasRhr || hasHrv || hasSteps || hasCalories || hasVo2;
  if (!hasAnyVital) {
    return null;
  }

  // Chronological recent history for sparklines
  const sortedHistory = [...recentBiometrics].sort((a, b) => a.date.localeCompare(b.date));
  const rhrSeries = sortedHistory
    .map((r) => r.resting_hr)
    .filter((v): v is number => typeof v === 'number' && v > 0);
  const hrvSeries = sortedHistory
    .map((r) => r.hrv_sdnn)
    .filter((v): v is number => typeof v === 'number' && v > 0);

  // Calculate 7-Day Baseline Averages
  const pastDays = recentBiometrics.filter((r) => r.date !== biometrics.date);
  const rhrPast = pastDays.map((r) => r.resting_hr).filter((v): v is number => typeof v === 'number' && v > 0);
  const hrvPast = pastDays.map((r) => r.hrv_sdnn).filter((v): v is number => typeof v === 'number' && v > 0);

  const avgRhr = rhrPast.length > 0 ? Math.round((rhrPast.reduce((a, b) => a + b, 0) / rhrPast.length) * 10) / 10 : null;
  const avgHrv = hrvPast.length > 0 ? Math.round((hrvPast.reduce((a, b) => a + b, 0) / hrvPast.length) * 10) / 10 : null;

  const rhrDelta = biometrics.resting_hr && avgRhr ? Math.round(biometrics.resting_hr - avgRhr) : null;
  const hrvDelta = biometrics.hrv_sdnn && avgHrv ? Math.round(biometrics.hrv_sdnn - avgHrv) : null;

  const rhrDeltaTone: MetricDeltaTone =
    rhrDelta === null || Math.abs(rhrDelta) < 1 ? 'neutral' : rhrDelta <= -2 ? 'good' : rhrDelta >= 3 ? 'warn' : 'neutral';
  const hrvDeltaTone: MetricDeltaTone =
    hrvDelta === null || Math.abs(hrvDelta) < 1 ? 'neutral' : hrvDelta >= 3 ? 'good' : hrvDelta <= -5 ? 'warn' : 'neutral';

  return (
    <Card className="bg-theme-card p-4 border border-theme-border">
      {/* Header */}
      <View className="flex-row items-center justify-between mb-3">
        <View className="flex-row items-center gap-2">
          <Ionicons name="pulse-outline" size={16} color="#10B981" />
          <Text className="text-xs font-bold text-theme-muted uppercase tracking-wider">
            {t('progress.vitalTrends', 'Vital Trends')}
          </Text>
        </View>
        <Text className="text-[11px] font-semibold text-theme-muted">
          {t('progress.fromAppleHealth', 'Apple Health')}
        </Text>
      </View>

      {/* Grid of Available Tiles */}
      <View className="flex-row flex-wrap gap-2.5">
        {/* Resting Heart Rate */}
        {hasRhr && (
          <View className="flex-1 min-w-[140px]">
            <MetricTile
              label={t('progress.restingHr', 'Resting HR')}
              value={String(Math.round(biometrics.resting_hr!))}
              unit={t('progress.bpm', 'bpm')}
              delta={rhrDelta !== null && rhrDelta !== 0 ? `${rhrDelta > 0 ? '+' : ''}${rhrDelta}` : null}
              deltaTone={rhrDeltaTone}
              series={rhrSeries.length >= 2 ? rhrSeries : undefined}
              color="#38BDF8"
              baseline={avgRhr}
              minRangePadding={3}
            />
          </View>
        )}

        {/* Heart Rate Variability (HRV SDNN) */}
        {hasHrv && (
          <View className="flex-1 min-w-[140px]">
            <MetricTile
              label={t('progress.hrv', 'HRV')}
              value={String(Math.round(biometrics.hrv_sdnn!))}
              unit={t('progress.ms', 'ms')}
              delta={hrvDelta !== null && hrvDelta !== 0 ? `${hrvDelta > 0 ? '+' : ''}${hrvDelta}` : null}
              deltaTone={hrvDeltaTone}
              series={hrvSeries.length >= 2 ? hrvSeries : undefined}
              color="#10B981"
              baseline={avgHrv}
              minRangePadding={5}
            />
          </View>
        )}

        {/* Steps */}
        {hasSteps && (
          <View className="flex-1 min-w-[140px] bg-theme-inset p-3 rounded-inset justify-between">
            <View>
              <View className="flex-row items-center justify-between mb-1">
                <Text className="text-xs font-semibold text-theme-muted">{t('progress.steps')}</Text>
                <Ionicons name="footsteps-outline" size={13} color="#F59E0B" />
              </View>
              <View className="flex-row items-baseline gap-1">
                <Text className="text-2xl font-bold font-rajdhani text-theme-text tabular-nums">
                  {biometrics.steps!.toLocaleString()}
                </Text>
              </View>
            </View>
            {/* Progress Bar (Goal: 10k) */}
            <View className="h-1.5 w-full bg-theme-border/60 rounded-full overflow-hidden mt-2.5">
              <View
                className="h-full bg-amber-400 rounded-full"
                style={{ width: `${Math.min(100, Math.round((biometrics.steps! / 10000) * 100))}%` }}
              />
            </View>
          </View>
        )}

        {/* Active Calories */}
        {hasCalories && (
          <View className="flex-1 min-w-[140px] bg-theme-inset p-3 rounded-inset justify-between">
            <View>
              <View className="flex-row items-center justify-between mb-1">
                <Text className="text-xs font-semibold text-theme-muted">{t('progress.calories')}</Text>
                <Ionicons name="flame-outline" size={13} color="#F97316" />
              </View>
              <View className="flex-row items-baseline gap-1">
                <Text className="text-2xl font-bold font-rajdhani text-theme-text tabular-nums">
                  {Math.round(biometrics.active_calories!)}
                </Text>
                <Text className="text-xs font-semibold text-theme-muted">{t('progress.kcal')}</Text>
              </View>
            </View>
            {/* Progress Bar (Goal: 600 kcal) */}
            <View className="h-1.5 w-full bg-theme-border/60 rounded-full overflow-hidden mt-2.5">
              <View
                className="h-full bg-orange-500 rounded-full"
                style={{ width: `${Math.min(100, Math.round((biometrics.active_calories! / 600) * 100))}%` }}
              />
            </View>
          </View>
        )}

        {/* VO2 Max */}
        {hasVo2 && (
          <View className="flex-1 min-w-[140px] bg-theme-inset p-3 rounded-inset justify-between">
            <View>
              <View className="flex-row items-center justify-between mb-1">
                <Text className="text-xs font-semibold text-theme-muted">{t('progress.vo2Max')}</Text>
                <Ionicons name="speedometer-outline" size={13} color="#06B6D4" />
              </View>
              <View className="flex-row items-baseline gap-1">
                <Text className="text-2xl font-bold font-rajdhani text-theme-text tabular-nums">
                  {biometrics.vo2_max}
                </Text>
                <Text className="text-xs font-semibold text-theme-muted">{t('progress.vo2MaxUnit')}</Text>
              </View>
            </View>
          </View>
        )}
      </View>
    </Card>
  );
};
