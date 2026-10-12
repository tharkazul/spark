import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';

import { Card } from '../ui/Card';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '@/hooks/use-theme';
import { GoalStatusKind, RaceStatus, Season, TrendPoint } from '../../types/season';
import { formatGap, formatHours, formatRaceTime } from './seasonFormat';

const STATUS_STYLE: Record<GoalStatusKind, { color: string; icon: any }> = {
  on_track: { color: '#22C55E', icon: 'checkmark-circle' },
  within_reach: { color: '#0EA5E9', icon: 'trending-up' },
  ambitious: { color: '#F59E0B', icon: 'flash' },
  building: { color: '#8B5CF6', icon: 'construct' },
};

/** The estimate over time against the target (a dashed line). Lower is faster. */
function TrendChart({ points, color }: { points: TrendPoint[]; color: string }) {
  const theme = useTheme();
  const [w, setW] = useState(0);
  const h = 56;
  const values = points.map((p) => p.value);
  const target = points[points.length - 1]?.target ?? null;
  const all = target ? [...values, target] : values;
  const min = Math.min(...all);
  const max = Math.max(...all);
  const span = Math.max(1, max - min);
  // Faster (lower) times plot higher up.
  const y = (v: number) => 6 + ((v - min) / span) * (h - 12);
  const x = (i: number) => (points.length === 1 ? w / 2 : (i / (points.length - 1)) * (w - 8) + 4);
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height: h }}>
      {w > 0 && (
        <Svg width={w} height={h}>
          {target !== null && (
            <Line x1={0} x2={w} y1={y(target)} y2={y(target)} stroke={theme.textSecondary} strokeDasharray="4 3" strokeWidth={1} strokeOpacity={0.6} />
          )}
          <Polyline points={points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ')} fill="none" stroke={color} strokeWidth={2} />
          <Circle cx={x(points.length - 1)} cy={y(values[values.length - 1])} r={3.5} fill={color} />
        </Svg>
      )}
    </View>
  );
}

export function GoalStatusCard({ status, season }: { status: RaceStatus; season: Season | null }) {
  const { t } = useLanguage();
  const style = STATUS_STYLE[status.status];
  const hasTime = Boolean(status.estimateSec && status.targetSec);

  const headline = hasTime
    ? t(`goal.status_${status.status}`, { target: formatRaceTime(status.targetSec) })
    : status.estimateSec
    ? t('goal.estimateOnly', { estimate: formatRaceTime(status.estimateSec) })
    : t('goal.status_building');

  let body: string;
  if (hasTime && status.status === 'on_track') body = t('goal.body_on_track', { estimate: formatRaceTime(status.estimateSec) });
  else if (hasTime && status.status === 'within_reach') body = t('goal.body_within_reach', { estimate: formatRaceTime(status.estimateSec), gap: formatGap(status.gapSec || 0) });
  else if (hasTime) body = t('goal.body_ambitious', { estimate: formatRaceTime(status.estimateSec) });
  else if (status.estimateSec) body = t('goal.body_estimate_no_target');
  else if (season?.unit === 'km') body = t('goal.body_need_runs');
  else body = t('goal.body_building');

  const unit = season?.unit;
  const cap = season?.flags?.capVolume;

  return (
    <Card>
      <Text className="text-xs font-bold uppercase tracking-wider text-theme-muted mb-2">{t('goal.statusTitle')}</Text>
      <View className="flex-row items-center gap-2">
        <Ionicons name={style.icon} size={20} color={style.color} />
        <Text className="text-lg font-extrabold text-theme-text flex-1">{headline}</Text>
      </View>
      <Text className="text-sm text-theme-muted mt-1 leading-relaxed">{body}</Text>
      {status.basis && <Text className="text-[11px] text-theme-muted mt-1">{t('goal.basis', { km: status.basis.distanceKm, min: status.basis.minutes })}</Text>}

      {status.trend.length >= 2 && (
        <View className="mt-3">
          <TrendChart points={status.trend} color={style.color} />
          <Text className="text-[11px] text-theme-muted mt-1">{t('goal.trendCaption')}</Text>
        </View>
      )}

      {status.readiness.length > 0 && (
        <View className="mt-3 gap-y-2">
          {status.readiness.map((r) => {
            const pct = r.peak > 0 ? Math.min(1, r.done / r.peak) : 0;
            const fmt = (v: number) => (r.unit === 'km' ? `${v} km` : `${formatHours(v)} h`);
            const label = r.sport === 'Run' ? t('goal.longestRun') : r.sport === 'Bike' ? t('goal.longestRide') : t('goal.longestSession');
            return (
              <View key={r.sport}>
                <View className="flex-row justify-between">
                  <Text className="text-xs font-semibold text-theme-text">{label}</Text>
                  <Text className="text-xs text-theme-muted">{t('goal.ofPeak', { done: fmt(r.done), peak: fmt(r.peak) })}</Text>
                </View>
                <View className="h-1.5 rounded-full bg-theme-inset mt-1 overflow-hidden">
                  <View style={{ width: `${Math.round(pct * 100)}%`, backgroundColor: style.color }} className="h-full rounded-full" />
                </View>
              </View>
            );
          })}
        </View>
      )}

      {status.consistency && status.consistency.weeks > 0 && (
        <Text className="text-xs text-theme-muted mt-3">
          {t('goal.consistency', { done: status.consistency.weeksOnTarget, total: status.consistency.weeks })}
        </Text>
      )}

      {/* Life first: explain the limits instead of asking for more time. */}
      {(status.timeLimited || status.longLimitedBy.length > 0 || status.shortBuild || season?.flags?.estimatedStart) && (
        <View className="mt-3 pt-3 border-t border-theme-border/60 gap-y-2">
          {status.timeLimited && cap && unit && (
            <Note icon="heart-outline" text={t('goal.note_timeLimited', { cap: unit === 'km' ? `${Math.round(cap)} km` : `${formatHours(cap)} h` })} />
          )}
          {status.longLimitedBy.map((l) => (
            <Note
              key={l.sport}
              icon="calendar-outline"
              text={t('goal.note_longLimited', {
                minutes: l.longestDayMinutes,
                session: l.sport === 'Bike' ? t('goal.sessionRide') : l.sport === 'Run' ? t('goal.sessionRun') : t('goal.sessionAny'),
                cap: l.unit === 'km' ? `${l.cap} km` : `${formatHours(l.cap)} h`,
              })}
            />
          ))}
          {status.shortBuild && <Note icon="time-outline" text={t('goal.note_shortBuild')} />}
          {season?.flags?.estimatedStart && <Note icon="information-circle-outline" text={t('goal.note_estimatedStart')} />}
        </View>
      )}
    </Card>
  );
}

function Note({ icon, text }: { icon: any; text: string }) {
  const theme = useTheme();
  return (
    <View className="flex-row items-start gap-2">
      <Ionicons name={icon} size={15} color={theme.tint} style={{ marginTop: 1 }} />
      <Text className="flex-1 text-xs text-theme-muted leading-relaxed">{text}</Text>
    </View>
  );
}
