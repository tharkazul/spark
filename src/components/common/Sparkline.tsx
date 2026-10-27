import React, { useState } from 'react';
import { View } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop, Circle, Line } from 'react-native-svg';

export interface SparklinePoint {
  val: number | null;
  date?: string | Date;
}

interface SparklineProps {
  data: (number | null)[] | SparklinePoint[];
  color?: string;
  gradientFrom?: string;
  gradientTo?: string;
  height?: number;
  width?: number;
  /** When true, measures container width automatically so the trendline spans 100% of the tile. */
  fullWidth?: boolean;
  strokeWidth?: number;
  minRangePadding?: number;
  breakGapDays?: number;
  /** Renders a highlighted dot on the most recent data point. Defaults to true. */
  showEndDot?: boolean;
  /** Optional reference value (e.g. 7-day average or 0 baseline) drawn as a subtle dashed line. */
  baseline?: number | null;
  /** Dynamic target benchmark at the top (e.g. green dashed line) */
  targetUpper?: number | null;
  /** Floor/maintenance line at the bottom (e.g. red dashed line) */
  targetLower?: number | null;
  targetUpperColor?: string;
  targetLowerColor?: string;
}

/** Normalize 8-digit hex (#RRGGBBAA) to 6-digit hex (#RRGGBB) so SVG stopOpacity works predictably. */
const toBaseHex = (c: string) => (c.startsWith('#') && c.length === 9 ? c.slice(0, 7) : c);

