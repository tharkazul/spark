import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../ui/Card';
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
  const hasHrRange = biometrics.min_hr && biometrics.max_hr && biometrics.avg_hr;

  const hasAnyVital = hasRhr || hasHrv || hasSteps || hasCalories || hasVo2 || hasHrRange;
  if (!hasAnyVital) {
    return null;
  }

  // Calculate 7-Day Baseline Averages
  const pastDays = recentBiometrics.filter((r) => r.date !== biometrics.date);
  const rhrPast = pastDays.map((r) => r.resting_hr).filter((v): v is number => typeof v === 'number' && v > 0);
  const hrvPast = pastDays.map((r) => r.hrv_sdnn).filter((v): v is number => typeof v === 'number' && v > 0);

  const avgRhr = rhrPast.length > 0 ? Math.round((rhrPast.reduce((a, b) => a + b, 0) / rhrPast.length) * 10) / 10 : null;
  const avgHrv = hrvPast.length > 0 ? Math.round((hrvPast.reduce((a, b) => a + b, 0) / hrvPast.length) * 10) / 10 : null;

  const rhrDelta = biometrics.resting_hr && avgRhr ? Math.round((biometrics.resting_hr - avgRhr) * 10) / 10 : null;
  const hrvDelta = biometrics.hrv_sdnn && avgHrv ? Math.round((biometrics.hrv_sdnn - avgHrv) * 10) / 10 : null;

  // Vital Status Helpers
  const getRhrStatus = (rhr: number) => {
    if (rhr < 55) return { label: t('progress.optimal', 'Optimal'), color: '#10B981' };
    if (rhr <= 70) return { label: t('progress.normal', 'Normal'), color: '#38BDF8' };
    return { label: t('progress.elevated', 'Elevated'), color: '#F59E0B' };
  };

  const getHrvStatus = (hrv: number) => {
    if (hrv >= 55) return { label: t('progress.readinessPrime', 'Prime'), color: '#10B981' };
    if (hrv >= 35) return { label: t('progress.balanced', 'Balanced'), color: '#38BDF8' };
    return { label: t('progress.suppressed', 'Suppressed'), color: '#F87171' };
  };

  return (
    <Card className="mb-4 bg-theme-card p-4 border border-theme-border">
      {/* Header */}
      <View className="flex-row items-center justify-between pb-3 mb-3 border-b border-theme-border/60">
        <View className="flex-row items-center gap-2">
          <Ionicons name="pulse-outline" size={16} color="#10B981" />
          <Text className="text-xs font-bold text-theme-muted uppercase tracking-wider">
            {t('progress.vitalTrends', 'Vital Trends')}
          </Text>
        </View>
        <Text className="text-[10px] font-bold text-theme-muted">
          {t('progress.fromAppleHealth', 'Apple Health')}
        </Text>
      </View>

      {/* Grid of Available Tiles */}
      <View className="flex-row flex-wrap gap-2.5">
        {/* Resting Heart Rate */}
        {hasRhr && (
          <View className="flex-1 min-w-[140px] bg-slate-800/40 p-3 rounded-2xl border border-slate-700/40">
            <View className="flex-row items-center justify-between mb-1">
              <Text className="text-[11px] text-theme-muted font-bold">{t('progress.restingHr', 'Resting HR')}</Text>
              <Ionicons name="heart-outline" size={14} color="#EF4444" />
            </View>
            <View className="flex-row items-baseline justify-between my-0.5">
              <View className="flex-row items-baseline gap-1">
                <Text className="text-xl font-extrabold text-theme-text">{biometrics.resting_hr}</Text>
                <Text className="text-[10px] text-theme-muted font-bold">{t('progress.bpm', 'bpm')}</Text>
              </View>
              {rhrDelta !== null && Math.abs(rhrDelta) >= 0.5 && (
                <View
                  className={`flex-row items-center px-1.5 py-0.5 rounded-md ${
                    rhrDelta > 0 ? 'bg-amber-500/15' : 'bg-emerald-500/15'
                  }`}
                >
                  <Ionicons
                    name={rhrDelta > 0 ? 'arrow-up' : 'arrow-down'}
                    size={9}
                    color={rhrDelta > 0 ? '#F59E0B' : '#10B981'}
                  />
                  <Text
                    className={`text-[9px] font-bold ml-0.5 ${
                      rhrDelta > 0 ? 'text-amber-500' : 'text-emerald-500'
                    }`}
                  >
                    {rhrDelta > 0 ? '+' : ''}
                    {rhrDelta}
                  </Text>
                </View>
              )}
            </View>
            <View className="mt-1 flex-row items-center justify-between">
              <Text
                className="text-[10px] font-bold"
                style={{ color: getRhrStatus(biometrics.resting_hr!).color }}
              >
                ● {getRhrStatus(biometrics.resting_hr!).label}
              </Text>
              {avgRhr && (
                <Text className="text-[9px] text-theme-muted">
                  7d: {avgRhr}
                </Text>
              )}
            </View>
          </View>
        )}

        {/* Heart Rate Variability (HRV SDNN) */}
        {hasHrv && (
          <View className="flex-1 min-w-[140px] bg-slate-800/40 p-3 rounded-2xl border border-slate-700/40">
            <View className="flex-row items-center justify-between mb-1">
              <Text className="text-[11px] text-theme-muted font-bold">{t('progress.hrv', 'HRV')} (SDNN)</Text>
              <Ionicons name="flash-outline" size={14} color="#10B981" />
            </View>
            <View className="flex-row items-baseline justify-between my-0.5">
              <View className="flex-row items-baseline gap-1">
                <Text className="text-xl font-extrabold text-theme-text">{biometrics.hrv_sdnn}</Text>
                <Text className="text-[10px] text-theme-muted font-bold">{t('progress.ms', 'ms')}</Text>
              </View>
              {hrvDelta !== null && Math.abs(hrvDelta) >= 1 && (
                <View
                  className={`flex-row items-center px-1.5 py-0.5 rounded-md ${
                    hrvDelta >= 0 ? 'bg-emerald-500/15' : 'bg-rose-500/15'
                  }`}
                >
                  <Ionicons
                    name={hrvDelta >= 0 ? 'arrow-up' : 'arrow-down'}
                    size={9}
                    color={hrvDelta >= 0 ? '#10B981' : '#EF4444'}
                  />
                  <Text
                    className={`text-[9px] font-bold ml-0.5 ${
                      hrvDelta >= 0 ? 'text-emerald-500' : 'text-rose-500'
                    }`}
                  >
                    {hrvDelta > 0 ? '+' : ''}
                    {hrvDelta}
                  </Text>
                </View>
              )}
            </View>
            <View className="mt-1 flex-row items-center justify-between">
              <Text
                className="text-[10px] font-bold"
                style={{ color: getHrvStatus(biometrics.hrv_sdnn!).color }}
              >
                ● {getHrvStatus(biometrics.hrv_sdnn!).label}
              </Text>
              {avgHrv && (
                <Text className="text-[9px] text-theme-muted">
                  7d: {avgHrv}
                </Text>
              )}
            </View>
          </View>
        )}

        {/* Steps */}
        {hasSteps && (
          <View className="flex-1 min-w-[140px] bg-slate-800/40 p-3 rounded-2xl border border-slate-700/40">
            <View className="flex-row items-center justify-between mb-1">
              <Text className="text-[11px] text-theme-muted font-bold">{t('progress.steps')}</Text>
              <Ionicons name="footsteps-outline" size={14} color="#F59E0B" />
            </View>
            <View className="flex-row items-baseline gap-1 my-0.5">
              <Text className="text-xl font-extrabold text-theme-text">
                {biometrics.steps!.toLocaleString()}
              </Text>
              <Text className="text-[10px] text-theme-muted font-bold">{t('progress.stepsUnit')}</Text>
            </View>
            {/* Progress Bar (Goal: 10k) */}
            <View className="h-1.5 w-full bg-slate-700/50 rounded-full overflow-hidden mt-1.5">
              <View
                className="h-full bg-amber-400 rounded-full"
                style={{ width: `${Math.min(100, Math.round((biometrics.steps! / 10000) * 100))}%` }}
              />
            </View>
          </View>
        )}

        {/* Active Calories */}
        {hasCalories && (
          <View className="flex-1 min-w-[140px] bg-slate-800/40 p-3 rounded-2xl border border-slate-700/40">
            <View className="flex-row items-center justify-between mb-1">
              <Text className="text-[11px] text-theme-muted font-bold">{t('progress.calories')}</Text>
              <Ionicons name="flame-outline" size={14} color="#F97316" />
            </View>
            <View className="flex-row items-baseline gap-1 my-0.5">
              <Text className="text-xl font-extrabold text-theme-text">{biometrics.active_calories}</Text>
              <Text className="text-[10px] text-theme-muted font-bold">{t('progress.kcal')}</Text>
            </View>
            {/* Progress Bar (Goal: 600 kcal) */}
            <View className="h-1.5 w-full bg-slate-700/50 rounded-full overflow-hidden mt-1.5">
              <View
                className="h-full bg-orange-500 rounded-full"
                style={{ width: `${Math.min(100, Math.round((biometrics.active_calories! / 600) * 100))}%` }}
              />
            </View>
          </View>
        )}

        {/* VO2 Max */}
        {hasVo2 && (
          <View className="flex-1 min-w-[140px] bg-slate-800/40 p-3 rounded-2xl border border-slate-700/40">
            <View className="flex-row items-center justify-between mb-1">
              <Text className="text-[11px] text-theme-muted font-bold">{t('progress.vo2Max')}</Text>
              <Ionicons name="speedometer-outline" size={14} color="#06B6D4" />
            </View>
            <View className="flex-row items-baseline gap-1 my-0.5">
              <Text className="text-xl font-extrabold text-theme-text">{biometrics.vo2_max}</Text>
              <Text className="text-[10px] text-theme-muted font-bold">{t('progress.vo2MaxUnit')}</Text>
            </View>
            <View className="mt-1">
              <Text className="text-[10px] font-bold text-cyan-400">
                ● {t('progress.cardiorespiratoryFitness')}
              </Text>
            </View>
          </View>
        )}
      </View>
    </Card>
  );
};
