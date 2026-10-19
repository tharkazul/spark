import React, { useMemo } from 'react';
import { Text, View } from 'react-native';
import { Sparkline, SparklinePoint } from '../common/Sparkline';

export type MetricDeltaTone = 'good' | 'warn' | 'bad' | 'neutral' | 'accent';

export interface MetricTileProps {
  label: string;
  value: string | number;
  unit?: string;
  valueColorClass?: string;
  delta?: string | null;
  deltaTone?: MetricDeltaTone;
  series?: (number | null)[] | SparklinePoint[];
  baseline?: number | null;
  color?: string;
  minRangePadding?: number;
  emptyHint?: string;
  className?: string;
}

const DELTA_STYLES: Record<MetricDeltaTone, { bg: string; text: string }> = {
  good: { bg: 'bg-emerald-500/12', text: 'text-emerald-500' },
  warn: { bg: 'bg-amber-500/12', text: 'text-amber-500' },
  bad: { bg: 'bg-rose-500/12', text: 'text-rose-500' },
  accent: { bg: 'bg-theme-accent/12', text: 'text-theme-accent' },
  neutral: { bg: 'bg-theme-border/50', text: 'text-theme-muted' },
};

/**
 * Renders a metric value where numbers use crisp tabular Rajdhani and embedded
 * duration units (like "6h 31m") or trailing units ("bpm", "ms", "kg") use
 * smaller muted sans-serif text so units never look heavy or bold.
 */
function FormattedMetricValue({
  value,
  unit,
  valueColorClass = 'text-theme-text',
}: {
  value: string | number;
  unit?: string;
  valueColorClass?: string;
}) {
  const str = String(value);
  // Check for duration pattern like "6h 31m" or "6h 05m"
  const durationMatch = str.match(/^(\d+)h\s*(\d+)m$/i);

  if (durationMatch) {
    const [, hrs, mins] = durationMatch;
    return (
      <View className="flex-row items-baseline mt-0.5">
        <Text
          style={{ fontVariant: ['tabular-nums'] }}
          className={`text-2xl font-bold font-rajdhani ${valueColorClass}`}
        >
          {hrs}
        </Text>
        <Text className="text-xs font-semibold text-theme-muted ml-0.5 mr-1.5">h</Text>
        <Text
          style={{ fontVariant: ['tabular-nums'] }}
          className={`text-2xl font-bold font-rajdhani ${valueColorClass}`}
        >
          {mins}
        </Text>
        <Text className="text-xs font-semibold text-theme-muted ml-0.5">m</Text>
      </View>
    );
  }

  return (
    <View className="flex-row items-baseline mt-0.5">
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
        style={{ fontVariant: ['tabular-nums'] }}
        className={`text-2xl font-bold font-rajdhani ${valueColorClass}`}
      >
        {str}
      </Text>
      {unit ? (
        <Text numberOfLines={1} className="text-xs font-semibold text-theme-muted ml-1">
          {unit}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Singular Metric + Trendline Tile used across Home (Recovery) and Progress
 * (Fitness PMC, Cardio Recovery, Body Weight, Vitals).
 *
 * Layout:
 * 1. Top row: Muted label on the left + compact delta/status pill on the right.
 * 2. Middle row: Crisp Rajdhani number + small muted unit.
 * 3. Bottom row: Full-width sparkline with soft gradient fill, optional dashed
 *    baseline, and an endpoint dot on the latest value.
 */
export function MetricTile({
  label,
  value,
  unit,
  valueColorClass,
  delta,
  deltaTone = 'neutral',
  series = [],
  baseline = null,
  color = '#0EA5E9',
  minRangePadding = 0.5,
  emptyHint,
  className = '',
}: MetricTileProps) {
  const cleanSeries = useMemo(() => {
    if (!series || series.length === 0) return [];
    // Keep SparklinePoint[] intact if passed, or filter valid numbers
    const first = series[0];
    if (first && typeof first === 'object' && 'val' in first) {
      const validPts = (series as SparklinePoint[]).filter(
        (p) => typeof p.val === 'number' && !isNaN(p.val) && p.val !== 0
      );
      if (validPts.length === 1) return [validPts[0], validPts[0]];
      return validPts;
    }
    const validNums = (series as (number | null)[]).filter(
      (v): v is number => typeof v === 'number' && !isNaN(v)
    );
    if (validNums.length === 1) return [validNums[0], validNums[0]];
    return validNums;
  }, [series]);

  const deltaStyle = DELTA_STYLES[deltaTone];

  return (
    <View className={`flex-1 bg-theme-inset rounded-inset p-3 justify-between ${className}`}>
      <View>
        {/* Top Row: Label + Delta Pill */}
        <View className="flex-row items-center justify-between gap-1">
          <Text className="text-xs font-semibold text-theme-muted flex-1" numberOfLines={1}>
            {label}
          </Text>
          {delta ? (
            <View className={`px-1.5 py-0.5 rounded-md ${deltaStyle.bg}`}>
              <Text
                style={{ fontVariant: ['tabular-nums'] }}
                className={`text-[10px] font-bold ${deltaStyle.text}`}
                numberOfLines={1}
              >
                {delta}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Value + Unit */}
        <FormattedMetricValue value={value} unit={unit} valueColorClass={valueColorClass} />
      </View>

      {/* Full-Width Trendline */}
      {cleanSeries.length >= 2 ? (
        <View className="mt-2 w-full">
          <Sparkline
            data={cleanSeries}
            color={color}
            height={34}
            fullWidth
            strokeWidth={2}
            minRangePadding={minRangePadding}
            baseline={baseline}
            showEndDot
          />
        </View>
      ) : emptyHint ? (
        <View className="mt-2 h-[34px] justify-center">
          <Text className="text-[11px] text-theme-muted" numberOfLines={1}>
            {emptyHint}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

export default MetricTile;
