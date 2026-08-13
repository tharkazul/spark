import React, { useState } from 'react';
import { View, Text, TouchableOpacity, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Rect, Path, Circle, Line } from 'react-native-svg';
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

export const PMCComboChart: React.FC<PMCComboChartProps> = ({
  activities = [],
  physiqueLogs = [],
  targetCtl = 75,
  height = 220,
}) => {
  const { width: windowWidth } = useWindowDimensions();
  const chartWidth = Math.max(320, windowWidth - 64);

  const [zoomLevel, setZoomLevel] = useState<number>(1); // 1 = 14 days, 2 = 30 days, 3 = 60 days
  const [selectedPoint, setSelectedPoint] = useState<PMCDayPoint | null>(null);

  const goalMilestones = targetCtl
    ? [{ date: new Date().toISOString().split('T')[0], target_ctl: targetCtl, name: 'Target Race' }]
    : [];

  const pmcResult = calculatePMC(activities, physiqueLogs, goalMilestones);
  const fullHistory = pmcResult.history;

  // Filter history based on zoom level (14, 30, or 60 days)
  const displayDays = zoomLevel === 1 ? 14 : zoomLevel === 2 ? 30 : 60;
  const historySlice = fullHistory.slice(-displayDays);

  if (historySlice.length === 0) {
    return (
      <View className="bg-theme-card border border-theme-border rounded-2xl p-5 items-center justify-center min-h-[200px]">
        <Ionicons name="stats-chart-outline" size={32} color="#6F6F79" />
        <Text className="text-sm font-bold text-theme-muted mt-2">No PMC Data Available</Text>
      </View>
    );
  }

  // Calculate scales
  const ctlValues = historySlice.map((h) => h.ctl);
  const atlValues = historySlice.map((h) => h.atl);
  const tsbValues = historySlice.map((h) => h.tsb);

  const maxVal = Math.max(10, ...ctlValues, ...atlValues, targetCtl);
  const minVal = Math.min(-30, ...tsbValues);
  const valRange = maxVal - minVal || 1;

  const paddingBottom = 30;
  const paddingTop = 20;
  const graphHeight = height - paddingBottom - paddingTop;

  const getX = (index: number) => {
    if (historySlice.length <= 1) return 20;
    return 20 + (index / (historySlice.length - 1)) * (chartWidth - 40);
  };

  const getY = (val: number) => {
    const ratio = (val - minVal) / valRange;
    return height - paddingBottom - ratio * graphHeight;
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

  const handleZoomToggle = () => {
    Haptics.selectionAsync();
    setZoomLevel((prev) => (prev % 3) + 1);
  };

  const handleResetZoom = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setZoomLevel(1);
    setSelectedPoint(null);
  };

  return (
    <View className="bg-theme-card border border-theme-border rounded-2xl p-4 shadow-sm mb-5">
      {/* Header with Title and Reset Zoom */}
      <View className="flex-row justify-between items-center mb-3">
        <View className="flex-row items-center space-x-2">
          <Ionicons name="analytics" size={18} color="#FF5F3B" />
          <Text className="text-xs font-extrabold text-theme-text uppercase tracking-wider">
            Training Load History (PMC)
          </Text>
        </View>

        <View className="flex-row items-center space-x-2">
          <TouchableOpacity
            onPress={handleZoomToggle}
            className="px-2.5 py-1 bg-theme-bg border border-theme-border rounded-lg"
          >
            <Text className="text-[10px] font-bold text-theme-muted">
              Range: {displayDays}D
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleResetZoom}
            className="px-2.5 py-1 bg-theme-accent/15 border border-theme-accent/30 rounded-lg"
          >
            <Text className="text-[10px] font-extrabold text-theme-accent">Reset</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Selected Point Banner */}
      {selectedPoint && (
        <View className="bg-theme-bg p-2.5 rounded-xl mb-2 flex-row justify-between items-center border border-theme-border">
          <Text className="text-xs font-mono font-bold text-theme-muted">{selectedPoint.date}</Text>
          <View className="flex-row gap-3">
            <Text className="text-xs font-bold text-sky-400">CTL: {selectedPoint.ctl.toFixed(1)}</Text>
            <Text className="text-xs font-bold text-rose-400">ATL: {selectedPoint.atl.toFixed(1)}</Text>
            <Text className={`text-xs font-bold ${selectedPoint.tsb >= 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
              TSB: {selectedPoint.tsb.toFixed(1)}
            </Text>
          </View>
        </View>
      )}

      {/* SVG Chart Surface */}
      <View style={{ height, width: '100%' }}>
        <Svg width="100%" height={height} viewBox={`0 0 ${chartWidth} ${height}`}>
          {/* Zero baseline */}
          <Line x1="10" y1={zeroY} x2={chartWidth - 10} y2={zeroY} stroke="#3f3f46" strokeWidth="1" strokeDasharray="4 4" />

          {/* Target CTL line */}
          {targetCtl > 0 && (
            <Line x1="10" y1={getY(targetCtl)} x2={chartWidth - 10} y2={getY(targetCtl)} stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="6 4" />
          )}

          {/* Form (TSB) Bars */}
          {historySlice.map((pt, idx) => {
            const x = getX(idx) - 3;
            const barY = pt.tsb >= 0 ? getY(pt.tsb) : zeroY;
            const barHeight = Math.max(2, Math.abs(getY(pt.tsb) - zeroY));
            const barColor = pt.tsb >= 0 ? 'rgba(250, 204, 21, 0.5)' : 'rgba(239, 68, 68, 0.5)';

            return (
              <Rect
                key={`bar-${idx}`}
                x={x}
                y={barY}
                width={6}
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
          <Path d={atlPath} fill="none" stroke="#f43f5e" strokeWidth="1.5" strokeDasharray="4 4" />

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
        </Svg>
      </View>

      {/* Legend Footer */}
      <View className="flex-row justify-around items-center pt-3 border-t border-theme-border/40 mt-1">
        <View className="flex-row items-center space-x-1.5">
          <View className="w-2.5 h-2.5 rounded-full bg-sky-500" />
          <Text className="text-[10px] font-bold text-theme-muted">Fitness (CTL)</Text>
        </View>

        <View className="flex-row items-center space-x-1.5">
          <View className="w-2.5 h-2.5 rounded-full bg-rose-500" />
          <Text className="text-[10px] font-bold text-theme-muted">Fatigue (ATL)</Text>
        </View>

        <View className="flex-row items-center space-x-1.5">
          <View className="w-2.5 h-2.5 rounded-full bg-amber-400" />
          <Text className="text-[10px] font-bold text-theme-muted">Form (TSB)</Text>
        </View>
      </View>
    </View>
  );
};
