import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  GestureResponderEvent,
} from 'react-native';
import Svg, {
  Path,
  Line,
  Circle,
  Rect,
} from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { Card } from '../ui/Card';
import { useTheme } from '@/hooks/use-theme';
import { useLanguage } from '../../context/LanguageContext';
import { getLocaleTag } from '../../locales/i18n';
import { Activity } from '../../types/activity';
import { normalizeSportType } from '../../utils/disciplineConfig';
import { PMCDayPoint } from '../../domain/pmc';

export type Timeframe = '6W' | '3M' | '1Y';

interface FitnessTrendsChartProps {
  history: PMCDayPoint[];
  activities: Activity[];
}

const TIMEFRAME_DAYS: Record<Timeframe, number> = {
  '6W': 42,
  '3M': 90,
  '1Y': 365,
};

const SPORT_COLORS: Record<string, string> = {
  RUN: '#F97316',
  BIKE: '#0EA5E9',
  SWIM: '#14B8A6',
  STRENGTH: '#F59E0B',
  OTHER: '#8B5CF6',
};

export const FitnessTrendsChart: React.FC<FitnessTrendsChartProps> = ({
  history = [],
  activities = [],
}) => {
  const theme = useTheme();
  const { t, language } = useLanguage();
  const { width: windowWidth } = useWindowDimensions();

  // "2026-10-05" -> "Mon 5 Oct" in the athlete's language
  const formatPointDate = (dateStr?: string) => {
    if (!dateStr) return '';
    const d = new Date(`${dateStr.substring(0, 10)}T12:00:00`);
    if (isNaN(d.getTime())) return dateStr;
    const locale = { en: 'en-GB', nl: 'nl-NL', de: 'de-DE', es: 'es-ES', fr: 'fr-FR' }[language as string] || 'en-GB';
    return d.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' });
  };

  const [timeframe, setTimeframe] = useState<Timeframe>('6W');
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [measuredWidth, setMeasuredWidth] = useState<number>(0);

  // Dynamic measured chart width with safe fallback (accounting for 40px scrollview padding + 32px card padding)
  const chartWidth = measuredWidth > 0 ? measuredWidth : Math.max(260, windowWidth - 72);
  const chartHeight = 180;
  const paddingBottom = 20;
  const paddingTop = 16;
  const horizontalPadding = 12;
  const plotWidth = Math.max(10, chartWidth - horizontalPadding * 2);
  const plotHeight = chartHeight - paddingTop - paddingBottom;

  // Filter history to selected timeframe
  const filteredHistory = useMemo(() => {
    const days = TIMEFRAME_DAYS[timeframe];
    if (history.length <= days) return history;
    return history.slice(-days);
  }, [history, timeframe]);

  // Compute min and max across CTL, ATL, and TSB
  const { minVal, maxVal, ctlPath, atlPath, tsbPath, zeroY, getX } = useMemo(() => {
    const calcGetX = (idx: number) => {
      if (filteredHistory.length <= 1) return chartWidth / 2;
      return horizontalPadding + (idx / (filteredHistory.length - 1)) * plotWidth;
    };

    if (filteredHistory.length === 0) {
      return {
        minVal: 0,
        maxVal: 100,
        ctlPath: '',
        atlPath: '',
        tsbPath: '',
        zeroY: chartHeight / 2,
        getX: calcGetX,
      };
    }

    let min = 0;
    let max = 10;

    filteredHistory.forEach((pt) => {
      min = Math.min(min, pt.ctl, pt.atl, pt.tsb);
      max = Math.max(max, pt.ctl, pt.atl, pt.tsb);
    });

    // Add padding to range
    min = Math.floor(min - 5);
    max = Math.ceil(max + 10);
    const range = Math.max(1, max - min);

    const getY = (val: number) => {
      const normalized = (val - min) / range;
      return paddingTop + plotHeight - normalized * plotHeight;
    };

    let ctlP = '';
    let atlP = '';
    let tsbP = '';

    filteredHistory.forEach((pt, idx) => {
      const x = calcGetX(idx);
      const ctlY = getY(pt.ctl);
      const atlY = getY(pt.atl);
      const tsbY = getY(pt.tsb);

      if (idx === 0) {
        ctlP = `M ${x.toFixed(1)} ${ctlY.toFixed(1)}`;
        atlP = `M ${x.toFixed(1)} ${atlY.toFixed(1)}`;
        tsbP = `M ${x.toFixed(1)} ${tsbY.toFixed(1)}`;
      } else {
        ctlP += ` L ${x.toFixed(1)} ${ctlY.toFixed(1)}`;
        atlP += ` L ${x.toFixed(1)} ${atlY.toFixed(1)}`;
        tsbP += ` L ${x.toFixed(1)} ${tsbY.toFixed(1)}`;
      }
    });

    const zY = getY(0);

    return {
      minVal: min,
      maxVal: max,
      ctlPath: ctlP,
      atlPath: atlP,
      tsbPath: tsbP,
      zeroY: zY,
      getX: calcGetX,
    };
  }, [filteredHistory, chartWidth, chartHeight, plotHeight, paddingTop, plotWidth, horizontalPadding]);

  // Active point for tooltip
  const activePoint = useMemo(() => {
    if (filteredHistory.length === 0) return null;
    if (selectedIndex !== null && filteredHistory[selectedIndex]) {
      return { point: filteredHistory[selectedIndex], index: selectedIndex };
    }
    return { point: filteredHistory[filteredHistory.length - 1], index: filteredHistory.length - 1 };
  }, [filteredHistory, selectedIndex]);

  // Touch handler to scrub chart
  const handleTouch = (event: GestureResponderEvent) => {
    const touchX = event.nativeEvent.locationX;
    if (filteredHistory.length <= 1) return;
    const progress = Math.max(0, Math.min(1, (touchX - horizontalPadding) / plotWidth));
    const idx = Math.round(progress * (filteredHistory.length - 1));
    if (idx !== selectedIndex) {
      Haptics.selectionAsync();
      setSelectedIndex(idx);
    }
  };

  // -------------------------------------------------------------
  // WEEKLY HOURS BY SPORT
  // -------------------------------------------------------------
  const weeklySportData = useMemo(() => {
    const weeksCount = timeframe === '1Y' ? 12 : timeframe === '3M' ? 8 : 6;
    const weeks: Array<{
      weekLabel: string;
      sports: Record<string, number>; // hours
      totalHours: number;
    }> = [];

    const now = new Date();
    // Align to Monday of current week
    const currentMonday = new Date(now);
    const dayOfWeek = currentMonday.getDay();
    const diffToMon = (dayOfWeek + 6) % 7;
    currentMonday.setDate(currentMonday.getDate() - diffToMon);
    currentMonday.setHours(0, 0, 0, 0);

    for (let w = weeksCount - 1; w >= 0; w--) {
      const mon = new Date(currentMonday);
      mon.setDate(mon.getDate() - w * 7);
      const sun = new Date(mon);
      sun.setDate(sun.getDate() + 6);
      sun.setHours(23, 59, 59, 999);

      const sportHours: Record<string, number> = {
        RUN: 0,
        BIKE: 0,
        SWIM: 0,
        STRENGTH: 0,
        OTHER: 0,
      };

      activities.forEach((act) => {
        const rawDate = act.start_date || (act as any).date;
        if (!rawDate) return;
        const actDate = new Date(rawDate);
        if (actDate >= mon && actDate <= sun) {
          const rawType = act.sport_type || act.type || 'OTHER';
          const norm = normalizeSportType(String(rawType));
          const targetKey = ['RUN', 'BIKE', 'SWIM', 'STRENGTH'].includes(norm) ? norm : 'OTHER';
          const durationMins =
            typeof act.moving_time_min === 'number'
              ? act.moving_time_min
              : typeof act.moving_time === 'number'
              ? act.moving_time / 60
              : 0;
          sportHours[targetKey] += durationMins / 60;
        }
      });

      const total = Object.values(sportHours).reduce((a, b) => a + b, 0);
      const label = `${mon.getDate()} ${mon.toLocaleString(getLocaleTag(language), { month: 'short' })}`;

      weeks.push({
        weekLabel: label,
        sports: sportHours,
        totalHours: Math.round(total * 10) / 10,
      });
    }

    return weeks;
  }, [activities, timeframe]);

  const maxWeeklyHours = useMemo(() => {
    const maxH = Math.max(...weeklySportData.map((w) => w.totalHours), 5);
    return Math.ceil(maxH);
  }, [weeklySportData]);

  const avgWeeklyHours = useMemo(() => {
    if (weeklySportData.length === 0) return 0;
    const sum = weeklySportData.reduce((acc, w) => acc + w.totalHours, 0);
    return Math.round((sum / weeklySportData.length) * 10) / 10;
  }, [weeklySportData]);

  return (
    <Card className="p-4 bg-theme-card border border-theme-border gap-y-4">
      {/* 1. TIMEFRAME SELECTOR HEADER */}
      <View className="flex-row items-center justify-between">
        <View className="flex-1 mr-2">
          <Text className="text-base font-bold text-theme-text font-jakarta" numberOfLines={1}>
            {t('progress.trendsTitle', 'Fitness, fatigue & form')}
          </Text>
          <Text className="text-xs text-theme-muted mt-0.5" numberOfLines={1}>
            {t('progress.trendsSubtitle', 'How your training builds up over time')}
          </Text>
        </View>

        <View className="flex-row bg-theme-inset p-1 rounded-xl">
          {(['6W', '3M', '1Y'] as Timeframe[]).map((tf) => {
            const active = timeframe === tf;
            return (
              <TouchableOpacity
                key={tf}
                onPress={() => {
                  Haptics.selectionAsync();
                  setTimeframe(tf);
                  setSelectedIndex(null);
                }}
                className={`px-3 py-1.5 rounded-lg ${
                  active ? 'bg-theme-accent' : 'bg-transparent'
                }`}
              >
                <Text
                  className={`text-xs font-extrabold ${
                    active ? 'text-white' : 'text-theme-muted'
                  }`}
                >
                  {tf}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* 2. ACTIVE VALUES TELEMETRY BADGES */}
      {activePoint && (
        <View className="flex-row items-center justify-between p-3 bg-theme-bg/80 rounded-xl border border-theme-border/60">
          <View>
            <Text className="text-[10px] font-bold text-theme-muted uppercase tracking-wider">
              {formatPointDate(activePoint.point.date)}
            </Text>
            <Text className="text-xs font-semibold text-theme-text mt-0.5">
              {t('progress.trendsLoad', 'Load')}: {Math.round(activePoint.point.rooka || 0)} pts
            </Text>
          </View>

          <View className="flex-row items-center gap-3">
            <View className="items-center">
              <View className="flex-row items-center gap-1">
                <View className="w-2 h-2 rounded-full bg-[#10B981]" />
                <Text className="text-xs font-bold text-[#10B981]">
                  {Math.round(activePoint.point.ctl * 10) / 10}
                </Text>
              </View>
              <Text className="text-[10px] text-theme-muted">{t('dashboard.fitness', 'Fitness')}</Text>
            </View>

            <View className="items-center">
              <View className="flex-row items-center gap-1">
                <View className="w-2 h-2 rounded-full bg-[#F59E0B]" />
                <Text className="text-xs font-bold text-[#F59E0B]">
                  {Math.round(activePoint.point.atl * 10) / 10}
                </Text>
              </View>
              <Text className="text-[10px] text-theme-muted">{t('dashboard.fatigue', 'Fatigue')}</Text>
            </View>

            <View className="items-center">
              <View className="flex-row items-center gap-1">
                <View className="w-2 h-2 rounded-full bg-[#0EA5E9]" />
                <Text className="text-xs font-bold text-[#0EA5E9]">
                  {activePoint.point.tsb > 0 ? `+${Math.round(activePoint.point.tsb * 10) / 10}` : Math.round(activePoint.point.tsb * 10) / 10}
                </Text>
              </View>
              <Text className="text-[10px] text-theme-muted">{t('dashboard.form', 'Form')}</Text>
            </View>
          </View>
        </View>
      )}

      {/* 3. MULTI-LINE SVG CHART WITH EXACT CONTAINER MEASUREMENT */}
      <View
        onLayout={(e) => {
          const w = e.nativeEvent.layout.width;
          if (w > 0 && Math.abs(w - measuredWidth) > 1) {
            setMeasuredWidth(w);
          }
        }}
        className="w-full relative overflow-hidden"
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={handleTouch}
        onResponderMove={handleTouch}
      >
        <Svg width={chartWidth} height={chartHeight} style={{ overflow: 'hidden' }}>
          {/* Zero baseline for Form (TSB) */}
          <Line
            x1={horizontalPadding}
            y1={zeroY}
            x2={chartWidth - horizontalPadding}
            y2={zeroY}
            stroke="#94A3B8"
            strokeWidth="1"
            strokeDasharray="4 4"
            opacity="0.45"
          />

          {/* Curves */}
          <Path
            d={ctlPath}
            fill="none"
            stroke="#10B981"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <Path
            d={atlPath}
            fill="none"
            stroke="#F59E0B"
            strokeWidth="2"
            strokeLinecap="round"
            opacity="0.85"
          />
          <Path
            d={tsbPath}
            fill="none"
            stroke="#0EA5E9"
            strokeWidth="2"
            strokeLinecap="round"
            opacity="0.9"
          />

          {/* Scrubber vertical line */}
          {activePoint && filteredHistory.length > 1 && (
            <Line
              x1={getX(activePoint.index)}
              y1={paddingTop}
              x2={getX(activePoint.index)}
              y2={chartHeight - paddingBottom}
              stroke="#94A3B8"
              strokeWidth="1.5"
              strokeDasharray="3,3"
            />
          )}
        </Svg>
      </View>

      {/* 4. WEEKLY TRAINING HOURS BY SPORT BREAKDOWN */}
      <View className="pt-3 border-t border-theme-border/40">
        <View className="mb-3 gap-y-2">
          {/* Section Header Row */}
          <View className="flex-row items-center justify-between">
            <Text className="text-sm font-bold text-theme-text font-jakarta">
              {t('trendsExtra.weeklyVolume')}
            </Text>
            <Text className="text-xs font-semibold text-theme-accent">
              {t('trendsExtra.avgPerWeek', { hours: avgWeeklyHours })}
            </Text>
          </View>

          {/* Wrapped Legend Chips Row (Never overflows screen width) */}
          <View className="flex-row items-center gap-x-3 gap-y-1.5 flex-wrap">
            {Object.entries(SPORT_COLORS).map(([sport, color]) => (
              <View key={sport} className="flex-row items-center gap-1.5">
                <View style={{ backgroundColor: color }} className="w-2 h-2 rounded-full" />
                <Text className="text-[11px] font-bold text-theme-muted">{sport}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Stacked Bars Container */}
        <View className="flex-row items-end justify-between h-36 px-1 pt-3 pb-2">
          {weeklySportData.map((week, wIdx) => {
            const barMaxHeight = 85;
            const totalH = week.totalHours;
            const barHeight = Math.max(4, (totalH / maxWeeklyHours) * barMaxHeight);

            return (
              <View key={wIdx} className="flex-1 items-center justify-end mx-1">
                {/* Total label above bar */}
                <Text className="text-[10px] font-bold text-theme-muted mb-1" numberOfLines={1}>
                  {totalH > 0 ? `${totalH}h` : '0'}
                </Text>

                {/* Stacked Bar segments */}
                <View
                  style={{ height: barHeight }}
                  className="w-full max-w-[28px] rounded-t-md overflow-hidden bg-theme-inset flex-col-reverse"
                >
                  {Object.entries(week.sports).map(([sportKey, hours]) => {
                    if (hours <= 0 || totalH <= 0) return null;
                    const segmentPct = (hours / totalH) * 100;
                    return (
                      <View
                        key={sportKey}
                        style={{
                          height: `${segmentPct}%`,
                          backgroundColor: SPORT_COLORS[sportKey] || '#8E8E93',
                        }}
                        className="w-full"
                      />
                    );
                  })}
                </View>

                {/* Week Label */}
                <Text
                  className="text-[9px] text-theme-muted mt-2 font-medium"
                  numberOfLines={1}
                >
                  {week.weekLabel.split(' ')[0]}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    </Card>
  );
};

export default FitnessTrendsChart;
