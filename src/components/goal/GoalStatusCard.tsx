import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Polygon, Polyline, Stop, Text as SvgText } from 'react-native-svg';

import { Card } from '../ui/Card';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '@/hooks/use-theme';
import { GoalStatusKind, RaceStatus, Season, TrendPoint } from '../../types/season';
import { PHASE_COLORS, formatHours, formatRaceTime, phaseLabel } from './seasonFormat';

const STATUS_STYLE: Record<GoalStatusKind, { color: string; icon: any }> = {
  on_track: { color: '#22C55E', icon: 'checkmark-circle' },
  within_reach: { color: '#0EA5E9', icon: 'trending-up' },
  ambitious: { color: '#F59E0B', icon: 'flash' },
  building: { color: '#8B5CF6', icon: 'construct' },
};

/** The estimate over time against the target (dashed). Lower is faster. */
function TrendChart({ points, color }: { points: TrendPoint[]; color: string }) {
  const theme = useTheme();
  const [w, setW] = useState(0);
  const h = 48;
  const values = points.map((p) => p.value);
  const target = points[points.length - 1]?.target ?? null;
  const all = target ? [...values, target] : values;
  const min = Math.min(...all);
  const span = Math.max(1, Math.max(...all) - min);
  const y = (v: number) => 6 + ((v - min) / span) * (h - 12);
  // The target time sits at the start of its dotted line ("22:00 - - -"); the chart
  // starts right of it, so the trend never runs underneath the label.
  const targetLabel = target !== null ? formatRaceTime(target) : '';
  const labelW = targetLabel ? targetLabel.length * 6 + 6 : 0;
  const x = (i: number) => (points.length === 1 ? labelW + (w - labelW) / 2 : labelW + (i / (points.length - 1)) * (w - labelW - 8) + 4);
  const lineStr = points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ');
  const areaStr = `${x(0)},${h} ${lineStr} ${x(points.length - 1)},${h}`;
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height: h }}>
      {w > 0 && (
        <Svg width={w} height={h}>
          <Defs>
            <LinearGradient id="goalTrendGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={color} stopOpacity={0.18} />
              <Stop offset="1" stopColor={color} stopOpacity={0.0} />
            </LinearGradient>
          </Defs>
          {target !== null && (
            <>
              <SvgText x={0} y={y(target) + 3.5} fontSize={10} fontWeight="600" fill={theme.textSecondary}>
                {targetLabel}
              </SvgText>
              <Line x1={labelW} x2={w} y1={y(target)} y2={y(target)} stroke={theme.textSecondary} strokeDasharray="3 3" strokeWidth={1} strokeOpacity={0.5} />
            </>
          )}
          {points.length > 1 && <Polygon points={areaStr} fill="url(#goalTrendGrad)" />}
          <Polyline points={lineStr} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          <Circle cx={x(points.length - 1)} cy={y(values[values.length - 1])} r={3} fill={color} />
        </Svg>
      )}
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1">
      <Text className="text-[11px] font-semibold text-theme-muted">{label}</Text>
      <Text className="text-xl font-bold text-theme-text font-rajdhani tabular-nums">{value}</Text>
    </View>
  );
}

/**
 * The race and how the goal is going, in one card: headline, a few numbers, and
 * one short line per limit the athlete's schedule puts on the plan.
 */
export function GoalStatusCard({ status, season }: { status: RaceStatus | null; season: Season }) {
  const { t } = useLanguage();
  const theme = useTheme();
  const current = season.currentWeek;
  const style = STATUS_STYLE[status?.status || 'building'];

  const dateLabel = new Date(season.raceDate + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const meta =
    season.daysToRace === 0
      ? t('goal.raceIsToday')
      : t('goal.headerMeta', { event: t(`goal.event_${season.eventType.replace('.', '_')}`), days: season.daysToRace, date: dateLabel });

  const hasTime = Boolean(status?.estimateSec && status?.targetSec);
  const headline = !status
    ? null
    : hasTime
    ? t(`goal.status_${status.status}`, { target: formatRaceTime(status.targetSec) })
    : t('goal.status_building');

  const unit = season.unit;
  const cap = season.flags?.capVolume;
  const notes: { icon: any; text: string }[] = [];
  if (status?.timeLimited && cap) {
    notes.push({ icon: 'heart-outline', text: t('goal.note_timeLimited', { cap: unit === 'km' ? `${Math.round(cap)} km` : `${formatHours(cap)} h` }) });
  }
  if (status?.shortBuild) notes.push({ icon: 'time-outline', text: t('goal.note_shortBuild') });
  if (season.flags?.estimatedStart) notes.push({ icon: 'information-circle-outline', text: t('goal.note_estimatedStart') });

  return (
    <Card>
      {/* Race */}
      <View className="flex-row items-center gap-2">
        <Ionicons name="flag" size={16} color={PHASE_COLORS.race} />
        <Text className="text-base font-bold text-theme-text flex-1" numberOfLines={1}>
          {season.raceName}
        </Text>
        {current && (
          <View className="px-2 py-0.5 rounded-full" style={{ backgroundColor: `${PHASE_COLORS[current.phase]}22` }}>
            <Text className="text-[10px] font-bold uppercase tracking-wider" style={{ color: PHASE_COLORS[current.phase] }}>
              {current.isRecovery ? t('goal.recoveryShort') : phaseLabel(t, current.phase)}
            </Text>
          </View>
        )}
      </View>
      <Text className="text-xs text-theme-muted mt-0.5">{meta}</Text>

      {status && (
        <View className="mt-3 pt-3 border-t border-theme-border/60">
          <View className="flex-row items-center gap-2">
            <Ionicons name={style.icon} size={17} color={style.color} />
            <Text className="text-sm font-bold text-theme-text flex-1">{headline}</Text>
          </View>

          {(status.estimateSec || status.targetSec || status.consistency) && (
            <View className="flex-row mt-2 bg-theme-inset rounded-inset p-3">
              {status.estimateSec ? <Stat label={t('goal.estimate')} value={formatRaceTime(status.estimateSec)} /> : null}
              {status.targetSec ? <Stat label={t('goal.target')} value={formatRaceTime(status.targetSec)} /> : null}
              {status.consistency && status.consistency.weeks > 0 ? (
                <Stat label={t('goal.weeksOnTarget')} value={`${status.consistency.weeksOnTarget}/${status.consistency.weeks}`} />
              ) : null}
            </View>
          )}

          {/* Only a real history is worth a line: with a day or two of data it is flat and reads like a full progress bar. */}
          {status.trend.length >= 3 &&
            (new Date(status.trend[status.trend.length - 1].date).getTime() - new Date(status.trend[0].date).getTime()) / 86400000 >= 14 && (
            <View className="mt-2">
              <TrendChart points={status.trend} color={style.color} />
              <View className="flex-row justify-between mt-0.5">
                <Text className="text-[10px] text-theme-muted">
                  {t('goal.trendStart', {
                    weeks: Math.round((new Date(status.trend[status.trend.length - 1].date).getTime() - new Date(status.trend[0].date).getTime()) / (7 * 86400000)),
                    time: formatRaceTime(status.trend[0].value),
                  })}
                </Text>
                <Text className="text-[10px] text-theme-muted">{t('goal.trendNow')}</Text>
              </View>
            </View>
          )}
        </View>
      )}

      {notes.length > 0 && (
        <View className="mt-3 gap-y-1.5">
          {notes.map((n, i) => (
            <View key={i} className="flex-row items-center gap-1.5">
              <Ionicons name={n.icon} size={13} color={theme.tint} />
              <Text className="flex-1 text-xs text-theme-muted">{n.text}</Text>
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}
