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
  Defs,
  LinearGradient,
  Stop,
} from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../ui/Card';
import { useLanguage } from '../../context/LanguageContext';
import { getLocaleTag } from '../../locales/i18n';
import { Activity } from '../../types/activity';
import { normalizeSportType } from '../../utils/disciplineConfig';
import { PMCDayPoint } from '../../domain/pmc';
import { GarminAttribution, garminActivityLabel } from '../ui/GarminAttribution';
import { usePagerLock } from '../../context/PagerLockContext';
import { FitnessMetricsInfoModal } from './FitnessMetricsInfoModal';

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

const SPORT_LABELS: Record<string, string> = {
  RUN: 'Run',
  BIKE: 'Bike',
  SWIM: 'Swim',
  STRENGTH: 'Strength',
  OTHER: 'Other',
};

export const FitnessTrendsChart: React.FC<FitnessTrendsChartProps> = ({
  history = [],
  activities = [],
}) => {
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
  const [showInfoModal, setShowInfoModal] = useState<boolean>(false);
  const [measuredWidth, setMeasuredWidth] = useState<number>(0);

  // Dynamic measured chart width with safe fallback
  const chartWidth = measuredWidth > 0 ? measuredWidth : Math.max(260, windowWidth - 72);
  const chartHeight = 168;
  const paddingBottom = 14;
  const paddingTop = 12;
  const horizontalPadding = 8;
  const plotWidth = Math.max(10, chartWidth - horizontalPadding * 2);
  const plotHeight = chartHeight - paddingTop - paddingBottom;

  // Filter history to selected timeframe
  const filteredHistory = useMemo(() => {
    const days = TIMEFRAME_DAYS[timeframe];
    if (history.length <= days) return history;
    return history.slice(-days);
  }, [history, timeframe]);

  // Compute min and max across CTL, ATL, and TSB
  const { ctlPath, ctlAreaPath, atlPath, tsbPath, zeroY, getX, getY } = useMemo(() => {
    const calcGetX = (idx: number) => {
      if (filteredHistory.length <= 1) return chartWidth / 2;
      return horizontalPadding + (idx / (filteredHistory.length - 1)) * plotWidth;
    };

    if (filteredHistory.length === 0) {
      return {
        ctlPath: '',
        ctlAreaPath: '',
        atlPath: '',
        tsbPath: '',
        zeroY: chartHeight / 2,
        getX: calcGetX,
        getY: () => chartHeight / 2,
      };
    }

    let min = 0;
    let max = 10;

    filteredHistory.forEach((pt) => {
      min = Math.min(min, pt.ctl, pt.atl, pt.tsb);
      max = Math.max(max, pt.ctl, pt.atl, pt.tsb);
    });

    min = Math.floor(min - 5);
    max = Math.ceil(max + 10);
    const range = Math.max(1, max - min);

    const calcGetY = (val: number) => {
      const normalized = (val - min) / range;
      return paddingTop + plotHeight - normalized * plotHeight;
    };

    let ctlP = '';
    let atlP = '';
    let tsbP = '';

    filteredHistory.forEach((pt, idx) => {
      const x = calcGetX(idx);
      const ctlY = calcGetY(pt.ctl);
      const atlY = calcGetY(pt.atl);
      const tsbY = calcGetY(pt.tsb);

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

    const firstX = calcGetX(0).toFixed(1);
    const lastX = calcGetX(filteredHistory.length - 1).toFixed(1);
    const bottomY = (chartHeight - paddingBottom).toFixed(1);
    const ctlArea = ctlP ? `${ctlP} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z` : '';

    return {
      ctlPath: ctlP,
      ctlAreaPath: ctlArea,
      atlPath: atlP,
      tsbPath: tsbP,
      zeroY: calcGetY(0),
      getX: calcGetX,
      getY: calcGetY,
    };
  }, [filteredHistory, chartWidth, chartHeight, plotHeight, paddingTop, paddingBottom, plotWidth, horizontalPadding]);

  // Active point for tooltip
  const activePoint = useMemo(() => {
    if (filteredHistory.length === 0) return null;
    if (selectedIndex !== null && filteredHistory[selectedIndex]) {
      return { point: filteredHistory[selectedIndex], index: selectedIndex };
    }
    return { point: filteredHistory[filteredHistory.length - 1], index: filteredHistory.length - 1 };
  }, [filteredHistory, selectedIndex]);

  // Touch handler to scrub chart. While scrubbing, the Progress pager is
  // locked so a horizontal drag doesn't flip to the neighbouring sub-tab.
  const setPagerLocked = usePagerLock();
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
  }, [activities, timeframe, language]);

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
    <Card className="gap-y-3">
      {/* 1. HEADER + TIMEFRAME SELECTOR */}
      <View className="flex-row items-center justify-between">
        <View className="flex-1 mr-2">
          <View className="flex-row items-center gap-1.5">
            <Text className="text-xs font-bold uppercase tracking-wider text-theme-muted" numberOfLines={1}>
              {t('progress.trendsTitle', 'Fitness, fatigue & form')}
            </Text>
            <TouchableOpacity
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowInfoModal(true);
              }}
              accessibilityLabel="Fitness metrics explanation"
            >
              <Ionicons name="information-circle-outline" size={15} color="#94A3B8" />
            </TouchableOpacity>
          </View>
          <GarminAttribution label={garminActivityLabel(activities as any[], TIMEFRAME_DAYS[timeframe])} className="mt-0.5" />
        </View>

        <View className="flex-row bg-theme-inset p-0.5 rounded-lg">
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
                className={`px-2.5 py-1 rounded-md ${
                  active ? 'bg-theme-accent-strong' : 'bg-transparent'
                }`}
              >
                <Text
                  className={`text-[11px] font-bold ${
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

      {/* 2. COMPACT INLINE LEGEND + ACTIVE READOUT */}
      {activePoint && (
        <View className="flex-row items-center justify-between bg-theme-inset rounded-inset px-3 py-2">
          <Text className="text-xs font-semibold text-theme-muted">
            {formatPointDate(activePoint.point.date)}
          </Text>

          <View className="flex-row items-center gap-3.5">
            <View className="flex-row items-center gap-1">
              <View className="w-2 h-2 rounded-full bg-[#10B981]" />
              <Text className="text-[11px] text-theme-muted">{t('dashboard.fitness', 'Fitness')}</Text>
              <Text
                style={{ fontVariant: ['tabular-nums'] }}
                className="text-sm font-bold font-rajdhani text-theme-text ml-0.5"
              >
                {Math.round(activePoint.point.ctl * 10) / 10}
              </Text>
            </View>

            <View className="flex-row items-center gap-1">
              <View className="w-2 h-2 rounded-full bg-[#F59E0B]" />
              <Text className="text-[11px] text-theme-muted">{t('dashboard.fatigue', 'Fatigue')}</Text>
              <Text
                style={{ fontVariant: ['tabular-nums'] }}
                className="text-sm font-bold font-rajdhani text-theme-text ml-0.5"
              >
                {Math.round(activePoint.point.atl * 10) / 10}
              </Text>
            </View>

            <View className="flex-row items-center gap-1">
              <View className="w-2 h-2 rounded-full bg-[#0EA5E9]" />
              <Text className="text-[11px] text-theme-muted">{t('dashboard.form', 'Form')}</Text>
              <Text
                style={{ fontVariant: ['tabular-nums'] }}
                className="text-sm font-bold font-rajdhani text-theme-text ml-0.5"
              >
                {activePoint.point.tsb > 0
                  ? `+${Math.round(activePoint.point.tsb * 10) / 10}`
                  : Math.round(activePoint.point.tsb * 10) / 10}
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* 3. MULTI-LINE SVG CHART */}
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
        onResponderTerminationRequest={() => false}
        onResponderGrant={(e) => {
          setPagerLocked(true);
          handleTouch(e);
        }}
        onResponderMove={handleTouch}
        onResponderRelease={() => setPagerLocked(false)}
        onResponderTerminate={() => setPagerLocked(false)}
      >
        <Svg width={chartWidth} height={chartHeight} style={{ overflow: 'hidden' }}>
          <Defs>
            <LinearGradient id="pmc-ctl-grad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor="#10B981" stopOpacity={0.16} />
              <Stop offset="100%" stopColor="#10B981" stopOpacity={0.0} />
            </LinearGradient>
          </Defs>

          {/* Zero baseline for Form (TSB) */}
          <Line
            x1={horizontalPadding}
            y1={zeroY}
            x2={chartWidth - horizontalPadding}
            y2={zeroY}
            stroke="#94A3B8"
            strokeWidth="1"
            strokeDasharray="3 3"
            opacity="0.4"
          />

          {/* Soft Area Fill under Fitness (CTL) */}
          {ctlAreaPath ? <Path d={ctlAreaPath} fill="url(#pmc-ctl-grad)" /> : null}

          {/* Curves */}
          <Path
            d={ctlPath}
            fill="none"
            stroke="#10B981"
            strokeWidth="2.25"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Path
            d={atlPath}
            fill="none"
            stroke="#F59E0B"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.85"
          />
          <Path
            d={tsbPath}
            fill="none"
            stroke="#0EA5E9"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.9"
          />

          {/* Scrubber vertical line + Active Point Dots */}
          {activePoint && filteredHistory.length > 1 && (
            <>
              {selectedIndex !== null && (
                <Line
                  x1={getX(activePoint.index)}
                  y1={paddingTop}
                  x2={getX(activePoint.index)}
                  y2={chartHeight - paddingBottom}
                  stroke="#94A3B8"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                  opacity="0.6"
                />
              )}
              <Circle
                cx={getX(activePoint.index)}
                cy={getY(activePoint.point.ctl)}
                r={3.5}
                fill="#10B981"
              />
              <Circle
                cx={getX(activePoint.index)}
                cy={getY(activePoint.point.atl)}
                r={3}
                fill="#F59E0B"
              />
              <Circle
                cx={getX(activePoint.index)}
                cy={getY(activePoint.point.tsb)}
                r={3}
                fill="#0EA5E9"
              />
            </>
          )}
        </Svg>
      </View>

      {/* 4. WEEKLY TRAINING HOURS BY SPORT BREAKDOWN */}
      <View className="pt-3 border-t border-theme-border/40">
        <View className="flex-row items-center justify-between mb-2">
          <Text className="text-xs font-bold uppercase tracking-wider text-theme-muted">
            {t('trendsExtra.weeklyVolume')}
          </Text>
          <Text className="text-xs font-semibold text-theme-muted">
            {t('trendsExtra.avgPerWeek', { hours: avgWeeklyHours })}
          </Text>
        </View>

        {/* Clean Title-Case Legend Row */}
        <View className="flex-row items-center gap-x-3.5 gap-y-1 flex-wrap mb-2">
          {Object.entries(SPORT_COLORS).map(([sport, color]) => (
            <View key={sport} className="flex-row items-center gap-1.5">
              <View style={{ backgroundColor: color }} className="w-2 h-2 rounded-full" />
              <Text className="text-[11px] font-medium text-theme-muted">
                {SPORT_LABELS[sport] || sport}
              </Text>
            </View>
          ))}
        </View>

        {/* Stacked Bars Container */}
        <View className="flex-row items-end justify-between h-28 px-1 pt-2 pb-1">
          {weeklySportData.map((week, wIdx) => {
            const barMaxHeight = 76;
            const totalH = week.totalHours;
            const barHeight = Math.max(4, (totalH / maxWeeklyHours) * barMaxHeight);

            return (
              <View key={wIdx} className="flex-1 items-center justify-end mx-1">
                <Text
                  style={{ fontVariant: ['tabular-nums'] }}
                  className="text-[11px] font-bold font-rajdhani text-theme-muted mb-1"
                  numberOfLines={1}
                >
                  {totalH > 0 ? `${totalH}h` : '–'}
                </Text>

                <View
                  style={{ height: barHeight }}
                  className="w-full max-w-[26px] rounded-t-md overflow-hidden bg-theme-inset flex-col-reverse"
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
              </View>
            );
          })}
        </View>
      </View>

      <FitnessMetricsInfoModal
        visible={showInfoModal}
        onClose={() => setShowInfoModal(false)}
      />
    </Card>
  );
};

export default FitnessTrendsChart;

