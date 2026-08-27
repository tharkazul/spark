import React, { useState } from 'react';
import { useTheme } from '@/hooks/use-theme';
import { View, Text, TouchableOpacity, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Rect, Path, Circle, Line, Text as SvgText } from 'react-native-svg';
import * as Haptics from 'expo-haptics';

import { calculatePMC, PMCDayPoint } from '../../domain/pmc';
import { Activity } from '../../types/activity';
import { PhysiqueEntry } from '../../types/physique';

interface PMCComboChartProps {
  activities?: Activity[];
  physiqueLogs?: PhysiqueEntry[];
  targetCtl?: number;
  height?: number;
}

type RangeOption = '7D' | '14D' | '30D' | 'ALL';

function formatDateLabel(dateStr?: string): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch (e) {
    return dateStr;
  }
}

export const PMCComboChart: React.FC<PMCComboChartProps> = ({
  activities = [],
  physiqueLogs = [],
  targetCtl = 75,
  height = 210,
}) => {
    const theme = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const chartWidth = Math.max(320, windowWidth - 48);

  const [selectedRange, setSelectedRange] = useState<RangeOption>('14D');
  const [selectedPoint, setSelectedPoint] = useState<PMCDayPoint | null>(null);

  const goalMilestones = targetCtl
    ? [{ date: new Date().toISOString().split('T')[0], target_ctl: targetCtl, name: 'Target Race' }]
    : [];

  const pmcResult = calculatePMC(activities, physiqueLogs, goalMilestones);
  const fullHistory = pmcResult.history;

  // Filter history based on selected range
  const displayDays =
    selectedRange === '7D'
      ? 7
      : selectedRange === '14D'
      ? 14
      : selectedRange === '30D'
      ? 30
      : fullHistory.length || 60;

  const historySlice = fullHistory.slice(-displayDays);

  if (historySlice.length === 0) {
    return (
      <View className="bg-theme-card border border-theme-border dark:border-slate-800 rounded-2xl p-5 items-center justify-center min-h-[180px]">
        <Ionicons name="stats-chart-outline" size={32} color={theme.textSecondary} />
        <Text className="text-sm font-semibold text-theme-muted mt-2">No Training Load Data Available</Text>
      </View>
    );
  }

  // 1. Dynamic Y-Axis Scaling: tightly bound to data with ~15-20% headroom
  const ctlValues = historySlice.map((h) => h.ctl);
  const atlValues = historySlice.map((h) => h.atl);
  const tsbValues = historySlice.map((h) => h.tsb);

  const dataMax = Math.max(5, ...ctlValues, ...atlValues, Math.max(0, ...tsbValues));
  const dataMin = Math.min(0, ...tsbValues);

  // Apply 15-20% padding headroom above peak and below min
  const maxVal = Math.ceil(dataMax * 1.2);
  const minVal = Math.floor(dataMin < 0 ? dataMin * 1.2 : -5);
  const valRange = maxVal - minVal || 1;

  const paddingLeft = 14;
  const paddingRight = 36;
  const paddingTop = 16;
  const paddingBottom = 32;
  const graphWidth = chartWidth - paddingLeft - paddingRight;
  const graphHeight = height - paddingTop - paddingBottom;

  const getX = (index: number) => {
    if (historySlice.length <= 1) return paddingLeft + graphWidth / 2;
    return paddingLeft + (index / (historySlice.length - 1)) * graphWidth;
  };

  const getY = (val: number) => {
    const ratio = (val - minVal) / valRange;
    return paddingTop + (1 - ratio) * graphHeight;
  };

  const zeroY = getY(0);

  // SVG Paths for CTL and ATL
  const ctlPath = historySlice.reduce((acc, point, idx) => {
    const x = getX(idx);
    const y = getY(point.ctl);
    return idx === 0 ? `M ${x} ${y}` : `${acc} L ${x} ${y}`;
  }, '');

  const atlPath = historySlice.reduce((acc, point, idx) => {
    const x = getX(idx);
    const y = getY(point.atl);
    return idx === 0 ? `M ${x} ${y}` : `${acc} L ${x} ${y}`;
  }, '');

  const startDateLabel = formatDateLabel(historySlice[0]?.date);
  const midIndex = Math.floor(historySlice.length / 2);
  const midDateLabel = formatDateLabel(historySlice[midIndex]?.date);
  const endDateLabel = formatDateLabel(historySlice[historySlice.length - 1]?.date);

  return (
    <View className="bg-theme-card border border-theme-border dark:border-slate-800 rounded-2xl p-4 mb-4">
      {/* Header with Title and Range Selector */}
      <View className="flex-row justify-between items-center mb-3">
        <View className="flex-row items-center space-x-1.5">
          <Ionicons name="trending-up" size={16} color={theme.tint} />
          <Text className="text-xs font-bold text-theme-muted ml-1">
            Training Load
          </Text>
        </View>

        {/* Range Segmented Control */}
        <View className="flex-row bg-theme-bg dark:bg-slate-800/80 rounded-lg p-0.5">
          {(['7D', '14D', '30D', 'ALL'] as const).map((rng) => (
            <TouchableOpacity
              key={rng}
              onPress={() => {
                Haptics.selectionAsync();
                setSelectedRange(rng);
                setSelectedPoint(null);
              }}
              className={`px-2 py-0.5 rounded-md ${
                selectedRange === rng ? 'bg-white dark:bg-slate-700 shadow-xs' : ''
              }`}
            >
              <Text
                className={`text-xs ${
                  selectedRange === rng
                    ? 'font-bold text-theme-accent'
                    : 'font-medium text-theme-muted dark:text-slate-400'
                }`}
              >
                {rng}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Selected Point Tooltip Banner */}
      {selectedPoint && (
        <View className="bg-theme-bg dark:bg-slate-800/60 px-3 py-2 rounded-xl mb-2 flex-row justify-between items-center border border-theme-border dark:border-slate-700">
          <Text className="text-xs font-mono font-bold text-theme-muted">{selectedPoint.date}</Text>
          <View className="flex-row gap-3">
            <Text className="text-xs font-bold text-sky-500">CTL: {selectedPoint.ctl.toFixed(1)}</Text>
            <Text className="text-xs font-bold text-rose-500">ATL: {selectedPoint.atl.toFixed(1)}</Text>
            <Text
              className={`text-xs font-bold ${
                selectedPoint.tsb >= 0 ? 'text-amber-500' : 'text-rose-400'
              }`}
            >
              TSB: {selectedPoint.tsb.toFixed(1)}
            </Text>
          </View>
        </View>
      )}

      {/* SVG Chart Surface */}
      <View style={{ height, width: '100%' }}>
        <Svg width="100%" height={height} viewBox={`0 0 ${chartWidth} ${height}`}>
          {/* Faint Horizontal Dashed Gridlines */}
          <Line
            x1={paddingLeft}
            y1={getY(maxVal * 0.9)}
            x2={chartWidth - paddingRight}
            y2={getY(maxVal * 0.9)}
            stroke="#E2E8F0"
            strokeWidth="1"
            strokeDasharray="3 3"
            strokeOpacity={0.6}
          />
          <Line
            x1={paddingLeft}
            y1={zeroY}
            x2={chartWidth - paddingRight}
            y2={zeroY}
            stroke="#CBD5E1"
            strokeWidth="1"
            strokeDasharray="3 3"
            strokeOpacity={0.8}
          />
          {minVal < -2 && (
            <Line
              x1={paddingLeft}
              y1={getY(minVal * 0.8)}
              x2={chartWidth - paddingRight}
              y2={getY(minVal * 0.8)}
              stroke="#E2E8F0"
              strokeWidth="1"
              strokeDasharray="3 3"
              strokeOpacity={0.6}
            />
          )}

          {/* Y-Axis subtle value labels */}
          <SvgText
            x={chartWidth - paddingRight + 6}
            y={getY(maxVal * 0.9) + 3}
            fontSize="10"
            fill={theme.textSecondary}
            textAnchor="start"
            fontWeight="500"
          >
            {Math.round(maxVal * 0.9)}
          </SvgText>
          <SvgText
            x={chartWidth - paddingRight + 6}
            y={zeroY + 3}
            fontSize="10"
            fill={theme.textSecondary}
            textAnchor="start"
            fontWeight="500"
          >
            0
          </SvgText>
          {minVal < -2 && (
            <SvgText
              x={chartWidth - paddingRight + 6}
              y={getY(minVal * 0.8) + 3}
              fontSize="10"
              fill={theme.textSecondary}
              textAnchor="start"
              fontWeight="500"
            >
              {Math.round(minVal * 0.8)}
            </SvgText>
          )}

          {/* Form (TSB) Bars */}
          {historySlice.map((pt, idx) => {
            const x = getX(idx) - 2.5;
            const barY = pt.tsb >= 0 ? getY(pt.tsb) : zeroY;
            const barHeight = Math.max(2, Math.abs(getY(pt.tsb) - zeroY));
            const barColor = pt.tsb >= 0 ? 'rgba(251, 191, 36, 0.45)' : 'rgba(244, 63, 94, 0.45)';

            return (
              <Rect
                key={`bar-${idx}`}
                x={x}
                y={barY}
                width={5}
                height={barHeight}
                fill={barColor}
                rx={1.5}
                onPress={() => {
                  Haptics.selectionAsync();
                  setSelectedPoint(pt);
                }}
              />
            );
          })}

          {/* Fitness (CTL) Line */}
          <Path d={ctlPath} fill="none" stroke="#0ea5e9" strokeWidth="2.5" />

          {/* Fatigue (ATL) Line */}
          <Path d={atlPath} fill="none" stroke="#f43f5e" strokeWidth="1.5" strokeDasharray="3 3" />

          {/* Interactive touch points */}
          {historySlice.map((pt, idx) => {
            const x = getX(idx);
            const y = getY(pt.ctl);
            const isSelected = selectedPoint?.date === pt.date;

            return (
              <Circle
                key={`dot-${idx}`}
                cx={x}
                cy={y}
                r={isSelected ? 5 : 2.5}
                fill={isSelected ? '#FF5F3B' : '#0ea5e9'}
                stroke="#ffffff"
                strokeWidth={isSelected ? 2 : 0}
                onPress={() => {
                  Haptics.selectionAsync();
                  setSelectedPoint(pt);
                }}
              />
            );
          })}

          {/* X-Axis Date Labels */}
          <SvgText
            x={getX(0)}
            y={height - 8}
            fontSize="10"
            fill={theme.textSecondary}
            textAnchor="start"
            fontWeight="500"
          >
            {startDateLabel}
          </SvgText>
          {historySlice.length > 3 && (
            <SvgText
              x={getX(midIndex)}
              y={height - 8}
              fontSize="10"
              fill={theme.textSecondary}
              textAnchor="middle"
              fontWeight="500"
            >
              {midDateLabel}
            </SvgText>
          )}
          <SvgText
            x={getX(historySlice.length - 1)}
            y={height - 8}
            fontSize="10"
            fill={theme.textSecondary}
            textAnchor="end"
            fontWeight="500"
          >
            {endDateLabel}
          </SvgText>
        </Svg>
      </View>

      {/* Legend Footer */}
      <View className="flex-row justify-around items-center pt-2.5 border-t border-theme-border dark:border-slate-800/80 mt-1">
        <View className="flex-row items-center">
          <View className="w-1.5 h-1.5 rounded-full bg-sky-500 mr-1.5" />
          <Text className="text-xs font-medium text-theme-muted">Fitness (CTL)</Text>
        </View>

        <View className="flex-row items-center">
          <View className="w-1.5 h-1.5 rounded-full bg-rose-500 mr-1.5" />
          <Text className="text-xs font-medium text-theme-muted">Fatigue (ATL)</Text>
        </View>

        <View className="flex-row items-center">
          <View className="w-1.5 h-1.5 rounded-full bg-amber-400 mr-1.5" />
          <Text className="text-xs font-medium text-theme-muted">Form (TSB)</Text>
        </View>
      </View>
    </View>
  );
};
