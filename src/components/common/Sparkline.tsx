import React from 'react';
import { View } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop } from 'react-native-svg';

interface SparklineProps {
  data: number[];
  color?: string;
  gradientFrom?: string;
  gradientTo?: string;
  height?: number;
  width?: number;
  strokeWidth?: number;
}

export const Sparkline: React.FC<SparklineProps> = ({
  data,
  color = '#208AEF',
  gradientFrom = '#208AEF33',
  gradientTo = '#208AEF00',
  height = 36,
  width = 100,
  strokeWidth = 2,
}) => {
  if (!data || data.length < 2) {
    return <View style={{ height, width }} />;
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min === 0 ? 1 : max - min;
  const padding = 2;

  const points = data.map((val, idx) => {
    const x = padding + (idx / (data.length - 1)) * (width - padding * 2);
    const y = height - padding - ((val - min) / range) * (height - padding * 2);
    return { x, y };
  });

  const pathD = points.reduce((acc, pt, idx) => {
    return idx === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`;
  }, '');

  const areaD = `${pathD} L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z`;

  const gradId = `sparkline-grad-${color.replace('#', '')}`;

  return (
    <Svg height={height} width={width} viewBox={`0 0 ${width} ${height}`}>
      <Defs>
        <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor={gradientFrom} stopOpacity={0.6} />
          <Stop offset="100%" stopColor={gradientTo} stopOpacity={0.0} />
        </LinearGradient>
      </Defs>
      <Path d={areaD} fill={`url(#${gradId})`} />
      <Path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
};
