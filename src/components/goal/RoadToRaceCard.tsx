import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, Line, Rect } from 'react-native-svg';

import { Card } from '../ui/Card';
import { BottomSheetModal } from '../ui/BottomSheetModal';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '@/hooks/use-theme';
import { Season, SeasonWeek } from '../../types/season';
import { PHASE_COLORS, formatLongSession, formatVolume, phaseLabel } from './seasonFormat';

const CHART_HEIGHT = 120;
const LABEL_SPACE = 16;

/**
 * Week by week to race day: one bar per week, coloured by phase, recovery weeks
 * lighter, done weeks filled with what was actually trained. Tap a week for its
 * targets.
 */
export function RoadToRaceCard({ season }: { season: Season }) {
  const { t } = useLanguage();
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<SeasonWeek | null>(null);

  const weeks = season.weeks;
  const n = weeks.length;
  const max = Math.max(1, ...weeks.map((w) => Math.max(w.volume, w.actualVolume || 0)));
  const gap = n > 30 ? 1.5 : 3;
  const barW = width > 0 ? Math.max(3, (width - gap * (n - 1)) / n) : 0;
  const current = season.currentWeek;
  const phases = (['base', 'build', 'peak', 'taper', 'race'] as const).filter((p) => weeks.some((w) => w.phase === p));

  return (
    <Card>
      <View className="flex-row items-center justify-between mb-1">
        <Text className="text-xs font-bold uppercase tracking-wider text-theme-muted">{t('goal.roadTitle')}</Text>
        {current && (
          <Text className="text-xs font-semibold text-theme-muted">
            {t('goal.weekOf', { n: current.index, total: current.total })}
          </Text>
        )}
      </View>
      {current && (
        <Text className="text-sm text-theme-text mb-3">
          <Text className="font-bold">{t('goal.thisWeek')} </Text>
          {[formatVolume(current.volume, current.unit), ...current.longSessions.filter((l) => l.value > 0).map((l) => formatLongSession(t, l))].join(' · ')}
        </Text>
      )}

      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height: CHART_HEIGHT + LABEL_SPACE }}>
        {width > 0 && (
          <Svg width={width} height={CHART_HEIGHT + LABEL_SPACE}>
            <Line x1={0} y1={CHART_HEIGHT} x2={width} y2={CHART_HEIGHT} stroke={theme.textSecondary} strokeOpacity={0.25} strokeWidth={1} />
            {weeks.map((w, i) => {
              const x = i * (barW + gap);
              const color = PHASE_COLORS[w.phase];
              const h = (w.volume / max) * (CHART_HEIGHT - 10);
              const actualH = w.actualVolume ? (Math.min(w.actualVolume, max) / max) * (CHART_HEIGHT - 10) : 0;
              const planned = (
                <Rect
                  key={`p${i}`}
                  x={x}
                  y={CHART_HEIGHT - h}
                  width={barW}
                  height={Math.max(2, h)}
                  rx={Math.min(3, barW / 2)}
                  fill={color}
                  opacity={w.isPast ? 0.25 : w.isRecovery ? 0.45 : 0.9}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setSelected(w);
                  }}
                />
              );
              return (
                <React.Fragment key={w.weekStart}>
                  {planned}
                  {(w.isPast || w.isCurrent) && actualH > 0 && (
                    <Rect x={x + barW * 0.2} y={CHART_HEIGHT - actualH} width={barW * 0.6} height={actualH} rx={1} fill={color} />
                  )}
                  {w.isCheckpoint && <Circle cx={x + barW / 2} cy={CHART_HEIGHT - h - 6} r={2.5} fill={theme.text} />}
                  {w.isCurrent && (
                    <Rect x={x - 1} y={2} width={barW + 2} height={CHART_HEIGHT - 2} rx={3} fill="none" stroke={theme.tint} strokeWidth={1.5} strokeDasharray="3 2" />
                  )}
                </React.Fragment>
              );
            })}
          </Svg>
        )}
        {width > 0 && (
          <>
            <Text style={{ position: 'absolute', left: 0, top: CHART_HEIGHT + 2 }} className="text-[10px] text-theme-muted">
              {t('goal.weekShort', { n: weeks[0]?.index ?? 1 })}
            </Text>
            <View style={{ position: 'absolute', right: 0, top: CHART_HEIGHT + 2 }} className="flex-row items-center gap-0.5">
              <Ionicons name="flag" size={10} color={PHASE_COLORS.race} />
              <Text className="text-[10px] font-bold" style={{ color: PHASE_COLORS.race }}>
                {t('goal.raceDay')}
              </Text>
            </View>
          </>
        )}
      </View>

      {/* Legend */}
      <View className="flex-row flex-wrap gap-x-3 gap-y-1.5 mt-2">
        {phases.map((p) => (
          <View key={p} className="flex-row items-center gap-1">
            <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: PHASE_COLORS[p] }} />
            <Text className="text-[11px] text-theme-muted">{phaseLabel(t, p)}</Text>
          </View>
        ))}
        <View className="flex-row items-center gap-1">
          <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: PHASE_COLORS.build, opacity: 0.45 }} />
          <Text className="text-[11px] text-theme-muted">{t('goal.recoveryWeek')}</Text>
        </View>
        <View className="flex-row items-center gap-1">
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: theme.text }} />
          <Text className="text-[11px] text-theme-muted">{t('goal.checkpoint')}</Text>
        </View>
      </View>

      <BottomSheetModal visible={Boolean(selected)} onClose={() => setSelected(null)} showHandle>
        {selected && <WeekDetail week={selected} />}
      </BottomSheetModal>
    </Card>
  );
}

