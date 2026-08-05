import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Polygon, Line, Circle, G, Defs, LinearGradient, Stop } from 'react-native-svg';

export interface ArchetypeData {
  endurance: number; // 0 - 100
  strength: number;  // 0 - 100
  versatility: number; // 0 - 100
  explosiveness: number; // 0 - 100
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
};

export const AthleteRadarChart: React.FC<AthleteRadarChartProps> = ({
  data = DEFAULT_DATA,
  size = 240,
}) => {
  const center = size / 2;
  const radius = (size - 60) / 2;

  // Axes definition: Top (Endurance), Right (Strength), Bottom (Versatility), Left (Explosiveness)
  // Coordinates relative to center:
  // Top: (0, -r)
  // Right: (r, 0)
  // Bottom: (0, r)
  // Left: (-r, 0)

  const getPointsForScale = (scale: number) => {
    const r = radius * scale;
    const top = `${center},${center - r}`;
    const right = `${center + r},${center}`;
    const bottom = `${center},${center + r}`;
    const left = `${center - r},${center}`;
    return `${top} ${right} ${bottom} ${left}`;
  };

  // Calculate actual data polygon points
  const topVal = (data.endurance / 100) * radius;
  const rightVal = (data.strength / 100) * radius;
  const bottomVal = (data.versatility / 100) * radius;
  const leftVal = (data.explosiveness / 100) * radius;

  const pTop = { x: center, y: center - topVal };
  const pRight = { x: center + rightVal, y: center };
  const pBottom = { x: center, y: center + bottomVal };
  const pLeft = { x: center - leftVal, y: center };

  const dataPoints = `${pTop.x},${pTop.y} ${pRight.x},${pRight.y} ${pBottom.x},${pBottom.y} ${pLeft.x},${pLeft.y}`;

  return (
    <View className="items-center justify-center py-2">
      <View style={{ width: size, height: size, position: 'relative' }}>
        {/* Axis Labels Positioned around SVG */}
        <Text
          className="absolute text-xs font-bold text-theme-muted uppercase tracking-wider text-center"
          style={{ top: 2, left: 0, right: 0 }}
        >
          Endurance <Text className="text-theme-accent font-extrabold">{data.endurance}%</Text>
        </Text>

        <Text
          className="absolute text-xs font-bold text-theme-muted uppercase tracking-wider text-right"
          style={{ right: 0, top: center - 10, width: 80 }}
        >
          Strength{'\n'}
          <Text className="text-theme-accent font-extrabold">{data.strength}%</Text>
        </Text>

        <Text
          className="absolute text-xs font-bold text-theme-muted uppercase tracking-wider text-center"
          style={{ bottom: 2, left: 0, right: 0 }}
        >
          Versatility <Text className="text-theme-accent font-extrabold">{data.versatility}%</Text>
        </Text>

        <Text
          className="absolute text-xs font-bold text-theme-muted uppercase tracking-wider text-left"
          style={{ left: 0, top: center - 10, width: 80 }}
        >
          Explosiveness{'\n'}
          <Text className="text-theme-accent font-extrabold">{data.explosiveness}%</Text>
        </Text>

        <Svg width={size} height={size}>
          <Defs>
            <LinearGradient id="radarGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%" stopColor="#FF5A1F" stopOpacity="0.45" />
              <Stop offset="100%" stopColor="#FF8554" stopOpacity="0.15" />
            </LinearGradient>
          </Defs>

          {/* Grid Concentric Diamonds */}
          <Polygon
            points={getPointsForScale(1.0)}
            fill="none"
            stroke="#5A6973"
            strokeWidth="1"
            strokeDasharray="3 3"
            opacity={0.35}
          />
          <Polygon
            points={getPointsForScale(0.75)}
            fill="none"
            stroke="#5A6973"
            strokeWidth="1"
            strokeDasharray="2 2"
            opacity={0.25}
          />
          <Polygon
            points={getPointsForScale(0.5)}
            fill="none"
            stroke="#5A6973"
            strokeWidth="1"
            strokeDasharray="2 2"
            opacity={0.2}
          />
          <Polygon
            points={getPointsForScale(0.25)}
            fill="none"
            stroke="#5A6973"
            strokeWidth="1"
            strokeDasharray="2 2"
            opacity={0.15}
          />

          {/* Axis Cross Lines */}
          <Line
            x1={center}
            y1={center - radius}
            x2={center}
            y2={center + radius}
            stroke="#5A6973"
            strokeWidth="1"
            opacity={0.25}
          />
          <Line
            x1={center - radius}
            y1={center}
            x2={center + radius}
            y2={center}
            stroke="#5A6973"
            strokeWidth="1"
            opacity={0.25}
          />

          {/* User Data Polygon */}
          <Polygon
            points={dataPoints}
            fill="url(#radarGrad)"
            stroke="#FF5A1F"
            strokeWidth="2.5"
          />

          {/* Data Points Glowing Dots */}
          <G>
            <Circle cx={pTop.x} cy={pTop.y} r="5" fill="#FF5A1F" />
            <Circle cx={pTop.x} cy={pTop.y} r="8" fill="#FF5A1F" opacity="0.3" />

            <Circle cx={pRight.x} cy={pRight.y} r="5" fill="#FF5A1F" />
            <Circle cx={pRight.x} cy={pRight.y} r="8" fill="#FF5A1F" opacity="0.3" />

            <Circle cx={pBottom.x} cy={pBottom.y} r="5" fill="#FF5A1F" />
            <Circle cx={pBottom.x} cy={pBottom.y} r="8" fill="#FF5A1F" opacity="0.3" />

            <Circle cx={pLeft.x} cy={pLeft.y} r="5" fill="#FF5A1F" />
            <Circle cx={pLeft.x} cy={pLeft.y} r="8" fill="#FF5A1F" opacity="0.3" />
          </G>
        </Svg>
      </View>
    </View>
  );
};
