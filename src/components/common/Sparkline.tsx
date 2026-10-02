import React from 'react';
import { View } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop, Circle } from 'react-native-svg';

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
  strokeWidth?: number;
  minRangePadding?: number;
  breakGapDays?: number;
}

export const Sparkline: React.FC<SparklineProps> = ({
  data,
  color = '#208AEF',
  gradientFrom = '#208AEF33',
  gradientTo = '#208AEF00',
  height = 36,
  width = 100,
  strokeWidth = 2,
  minRangePadding = 0,
  breakGapDays,
}) => {
  if (!data || data.length === 0) {
    return <View style={{ height, width }} />;
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
    return <View style={{ height, width }} />;
  }

  // Single point case: render a single dot
  if (validVals.length === 1) {
    const singleVal = validVals[0];
    const cy = height / 2;
    const cx = width / 2;
    return (
      <Svg height={height} width={width} viewBox={`0 0 ${width} ${height}`}>
        <Circle cx={cx} cy={cy} r={strokeWidth * 1.5} fill={color} />
      </Svg>
    );
  }

  const rawMin = Math.min(...validVals);
  const rawMax = Math.max(...validVals);
  const min = rawMin - minRangePadding;
  const max = rawMax + minRangePadding;
  const range = max - min === 0 ? 1 : max - min;
  const padding = 2;

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

    // Check date gap if breakGapDays is set and previous point had date
    if (breakGapDays && currentSegment.length > 0 && pt.date && rawPoints[i - 1]?.date) {
      const prevDate = rawPoints[i - 1].date!;
      const diffDays = Math.abs((pt.date.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays > breakGapDays) {
        segments.push(currentSegment);
        currentSegment = [];
      }
    }

    const x = padding + (i / Math.max(1, rawPoints.length - 1)) * (width - padding * 2);
    const y = height - padding - ((pt.val - min) / range) * (height - padding * 2);
    currentSegment.push({ x, y });
  }

  if (currentSegment.length > 0) {
    segments.push(currentSegment);
  }

  if (segments.length === 0) {
    return <View style={{ height, width }} />;
  }

  const gradId = `___sparkline_temp___-grad-${color.replace('#', '')}`;

  return (
    <Svg height={height} width={width} viewBox={`0 0 ${width} ${height}`}>
      <Defs>
        <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor={gradientFrom} stopOpacity={0.6} />
          <Stop offset="100%" stopColor={gradientTo} stopOpacity={0.0} />
        </LinearGradient>
      </Defs>

      {segments.map((seg, sIdx) => {
        if (seg.length === 1) {
          return (
            <Circle
              key={`seg-dot-${sIdx}`}
              cx={seg[0].x}
              cy={seg[0].y}
              r={strokeWidth * 1.5}
              fill={color}
            />
          );
        }

        const pathD = seg.reduce((acc, pt, idx) => {
          return idx === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`;
        }, '');

        const areaD = `${pathD} L ${seg[seg.length - 1].x} ${height} L ${seg[0].x} ${height} Z`;

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
    </Svg>
  );
};
