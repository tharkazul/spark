import { useFocusEffect } from 'expo-router/react-navigation';
import React, { useCallback, useMemo, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Card } from '../ui/Card';
import { MetricTile, MetricDeltaTone } from '../ui/MetricTile';
import { GarminAttribution, garminHealthLabel } from '../ui/GarminAttribution';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '@/hooks/use-theme';
import {
  AppleHealthDailyBiometrics,
  computeCardiovascularStrain,
  hrvIn,
  latestHrvSource,
  fetchRecentBiometricsFromServer,
  fetchTodayBiometricsFromServer,
  getCachedTodayBiometrics,
} from '../../services/appleHealthService';
import { keepIfSame } from '../../utils/keepIfSame';

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

const toDeltaTone = (good: boolean | null): MetricDeltaTone =>
  good === null ? 'neutral' : good ? 'good' : 'warn';

export function HomeRecoveryCard({ onAskAdjust, isRestDay = false }: HomeRecoveryCardProps) {
  const { t } = useLanguage();
  const theme = useTheme();
  const [today, setToday] = useState<AppleHealthDailyBiometrics | null>(null);
  const [recent, setRecent] = useState<AppleHealthDailyBiometrics[]>([]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      getCachedTodayBiometrics()
        .then((cached) => {
          if (active && cached) setToday((prev) => prev || cached);
        })
        .catch(() => {});

      Promise.all([fetchTodayBiometricsFromServer(), fetchRecentBiometricsFromServer(8)])
        .then(([todayRow, recentRows]) => {
          if (!active) return;
          // Same numbers as last time: keep them, so the screen doesn't redraw on every visit.
          if (todayRow) setToday(keepIfSame<AppleHealthDailyBiometrics | null>(todayRow));
          setRecent(keepIfSame(recentRows || []));
        })
        .catch(() => {});
      return () => {
        active = false;
      };
    }, [])
  );

  const view = useMemo(() => {
    if (!today && recent.length === 0) return null;

    // Merge recent + today by date so partial rows never drop existing measurements.
    const byDate = new Map<string, AppleHealthDailyBiometrics>();
    for (const r of recent) {
      if (r?.date) {
        byDate.set(r.date, { ...r });
      }
    }
    if (today?.date) {
      const existing = byDate.get(today.date) || ({ date: today.date } as AppleHealthDailyBiometrics);
      const merged: AppleHealthDailyBiometrics = { ...existing };
      (Object.keys(today) as (keyof AppleHealthDailyBiometrics)[]).forEach((k) => {
        const val = today[k];
        if (val !== null && val !== undefined && val !== 0) {
          (merged as any)[k] = val;
        }
      });
      byDate.set(today.date, merged);
    }

    // Oldest -> newest, up to last 8 days
    const days = Array.from(byDate.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-8);

    if (days.length === 0) return null;

    const sleepDays = days.filter((d) => typeof d.sleep_minutes === 'number' && d.sleep_minutes > 0);
    // HRV follows one source (Garmin RMSSD or Apple SDNN): the two don't mix in a series.
    const hrvSource = latestHrvSource(days);
    const hrvOn = (d: AppleHealthDailyBiometrics) => (hrvSource ? hrvIn(d, hrvSource) : null);
    const hrvDays = days.filter((d) => hrvOn(d) !== null);
    const rhrDays = days.filter((d) => typeof d.resting_hr === 'number' && d.resting_hr > 0);

    const latestSleep = sleepDays.length > 0 ? sleepDays[sleepDays.length - 1].sleep_minutes! : null;
    const latestHrv = hrvDays.length > 0 ? hrvOn(hrvDays[hrvDays.length - 1]) : null;
    const latestRhr = rhrDays.length > 0 ? rhrDays[rhrDays.length - 1].resting_hr! : null;

    const hasSignal = Boolean(latestSleep || latestHrv || latestRhr);
    if (!hasSignal) return null;

    const effectiveToday: AppleHealthDailyBiometrics = {
      ...(today || days[days.length - 1]),
      sleep_minutes: latestSleep ?? undefined,
      hrv_sdnn: hrvSource === 'apple' ? latestHrv ?? undefined : undefined,
      hrv_rmssd: hrvSource === 'garmin' ? latestHrv ?? undefined : undefined,
      resting_hr: latestRhr ?? undefined,
    };

    const strain = computeCardiovascularStrain(effectiveToday, days);

    const avgSleep = avg(sleepDays.slice(0, -1).map((d) => d.sleep_minutes!));
    const sleepDelta = latestSleep !== null && avgSleep !== null ? Math.round(latestSleep - avgSleep) : null;

    const avgHrv = avg(hrvDays.slice(0, -1).map((d) => hrvOn(d)!));
    const hrvDelta = latestHrv !== null && avgHrv !== null ? Math.round(latestHrv - avgHrv) : null;

    const avgRhr = avg(rhrDays.slice(0, -1).map((d) => d.resting_hr!));
    const rhrDelta = latestRhr !== null && avgRhr !== null ? Math.round(latestRhr - avgRhr) : null;

    const signed = (n: number, unit: string) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${Math.abs(n)}${unit}`;

    const allTiles = [
      {
        label: t('home.metricSleep'),
        hasData: latestSleep !== null,
        value: latestSleep !== null ? formatSleep(latestSleep) : '–',
        unit: undefined,
        delta: sleepDelta !== null ? signed(sleepDelta, 'm') : null,
        deltaTone: toDeltaTone(sleepDelta !== null && Math.abs(sleepDelta) >= 15 ? sleepDelta > 0 : null),
        series: sleepDays.map((d) => d.sleep_minutes! / 60),
        baseline: avgSleep !== null ? avgSleep / 60 : null,
        targetUpper: 8.0,
        targetLower: 6.5,
        targetUpperColor: '#10B981',
        targetLowerColor: '#F43F5E',
      },
      {
        label: t('home.metricHrv'),
        hasData: latestHrv !== null,
        value: latestHrv !== null ? Math.round(latestHrv) : '–',
        unit: latestHrv !== null ? 'ms' : undefined,
        delta: hrvDelta !== null ? signed(hrvDelta, '') : null,
        deltaTone: toDeltaTone(hrvDelta !== null && Math.abs(hrvDelta) >= 3 ? hrvDelta > 0 : null),
        series: hrvDays.map((d) => hrvOn(d)!),
        baseline: avgHrv,
        targetUpper: avgHrv !== null ? Math.round(avgHrv * 1.1) : null,
        targetLower: avgHrv !== null ? Math.round(avgHrv * 0.88) : null,
        targetUpperColor: '#10B981',
        targetLowerColor: '#F43F5E',
      },
      {
        label: t('home.metricRestingHr'),
        hasData: latestRhr !== null,
        value: latestRhr !== null ? Math.round(latestRhr) : '–',
        unit: latestRhr !== null ? 'bpm' : undefined,
        delta: rhrDelta !== null ? signed(rhrDelta, '') : null,
        deltaTone: toDeltaTone(rhrDelta !== null && Math.abs(rhrDelta) >= 2 ? rhrDelta < 0 : null),
        series: rhrDays.map((d) => d.resting_hr!),
        baseline: avgRhr,
        targetUpper: avgRhr !== null ? Math.round(avgRhr + 3) : null,
        targetLower: avgRhr !== null ? Math.max(35, Math.round(avgRhr - 2)) : null,
        targetUpperColor: '#F43F5E',
        targetLowerColor: '#10B981',
      },
    ];

    const populatedTiles = allTiles.filter((tile) => tile.hasData);

    return {
      level: strain.strainLevel,
      tiles: populatedTiles.length > 0 ? populatedTiles : allTiles,
    };
  }, [today, recent, t]);

  // No Apple Health data: the card stays out of the way rather than nagging.
  if (!view) return null;

  const style = LEVEL_STYLE[view.level];
  const isLow = view.level === 'elevated' || view.level === 'high';
  const advice = isRestDay ? t(isLow ? 'home.recoveryRestDayLow' : 'home.recoveryRestDayGood') : t(style.advice);

  return (
    <Card>
      <View className="flex-row items-center justify-between">
        <Text className="text-xs font-bold uppercase tracking-wider text-theme-muted">{t('home.recoveryTitle')}</Text>
        <Text className="text-xs font-medium text-theme-muted">{t('home.recoveryVsAvg')}</Text>
      </View>
      <GarminAttribution label={garminHealthLabel([today, ...recent])} className="mt-0.5" />

      <View className="flex-row items-center gap-2 mt-1.5">
        <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: style.color }} />
        <Text className="text-base font-bold text-theme-text">{t(style.headline)}</Text>
      </View>
      <Text className="text-xs text-theme-muted mt-0.5 leading-snug">{advice}</Text>

      <View className="flex-row gap-2.5 mt-3">
        {view.tiles.map((tile) => (
          <MetricTile
            key={tile.label}
            label={tile.label}
            value={tile.value}
            unit={tile.unit}
            delta={tile.delta}
            deltaTone={tile.deltaTone}
            series={tile.series}
            baseline={tile.baseline}
            targetUpper={tile.targetUpper}
            targetLower={tile.targetLower}
            targetUpperColor={tile.targetUpperColor}
            targetLowerColor={tile.targetLowerColor}
            color={theme.tint}
          />
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