function WeekDetail({ week }: { week: SeasonWeek }) {
  const { t } = useLanguage();
  const color = PHASE_COLORS[week.phase];
  const explain = week.phase === 'race' ? 'goal.explain_race' : week.isRecovery ? 'goal.explain_recovery' : `goal.explain_${week.phase}`;
  return (
    <View className="pb-8 gap-y-3">
      <View className="flex-row items-center gap-2">
        <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: color }} />
        <Text className="text-lg font-extrabold text-theme-text">
          {t('goal.weekOf', { n: week.index, total: week.total })} · {phaseLabel(t, week.phase)}
        </Text>
      </View>
      {week.isRecovery && (
        <View className="self-start px-2 py-0.5 rounded-full bg-theme-accent/15">
          <Text className="text-[11px] font-bold text-theme-accent">{t('goal.recoveryWeek')}</Text>
        </View>
      )}
      <Text className="text-sm text-theme-muted leading-relaxed">{t(explain)}</Text>

      <View className="bg-theme-inset rounded-inset p-3 gap-y-1.5">
        <Text className="text-sm text-theme-text">
          <Text className="font-bold">{t('goal.target')}: </Text>
          {formatVolume(week.volume, week.unit)}
        </Text>
        {week.longSessions
          .filter((l) => l.value > 0)
          .map((l, i) => (
            <Text key={i} className="text-sm text-theme-text">
              • {formatLongSession(t, l)}
            </Text>
          ))}
        {week.actualVolume !== null && (week.isPast || week.isCurrent) && (
          <Text className="text-sm text-theme-text">
            <Text className="font-bold">{week.isCurrent ? t('goal.soFar') : t('goal.done')}: </Text>
            {formatVolume(week.actualVolume, week.unit)}
          </Text>
        )}
      </View>
      {week.isCheckpoint && (
        <View className="flex-row items-start gap-2">
          <Ionicons name="stopwatch-outline" size={16} color={color} />
          <Text className="flex-1 text-sm text-theme-muted leading-relaxed">{t('goal.checkpointExplain')}</Text>
        </View>
      )}
    </View>
  );
}
