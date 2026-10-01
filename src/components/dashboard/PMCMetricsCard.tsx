import { BrandColors } from '@/constants/theme';
import { RookaMark } from '../ui/RookaPoints';
import React from 'react';
import { useTheme } from '@/hooks/use-theme';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SubscriptionTier } from '../../types/user';
import { Sparkline } from '../common/Sparkline';
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
  tier?: SubscriptionTier;
  loading?: boolean;
}

export const PMCMetricsCard: React.FC<PMCMetricsProps> = ({
  ctl = 0,
  atl = 0,
  tsb = 0,
  readinessScore,
  weightKg = 0,
  ctlDelta = 0,
  atlDelta = 0,
  ctlHistory = [],
  atlHistory = [],
  tsbHistory = [],
  weightHistory = [],
  tier = 'free',
  loading = false,
}) => {
  const theme = useTheme();
  const { t } = useLanguage();

  if (loading) {
    return <PMCMetricsSkeleton />;
  }

  // With no sessions logged, CTL/ATL/TSB are all zero and every derived label
  // below is a statement about nothing. Track that explicitly so the card can
  // say "no data" instead of asserting a training state.
  // Check for a non-zero *value*, not merely a non-empty series: the PMC
  // helpers return a full 42-day window padded with zeros, so a length check
  // is true even when nothing has ever been logged.
  const hasAnyValue = (series: number[]) => series.some((n) => Number(n) > 0);
  const hasTrainingData = ctl > 0 || atl > 0 || hasAnyValue(ctlHistory) || hasAnyValue(atlHistory);
  const hasWeightData = weightKg > 0 || hasAnyValue(weightHistory);

  // Calculate Readiness score if not provided directly
  const computedReadiness = readinessScore !== undefined 
    ? readinessScore 
    : Math.max(0, Math.min(100, Math.round(50 + Math.max(-20, Math.min(20, tsb * 0.5)))));

  const getTsbState = (val: number) => {
    if (val > 25) return { label: 'Fresh / Undertrained', color: '#38BDF8', bg: 'bg-sky-500/15', text: 'text-sky-500', index: 0 };
    if (val >= 5) return { label: 'Fresh', color: '#10B981', bg: 'bg-emerald-500/15', text: 'text-emerald-500', index: 1 };
    if (val >= -10) return { label: 'Optimal', color: '#10B981', bg: 'bg-emerald-500/15', text: 'text-emerald-500', index: 2 };
    if (val >= -30) return { label: 'High Fatigue', color: '#F59E0B', bg: 'bg-amber-500/15', text: 'text-amber-500', index: 3 };
    return { label: 'Overreaching', color: '#EF4444', bg: 'bg-rose-500/15', text: 'text-rose-500', index: 4 };
  };
  const tsbState = getTsbState(tsb);

  return (
    <View className="mb-4">
      {/* Metric Section Header */}
      <View className="flex-row items-center justify-between mb-3 px-1">
        <View className="flex-row items-center gap-x-2">
          <Ionicons name="pulse-outline" size={18} color={theme.tint} />
          <Text className="text-xs font-bold text-theme-text uppercase tracking-wider">
            {t('dashboard.fitnessAndFatigue')}
          </Text>
        </View>
        {tier === 'rooka_plus' && (
          <View className="bg-theme-accent/15 px-2 py-0.5 rounded-full flex-row items-center gap-x-1">
            <RookaMark size={12} color={theme.tint} />
            <Text className="text-xs text-theme-accent font-bold font-rajdhani">rooka+ AI</Text>
          </View>
        )}
      </View>

      {/* 4 Grid Metric Cards with Sparklines */}
      <View className="flex-row flex-wrap gap-2.5">
        {/* CTL Card */}
        <View className="flex-1 min-w-[45%] bg-theme-card rounded-tile p-3.5 border border-theme-border">
          <View className="flex-row justify-between items-start mb-1">
            <Text className="text-xs font-bold text-theme-muted">
              {t('dashboard.fitness')}
            </Text>
            {Math.abs(ctlDelta) >= 0.05 && (
              <View className={`flex-row items-center px-1.5 py-0.5 rounded-md ${ctlDelta > 0 ? 'bg-emerald-500/15' : 'bg-slate-500/15'}`}>
                <Ionicons name={ctlDelta > 0 ? 'arrow-up' : 'arrow-down'} size={10} color={ctlDelta > 0 ? '#10b981' : '#64748b'} />
                <Text className={`text-xs font-bold ml-0.5 ${ctlDelta > 0 ? 'text-emerald-500' : 'text-theme-muted'}`}>
                  {ctlDelta > 0 ? '+' : ''}{ctlDelta.toFixed(1)}
                </Text>
              </View>
            )}
          </View>
          <Text className="text-3xl font-bold text-theme-text font-rajdhani tabular-nums mb-1">
            {ctl.toFixed(1)}
          </Text>

          {/* Sparkline Graph */}
          <Sparkline
            data={ctlHistory}
            color="#10b981"
            gradientFrom="#10b98144"
            gradientTo="#10b98100"
            height={32}
            width={120}
          />
          <Text className="text-[11px] text-theme-muted mt-1">{t('dashboard.chronicLoad')}</Text>
        </View>

        {/* ATL Card */}
        <View className="flex-1 min-w-[45%] bg-theme-card rounded-tile p-3.5 border border-theme-border">
          <View className="flex-row justify-between items-start mb-1">
            <Text className="text-xs font-bold text-theme-muted">
              {t('dashboard.fatigue')}
            </Text>
            {Math.abs(atlDelta) >= 0.05 && (
              <View className={`flex-row items-center px-1.5 py-0.5 rounded-md ${atlDelta > 0 ? 'bg-amber-500/15' : 'bg-slate-500/15'}`}>
                <Ionicons name={atlDelta > 0 ? 'arrow-up' : 'arrow-down'} size={10} color={atlDelta > 0 ? '#f59e0b' : '#64748b'} />
                <Text className={`text-xs font-bold ml-0.5 ${atlDelta > 0 ? 'text-amber-500' : 'text-theme-muted'}`}>
                  {atlDelta > 0 ? '+' : ''}{atlDelta.toFixed(1)}
                </Text>
              </View>
            )}
          </View>
          <Text className="text-3xl font-bold text-theme-text font-rajdhani tabular-nums mb-1">
            {atl.toFixed(1)}
          </Text>

          {/* Sparkline Graph */}
          <Sparkline
            data={atlHistory}
            color="#f59e0b"
            gradientFrom="#f59e0b44"
            gradientTo="#f59e0b00"
            height={32}
            width={120}
          />
          <Text className="text-[11px] text-theme-muted mt-1">{t('dashboard.acuteLoad')}</Text>
        </View>

        {/* Form (TSB) Card */}
        <View className="flex-1 min-w-[45%] bg-theme-card rounded-tile p-3.5 border border-theme-border">
          <View className="flex-row justify-between items-start mb-1">
            <Text className="text-xs font-bold text-theme-muted flex-1 mr-1.5" numberOfLines={1}>
              Form (TSB)
            </Text>
            {hasTrainingData && (
              <View className={`px-1.5 py-0.5 rounded-md ${tsbState.bg}`}>
                <Text className={`text-[11px] font-bold ${tsbState.text}`}>
                  {tsbState.label}
                </Text>
              </View>
            )}
          </View>
          <Text className={`text-3xl font-bold font-rajdhani tabular-nums mb-1 ${hasTrainingData ? tsbState.text : 'text-theme-muted'}`}>
            {hasTrainingData ? (tsb > 0 ? `+${tsb.toFixed(1)}` : tsb.toFixed(1)) : '--'}
          </Text>

          {/* 5-State Form Scale Bar */}
          <View className="flex-row gap-1 my-1.5 w-full">
            {['#38BDF8', '#10B981', '#94A3B8', '#F59E0B', '#EF4444'].map((c, idx) => (
              <View
                key={`form-seg-${idx}`}
                style={{ backgroundColor: hasTrainingData && tsbState.index === idx ? c : `${c}33` }}
                className="flex-1 h-1.5 rounded-full"
              />
            ))}
          </View>

          {/* Sparkline Graph */}
          <Sparkline
            data={tsbHistory}
            color={tsbState.color}
            gradientFrom={`${tsbState.color}44`}
            gradientTo={`${tsbState.color}00`}
            height={28}
            width={120}
          />
          <Text className="text-[11px] text-theme-muted mt-1">
            {hasTrainingData ? 'Training Stress Balance' : t('dashboard.noDataYet')}
          </Text>
        </View>

        {/* Body Weight Trend Card */}
        <View className="flex-1 min-w-[45%] bg-theme-card rounded-tile p-3.5 border border-theme-border">
          <View className="flex-row justify-between items-start mb-1">
            <Text className="text-xs font-bold text-theme-muted">
              {t('physique.weightInput')}
            </Text>
            <Ionicons name="scale-outline" size={14} color={theme.tint} />
          </View>
          <Text className="text-3xl font-bold text-theme-text font-rajdhani tabular-nums mb-1">
            {weightKg > 0 ? `${weightKg.toFixed(1)} ` : '-- '}
            <Text className="text-xs text-theme-muted font-normal">kg</Text>
          </Text>

          {/* Sparkline Graph */}
          {hasWeightData ? (
            <>
              <Sparkline
                data={weightHistory}
                color={theme.tint}
                gradientFrom={`${BrandColors.primary}44`}
                gradientTo={`${BrandColors.primary}00`}
                height={32}
                width={120}
                minRangePadding={1}
              />
              <Text className="text-[11px] text-theme-muted mt-1">{t('dashboard.emaTrendline')}</Text>
            </>
          ) : (
            <View style={{ height: 32 }} className="justify-center">
              <Text className="text-xs text-theme-muted">{t('dashboard.logWeightPrompt')}</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
};
