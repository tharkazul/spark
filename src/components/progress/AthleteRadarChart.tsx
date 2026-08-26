import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Polygon, Line, Circle, G, Defs, LinearGradient, Stop } from 'react-native-svg';

export interface ArchetypeData {
  endurance: number;    // 0 - 100
  strength: number;     // 0 - 100
  versatility: number;  // 0 - 100
  explosiveness: number; // 0 - 100
  consistency?: number; // 0 - 100
  title?: string;
  description?: string;
}

interface AthleteRadarChartProps {
  data?: ArchetypeData;
  size?: number;
}

const DEFAULT_DATA: ArchetypeData = {
  endurance: 82,
  strength: 65,
  versatility: 74,
  explosiveness: 58,
  consistency: 70,
};

export const AthleteRadarChart: React.FC<AthleteRadarChartProps> = ({
  data = DEFAULT_DATA,
  size = 260,
}) => {
  const center = size / 2;
  const radius = (size - 70) / 2;

  const metrics = [
    { label: 'Endurance', value: Math.max(5, Math.min(100, data.endurance || 0)) },
    { label: 'Strength', value: Math.max(5, Math.min(100, data.strength || 0)) },
    { label: 'Versatility', value: Math.max(5, Math.min(100, data.versatility || 0)) },
    { label: 'Explosiveness', value: Math.max(5, Math.min(100, data.explosiveness || 0)) },
    { label: 'Consistency', value: Math.max(5, Math.min(100, data.consistency ?? 70)) },
  ];

  const totalAxes = metrics.length; // 5 axes

  // Angle step for 5 axes (72 deg in rad)
  const getPoint = (index: number, valPercent: number) => {
    const angle = (index * 2 * Math.PI) / totalAxes - Math.PI / 2;
    const r = (valPercent / 100) * radius;
    return {
      x: center + r * Math.cos(angle),
      y: center + r * Math.sin(angle),
    };
  };

  const getGridPoints = (scale: number) => {
    return metrics
      .map((_, i) => {
        const pt = getPoint(i, scale * 100);
        return `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
      })
      .join(' ');
  };

  const dataPolygonPoints = metrics
    .map((m, i) => {
      const pt = getPoint(i, m.value);
      return `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
    })
    .join(' ');

  // Label offsets for text around pentagon outer edge
  const getLabelStyle = (index: number) => {
    const angle = (index * 2 * Math.PI) / totalAxes - Math.PI / 2;
    const offset = radius + 24;
    const x = center + offset * Math.cos(angle);
    const y = center + offset * Math.sin(angle);

    return {
      left: x - 55,
      top: y - 12,
      width: 110,
    };
  };

  return (
    <View className="items-center justify-center py-2">
      <View style={{ width: size, height: size, position: 'relative' }}>
        {/* Dynamic Axis Text Labels */}
        {metrics.map((m, i) => {
          const style = getLabelStyle(i);
          return (
            <View
              key={m.label}
              className="absolute items-center justify-center"
              style={style}
            >
              <Text
                numberOfLines={1}
                className="text-xs font-bold text-theme-muted tracking-normal text-center"
              >
                {m.label}
              </Text>
              <Text className="text-xs font-extrabold text-theme-accent text-center">
                {m.value}%
              </Text>
            </View>
          );
        })}

        <Svg width={size} height={size}>
          <Defs>
            <LinearGradient id="radarGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%" stopColor="#FF5F3B" stopOpacity="0.5" />
              <Stop offset="100%" stopColor="#FF8554" stopOpacity="0.2" />
            </LinearGradient>
          </Defs>

          {/* Grid Concentric Pentagons */}
          {[1.0, 0.75, 0.5, 0.25].map((scale, idx) => (
            <Polygon
              key={scale}
              points={getGridPoints(scale)}
              fill="none"
              stroke="#5A6973"
              strokeWidth="1"
              strokeDasharray={idx === 0 ? '3 3' : '2 2'}
              opacity={0.35 - idx * 0.05}
            />
          ))}

          {/* Axis Spokes from Center to Outer Rim */}
          {metrics.map((_, i) => {
            const outerPt = getPoint(i, 100);
            return (
              <Line
                key={i}
                x1={center}
                y1={center}
                x2={outerPt.x}
                y2={outerPt.y}
                stroke="#5A6973"
                strokeWidth="1"
                opacity={0.25}
              />
            );
          })}

          {/* User Data Polygon */}
          <Polygon
            points={dataPolygonPoints}
            fill="url(#radarGrad)"
            stroke="#FF5F3B"
            strokeWidth="2.5"
          />

          {/* Glowing Dots at Data Vertices */}
          <G>
            {metrics.map((m, i) => {
              const pt = getPoint(i, m.value);
              return (
                <G key={i}>
                  <Circle cx={pt.x} cy={pt.y} r="4.5" fill="#FF5F3B" />
                  <Circle cx={pt.x} cy={pt.y} r="7.5" fill="#FF5F3B" opacity="0.3" />
                </G>
              );
            })}
          </G>
        </Svg>
      </View>
    </View>
  );
};