export const Sparkline: React.FC<SparklineProps> = ({
  data,
  color = '#0EA5E9',
  gradientFrom,
  gradientTo,
  height = 36,
  width = 100,
  fullWidth = false,
  strokeWidth = 2,
  minRangePadding = 0,
  breakGapDays,
  showEndDot = true,
  baseline = null,
  targetUpper = null,
  targetLower = null,
  targetUpperColor = '#10B981',
  targetLowerColor = '#F43F5E',
}) => {
  const [measuredWidth, setMeasuredWidth] = useState<number>(width);
  const effectiveWidth = fullWidth ? measuredWidth : width;

  if (!data || data.length === 0) {
    return <View style={{ height, width: fullWidth ? '100%' : width }} />;
  }

  // Normalize points
  const rawPoints: { val: number | null; date?: Date }[] = data.map((item) => {
    if (item === null || item === undefined) return { val: null };
    if (typeof item === 'number') return { val: item };
    const dateObj = item.date ? (item.date instanceof Date ? item.date : new Date(item.date)) : undefined;
    return { val: item.val, date: dateObj };
  });

  const validVals = rawPoints.map((p) => p.val).filter((v): v is number => typeof v === 'number' && !isNaN(v));

  if (validVals.length === 0) {
    return <View style={{ height, width: fullWidth ? '100%' : width }} />;
  }

  const allValsForScale = [
    ...validVals,
    ...(typeof baseline === 'number' && !isNaN(baseline) ? [baseline] : []),
    ...(typeof targetUpper === 'number' && !isNaN(targetUpper) ? [targetUpper] : []),
    ...(typeof targetLower === 'number' && !isNaN(targetLower) ? [targetLower] : []),
  ];

  const rawMin = Math.min(...allValsForScale);
  const rawMax = Math.max(...allValsForScale);
  const naturalSpan = rawMax - rawMin;
  const padVal = Math.max(minRangePadding, naturalSpan * 0.12);
  const min = rawMin - padVal;
  const max = rawMax + padVal;
  const range = max - min === 0 ? 1 : max - min;

  const padX = 4;
  const padY = 5;
  const plotW = Math.max(1, effectiveWidth - padX * 2);
  const plotH = Math.max(1, height - padY * 2);

  const getY = (val: number) => height - padY - ((val - min) / range) * plotH;

  // Build segmented paths to handle gaps > breakGapDays or nulls
  const segments: { x: number; y: number }[][] = [];
  let currentSegment: { x: number; y: number }[] = [];

  for (let i = 0; i < rawPoints.length; i++) {
    const pt = rawPoints[i];
    if (pt.val === null || isNaN(pt.val)) {
      if (currentSegment.length > 0) {
        segments.push(currentSegment);
        currentSegment = [];
      }
      continue;
    }

    if (breakGapDays && currentSegment.length > 0 && pt.date && rawPoints[i - 1]?.date) {
      const prevDate = rawPoints[i - 1].date!;
      const diffDays = Math.abs((pt.date.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays > breakGapDays) {
        segments.push(currentSegment);
        currentSegment = [];
      }
    }

    const x = rawPoints.length === 1 ? effectiveWidth / 2 : padX + (i / Math.max(1, rawPoints.length - 1)) * plotW;
    const y = getY(pt.val);
    currentSegment.push({ x, y });
  }

  if (currentSegment.length > 0) {
    segments.push(currentSegment);
  }

  const baseColor = toBaseHex(gradientFrom || color);
  const endColor = toBaseHex(gradientTo || color);
  const gradId = `spark-grad-${baseColor.replace(/[^a-zA-Z0-9]/g, '')}-${Math.round(effectiveWidth)}`;
  const lastSeg = segments[segments.length - 1];
  const lastPt = lastSeg && lastSeg.length > 0 ? lastSeg[lastSeg.length - 1] : null;
  const baselineY = typeof baseline === 'number' && !isNaN(baseline) ? getY(baseline) : null;
  const targetUpperY = typeof targetUpper === 'number' && !isNaN(targetUpper) ? getY(targetUpper) : null;
  const targetLowerY = typeof targetLower === 'number' && !isNaN(targetLower) ? getY(targetLower) : null;

  const svgContent = (
    <Svg height={height} width={effectiveWidth} viewBox={`0 0 ${effectiveWidth} ${height}`}>
      <Defs>
        <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor={baseColor} stopOpacity={0.18} />
          <Stop offset="100%" stopColor={endColor} stopOpacity={0.0} />
        </LinearGradient>
      </Defs>

      {/* Dynamic Upper Target Line */}
      {targetUpperY !== null && (
        <Line
          x1={padX}
          y1={targetUpperY}
          x2={effectiveWidth - padX}
          y2={targetUpperY}
          stroke={targetUpperColor}
          strokeWidth={1.35}
          strokeDasharray="4 4"
          strokeOpacity={0.42}
          strokeLinecap="round"
        />
      )}

      {/* Dynamic Lower Floor / Baseline Line */}
      {targetLowerY !== null && (
        <Line
          x1={padX}
          y1={targetLowerY}
          x2={effectiveWidth - padX}
          y2={targetLowerY}
          stroke={targetLowerColor}
          strokeWidth={1.35}
          strokeDasharray="4 4"
          strokeOpacity={0.42}
          strokeLinecap="round"
        />
      )}

      {baselineY !== null && (
        <Line
          x1={padX}
          y1={baselineY}
          x2={effectiveWidth - padX}
          y2={baselineY}
          stroke="#94A3B8"
          strokeWidth={1}
          strokeDasharray="3 3"
          strokeOpacity={0.45}
        />
      )}

      {segments.map((seg, sIdx) => {
        if (seg.length === 1) {
          return (
            <Circle
              key={`seg-dot-${sIdx}`}
              cx={seg[0].x}
              cy={seg[0].y}
              r={strokeWidth * 1.4}
              fill={color}
            />
          );
        }

        const pathD = seg.reduce((acc, pt, idx) => {
          return idx === 0 ? `M ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}` : `${acc} L ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`;
        }, '');

        const areaD = `${pathD} L ${seg[seg.length - 1].x.toFixed(1)} ${height} L ${seg[0].x.toFixed(1)} ${height} Z`;

        return (
          <React.Fragment key={`seg-group-${sIdx}`}>
            <Path d={areaD} fill={`url(#${gradId})`} />
            <Path
              d={pathD}
              fill="none"
              stroke={color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </React.Fragment>
        );
      })}

      {showEndDot && lastPt && (
        <Circle
          cx={lastPt.x}
          cy={lastPt.y}
          r={3}
          fill={color}
        />
      )}
    </Svg>
  );

  if (fullWidth) {
    return (
      <View
        className="w-full overflow-hidden"
        style={{ height }}
        onLayout={(e) => {
          const w = Math.floor(e.nativeEvent.layout.width);
          if (w > 0 && Math.abs(w - measuredWidth) > 1) {
            setMeasuredWidth(w);
          }
        }}
      >
        {svgContent}
      </View>
    );
  }

  return svgContent;
};

