import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../ui/Card';
import { Sparkline } from '../common/Sparkline';
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

  // User requirement: strict conditional rendering - if no biometric data, show nothing
  if (!hasRhr && !hasHrv) {
    return null;
  }

  const strain = computeCardiovascularStrain(todayBiometrics, recentBiometrics);

  const getStrainBadge = () => {
    switch (strain.strainLevel) {
      case 'high':
        return {
          bg: 'bg-rose-500/15',
          border: 'border-rose-500/30',
          text: 'text-rose-500',
          color: '#EF4444',
          label: t('progress.cardioStrainHigh', 'High Strain'),
        };
      case 'elevated':
        return {
          bg: 'bg-amber-500/15',
          border: 'border-amber-500/30',
          text: 'text-amber-500',
          color: '#F59E0B',
          label: t('progress.cardioStrainElevated', 'Elevated Strain'),
        };
      case 'moderate':
        return {
          bg: 'bg-sky-500/15',
          border: 'border-sky-500/30',
          text: 'text-sky-400',
          color: '#38BDF8',
          label: t('progress.cardioStrainModerate', 'Moderate Load'),
        };
      default:
        return {
          bg: 'bg-emerald-500/15',
          border: 'border-emerald-500/30',
          text: 'text-emerald-500',
          color: '#10B981',
          label: t('progress.cardioStrainFresh', 'Fresh & Primed'),
        };
    }
  };

  const strainBadge = getStrainBadge();

  return (
    <View className="mb-4">
      {/* Section Header */}
      <View className="flex-row items-center justify-between mb-3 px-1">
        <View className="flex-row items-center gap-x-2">
          <Ionicons name="pulse" size={18} color={strainBadge.color} />
          <Text className="text-xs font-bold text-theme-text uppercase tracking-wider">
            {t('progress.cardioAutonomicRecovery', 'Cardio & Autonomic Recovery')}
          </Text>
        </View>
        <View
          className={`px-2 py-0.5 rounded-full flex-row items-center border ${strainBadge.bg} ${strainBadge.border}`}
        >
          <Text className={`text-[11px] font-bold ${strainBadge.text}`}>
            ● {strainBadge.label}
          </Text>
        </View>
      </View>

      {/* 2 Telemetry Metric Cards with Sparklines */}
      <View className="flex-row flex-wrap gap-2.5 mb-2.5">
        {/* Resting HR Card */}
        {hasRhr && (
          <View className="flex-1 min-w-[45%] bg-theme-card rounded-tile p-3.5 border border-theme-border">
            <View className="flex-row justify-between items-start mb-1">
              <Text className="text-xs font-bold text-theme-muted">
                {t('progress.restingHr', 'Resting HR')}
              </Text>
              {strain.rhrDelta !== null && Math.abs(strain.rhrDelta) >= 0.5 && (
                <View
                  className={`flex-row items-center px-1.5 py-0.5 rounded-md ${
                    strain.rhrDelta > 0 ? 'bg-amber-500/15' : 'bg-emerald-500/15'
                  }`}
                >
                  <Ionicons
                    name={strain.rhrDelta > 0 ? 'arrow-up' : 'arrow-down'}
                    size={10}
                    color={strain.rhrDelta > 0 ? '#F59E0B' : '#10B981'}
                  />
                  <Text
                    className={`text-[10px] font-bold ml-0.5 ${
                      strain.rhrDelta > 0 ? 'text-amber-500' : 'text-emerald-500'
                    }`}
                  >
                    {strain.rhrDelta > 0 ? '+' : ''}
                    {strain.rhrDelta}
                  </Text>
                </View>
              )}
            </View>

            <View className="flex-row items-baseline gap-1 mb-1">
              <Text className="text-3xl font-bold text-theme-text font-rajdhani tabular-nums">
                {strain.restingHr ?? (rhrHistory[rhrHistory.length - 1] ?? '--')}
              </Text>
              <Text className="text-xs font-bold text-theme-muted">
                {t('progress.bpm', 'bpm')}
              </Text>
            </View>

            {/* 7-Day Sparkline */}
            <Sparkline
              data={rhrHistory}
              color={strain.rhrStatus === 'elevated' ? '#F59E0B' : '#EF4444'}
              gradientFrom={
                strain.rhrStatus === 'elevated' ? '#F59E0B44' : '#EF444444'
              }
              gradientTo="#00000000"
              height={32}
              width={130}
            />

            <Text className="text-[10px] text-theme-muted mt-1 font-medium">
              {strain.avgRhr
                ? `7d Avg: ${strain.avgRhr} bpm`
                : t('progress.baselineCalibrating', 'Baseline calibrating')}
            </Text>
          </View>
        )}

        {/* HRV Card */}
        {hasHrv && (
          <View className="flex-1 min-w-[45%] bg-theme-card rounded-tile p-3.5 border border-theme-border">
            <View className="flex-row justify-between items-start mb-1">
              <Text className="text-xs font-bold text-theme-muted">
                {t('progress.hrv', 'HRV')} (SDNN)
              </Text>
              {strain.hrvDelta !== null && Math.abs(strain.hrvDelta) >= 1 && (
                <View
                  className={`flex-row items-center px-1.5 py-0.5 rounded-md ${
                    strain.hrvDelta >= 0 ? 'bg-emerald-500/15' : 'bg-rose-500/15'
                  }`}
                >
                  <Ionicons
                    name={strain.hrvDelta >= 0 ? 'arrow-up' : 'arrow-down'}
                    size={10}
                    color={strain.hrvDelta >= 0 ? '#10B981' : '#EF4444'}
                  />
                  <Text
                    className={`text-[10px] font-bold ml-0.5 ${
                      strain.hrvDelta >= 0 ? 'text-emerald-500' : 'text-rose-500'
                    }`}
                  >
                    {strain.hrvDelta > 0 ? '+' : ''}
                    {strain.hrvDelta}
                  </Text>
                </View>
              )}
            </View>

            <View className="flex-row items-baseline gap-1 mb-1">
              <Text className="text-3xl font-bold text-theme-text font-rajdhani tabular-nums">
                {strain.hrv ?? (hrvHistory[hrvHistory.length - 1] ?? '--')}
              </Text>
              <Text className="text-xs font-bold text-theme-muted">
                {t('progress.ms', 'ms')}
              </Text>
            </View>

            {/* 7-Day Sparkline */}
            <Sparkline
              data={hrvHistory}
              color={strain.hrvStatus === 'suppressed' ? '#EF4444' : '#10B981'}
              gradientFrom={
                strain.hrvStatus === 'suppressed' ? '#EF444444' : '#10B98144'
              }
              gradientTo="#00000000"
              height={32}
              width={130}
            />

            <Text className="text-[10px] text-theme-muted mt-1 font-medium">
              {strain.avgHrv
                ? `7d Avg: ${strain.avgHrv} ms`
                : t('progress.baselineCalibrating', 'Baseline calibrating')}
            </Text>
          </View>
        )}
      </View>

      {/* Autonomic Load & Coach Insight Banner */}
      <View className="bg-theme-card rounded-tile p-3.5 border border-theme-border">
        <View className="flex-row items-center gap-2 mb-1.5">
          <View
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: strainBadge.color }}
          />
          <Text className="text-xs font-extrabold text-theme-text">
            {strain.headline}
          </Text>
        </View>
        <Text className="text-xs text-theme-muted leading-relaxed mb-2">
          {strain.description}
        </Text>
        <View className="flex-row items-center gap-1.5 pt-2 border-t border-theme-border/40">
          <Ionicons name="bulb-outline" size={13} color={theme.tint} />
          <Text className="text-[11px] font-semibold text-theme-accent flex-1">
            {strain.actionAdvice}
          </Text>
        </View>
      </View>
    </View>
  );
};
