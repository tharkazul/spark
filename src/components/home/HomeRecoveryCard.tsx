import { useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Card } from '../ui/Card';
import { Sparkline } from '../common/Sparkline';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '@/hooks/use-theme';
import {
  AppleHealthDailyBiometrics,
  computeCardiovascularStrain,
  fetchRecentBiometricsFromServer,
  fetchTodayBiometricsFromServer,
} from '../../services/appleHealthService';

interface HomeRecoveryCardProps {
  /** Pre-fills the "ask your coach" field when recovery is low. */
  onAskAdjust: () => void;
  /** Today has no session planned: the advice talks about the rest day instead. */
  isRestDay?: boolean;
}

// Same strain model the Progress tab uses (7-day personal baseline), with plain
// Home copy: one headline and one sentence about what that means for today.
const LEVEL_STYLE = {
  none: { color: '#22C55E', headline: 'home.recoveryFreshHeadline', advice: 'home.recoveryFreshAdvice' },
  moderate: { color: '#0EA5E9', headline: 'home.recoveryModerateHeadline', advice: 'home.recoveryModerateAdvice' },
  elevated: { color: '#F59E0B', headline: 'home.recoveryElevatedHeadline', advice: 'home.recoveryElevatedAdvice' },
  high: { color: '#EF4444', headline: 'home.recoveryHighHeadline', advice: 'home.recoveryHighAdvice' },
} as const;

const avg = (values: number[]) => (values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null);

const formatSleep = (minutes: number) => `${Math.floor(minutes / 60)}h ${String(Math.round(minutes % 60)).padStart(2, '0')}m`;

interface MetricTileProps {
  label: string;
  value: string;
  delta: string | null;
  deltaGood: boolean | null;
  series: (number | null)[];
  color: string;
}

function MetricTile({ label, value, delta, deltaGood, series, color }: MetricTileProps) {
  const deltaClass = deltaGood === null ? 'text-theme-muted' : deltaGood ? 'text-semantic-success' : 'text-semantic-warning';
  return (
    <View className="flex-1 bg-theme-inset rounded-inset p-2.5">
      <Text className="text-[11px] font-semibold text-theme-muted">{label}</Text>
      <Text className="text-base font-extrabold text-theme-text mt-0.5 font-rajdhani" numberOfLines={1}>
        {value}
      </Text>
      <Text className={`text-[10px] font-bold ${deltaClass}`} numberOfLines={1}>
        {delta ?? ' '}
      </Text>
      <View className="mt-1.5">
        <Sparkline data={series} color={color} gradientFrom={`${color}33`} gradientTo={`${color}00`} height={22} width={84} strokeWidth={1.5} />
      </View>
    </View>
  );
}

export function HomeRecoveryCard({ onAskAdjust, isRestDay = false }: HomeRecoveryCardProps) {
  const { t } = useLanguage();
  const theme = useTheme();
  const [today, setToday] = useState<AppleHealthDailyBiometrics | null>(null);
  const [recent, setRecent] = useState<AppleHealthDailyBiometrics[]>([]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      Promise.all([fetchTodayBiometricsFromServer(), fetchRecentBiometricsFromServer(8)])
        .then(([todayRow, recentRows]) => {
          if (!active) return;
          setToday(todayRow);
          setRecent(recentRows || []);
        })
        .catch(() => {});
      return () => {
        active = false;
      };
    }, [])
  );

  const view = useMemo(() => {
    if (!today) return null;
    const hasSignal = Boolean(today.sleep_minutes || today.hrv_sdnn || today.resting_hr);
    if (!hasSignal) return null;

    const strain = computeCardiovascularStrain(today, recent);
    // Oldest -> newest, today last, for the sparklines.
    const days = [...recent.filter((r) => r.date !== today.date), today].sort((a, b) => a.date.localeCompare(b.date)).slice(-8);
    const past = recent.filter((r) => r.date !== today.date);
    const avgSleep = avg(past.map((r) => r.sleep_minutes).filter((v): v is number => typeof v === 'number' && v > 0));

    const sleepDelta = today.sleep_minutes && avgSleep !== null ? Math.round(today.sleep_minutes - avgSleep) : null;

    const signed = (n: number, unit: string) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${Math.abs(n)}${unit}`;

    return {
      level: strain.strainLevel,
      tiles: [
        {
          label: t('home.metricSleep'),
          value: today.sleep_minutes ? formatSleep(today.sleep_minutes) : '–',
          delta: sleepDelta !== null ? t('home.vsAvg', { delta: signed(sleepDelta, 'm') }) : null,
          deltaGood: sleepDelta !== null && Math.abs(sleepDelta) >= 15 ? sleepDelta > 0 : null,
          series: days.map((d) => (d.sleep_minutes ? d.sleep_minutes / 60 : null)),
        },
        {
          label: t('home.metricHrv'),
          value: strain.hrv ? `${Math.round(strain.hrv)} ms` : '–',
          delta: strain.hrvDelta !== null ? t('home.vsAvg', { delta: signed(Math.round(strain.hrvDelta), '') }) : null,
          deltaGood: strain.hrvDelta !== null && Math.abs(strain.hrvDelta) >= 3 ? strain.hrvDelta > 0 : null,
          series: days.map((d) => d.hrv_sdnn ?? null),
        },
        {
          label: t('home.metricRestingHr'),
          value: strain.restingHr ? `${Math.round(strain.restingHr)} bpm` : '–',
          delta: strain.rhrDelta !== null ? t('home.vsAvg', { delta: signed(Math.round(strain.rhrDelta), '') }) : null,
          deltaGood: strain.rhrDelta !== null && Math.abs(strain.rhrDelta) >= 2 ? strain.rhrDelta < 0 : null,
          series: days.map((d) => d.resting_hr ?? null),
        },
      ],
    };
  }, [today, recent, t]);

  // No Apple Health data: the card stays out of the way rather than nagging.
  if (!view) return null;

  const style = LEVEL_STYLE[view.level];
  const isLow = view.level === 'elevated' || view.level === 'high';
  const advice = isRestDay ? t(isLow ? 'home.recoveryRestDayLow' : 'home.recoveryRestDayGood') : t(style.advice);

  return (
    <Card>
      <View className="flex-row items-center justify-between mb-1">
        <Text className="text-xs font-bold uppercase tracking-wider text-theme-muted">{t('home.recoveryTitle')}</Text>
        <Text className="text-[10px] font-medium text-theme-muted">{t('home.recoveryVsAvg')}</Text>
      </View>

      <View className="flex-row items-center gap-2 mt-1">
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: style.color }} />
        <Text className="text-lg font-extrabold text-theme-text">{t(style.headline)}</Text>
      </View>
      <Text className="text-sm text-theme-muted mt-0.5 leading-snug">{advice}</Text>

      <View className="flex-row gap-2 mt-3">
        {view.tiles.map((tile) => (
          <MetricTile key={tile.label} {...tile} color={theme.tint} />
        ))}
      </View>

      {isLow && !isRestDay && (
        <TouchableOpacity
          onPress={onAskAdjust}
          activeOpacity={0.8}
          accessibilityRole="button"
          className="flex-row items-center justify-center gap-1.5 mt-3 py-2.5 rounded-button bg-theme-accent/15"
        >
          <Ionicons name="chatbubble-ellipses-outline" size={15} color={theme.tint} />
          <Text className="text-sm font-bold text-theme-accent">{t('home.askAdjust')}</Text>
        </TouchableOpacity>
      )}
    </Card>
  );
}
