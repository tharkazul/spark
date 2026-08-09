import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SubscriptionTier } from '../../types/user';
import { Sparkline } from '../common/Sparkline';

interface PMCMetricsProps {
  ctl?: number;
  atl?: number;
  tsb?: number;
  readinessScore?: number;
  weightKg?: number;
  ctlDelta?: number;
  atlDelta?: number;
  ctlHistory?: number[];
  atlHistory?: number[];
  tsbHistory?: number[];
  weightHistory?: number[];
  tier?: SubscriptionTier;
}

export const PMCMetricsCard: React.FC<PMCMetricsProps> = ({
  ctl = 64.2,
  atl = 72.1,
  tsb = -7.9,
  readinessScore,
  weightKg = 74.5,
  ctlDelta = 1.4,
  atlDelta = 3.2,
  ctlHistory = [58, 59, 60, 61.5, 62.8, 63.5, 64.2],
  atlHistory = [65, 68, 67, 70, 71.5, 70.8, 72.1],
  tsbHistory = [-7, -9, -7, -8.5, -8.7, -7.3, -7.9],
  weightHistory = [75.2, 75.0, 74.8, 74.7, 74.6, 74.5, 74.5],
  tier = 'free',
}) => {
  // Calculate Readiness score if not provided directly
  const computedReadiness = readinessScore !== undefined 
    ? readinessScore 
    : Math.max(0, Math.min(100, Math.round(50 + Math.max(-20, Math.min(20, tsb * 0.5)))));

  let readinessBadge = { text: 'Optimal Building', color: 'text-emerald-500', bg: 'bg-emerald-500/10', border: '' };
  if (computedReadiness < 40 || tsb < -30) {
    readinessBadge = { text: 'High Fatigue / Rest Needed', color: 'text-red-500', bg: 'bg-red-500/10', border: '' };
  } else if (computedReadiness < 65 || tsb < -10) {
    readinessBadge = { text: 'Productive Build', color: 'text-theme-accent', bg: 'bg-theme-accent/10', border: '' };
  } else if (tsb > 10) {
    readinessBadge = { text: 'Race Ready / Fresh', color: 'text-emerald-400', bg: 'bg-emerald-400/10', border: '' };
  }

  return (
    <View className="mb-4">
      {/* Metric Section Header */}
      <View className="flex-row items-center justify-between mb-3 px-1">
        <View className="flex-row items-center space-x-2">
          <Ionicons name="pulse-outline" size={18} color="#FF5A1F" />
          <Text className="text-xs font-bold text-theme-text uppercase tracking-wider">
            Performance Management (PMC)
          </Text>
        </View>
        {tier === 'spark_plus' && (
          <View className="bg-amber-500/15 px-2 py-0.5 rounded-full flex-row items-center">
            <Ionicons name="flash" size={10} color="#f59e0b" className="mr-1" />
            <Text className="text-[10px] text-amber-500 font-bold">Spark Plus AI</Text>
          </View>
        )}
      </View>

      {/* 4 Grid Metric Cards with Sparklines */}
      <View className="flex-row flex-wrap gap-2.5">
        {/* CTL Card */}
        <View className="flex-1 min-w-[45%] bg-theme-card rounded-2xl p-3.5 shadow-sm">
          <View className="flex-row justify-between items-start mb-1">
            <Text className="text-[10px] font-bold text-theme-muted uppercase tracking-wider">
              Fitness (CTL)
            </Text>
            <View className="flex-row items-center bg-emerald-500/10 px-1.5 py-0.5 rounded-md">
              <Ionicons name="arrow-up" size={10} color="#10b981" />
              <Text className="text-[10px] font-bold text-emerald-500 ml-0.5">
                +{ctlDelta.toFixed(1)}
              </Text>
            </View>
          </View>
          <Text className="text-2xl font-extrabold text-theme-text font-barlow tracking-tight mb-2">
            {ctl.toFixed(1)}
          </Text>

          {/* Sparkline Graph */}
          <Sparkline
            data={ctlHistory}
            color="#10b981"
            gradientFrom="#10b98144"
            gradientTo="#10b98100"
            height={32}
            width={120}
          />
          <Text className="text-[9px] text-theme-muted mt-1">42-day Chronic Load</Text>
        </View>

        {/* ATL Card */}
        <View className="flex-1 min-w-[45%] bg-theme-card rounded-2xl p-3.5 shadow-sm">
          <View className="flex-row justify-between items-start mb-1">
            <Text className="text-[10px] font-bold text-theme-muted uppercase tracking-wider">
              Fatigue (ATL)
            </Text>
            <View className="flex-row items-center bg-amber-500/10 px-1.5 py-0.5 rounded-md">
              <Ionicons name="arrow-up" size={10} color="#f59e0b" />
              <Text className="text-[10px] font-bold text-amber-500 ml-0.5">
                +{atlDelta.toFixed(1)}
              </Text>
            </View>
          </View>
          <Text className="text-2xl font-extrabold text-theme-text font-barlow tracking-tight mb-2">
            {atl.toFixed(1)}
          </Text>

          {/* Sparkline Graph */}
          <Sparkline
            data={atlHistory}
            color="#f59e0b"
            gradientFrom="#f59e0b44"
            gradientTo="#f59e0b00"
            height={32}
            width={120}
          />
          <Text className="text-[9px] text-theme-muted mt-1">7-day Acute Load</Text>
        </View>

        {/* Readiness (TSB) Card */}
        <View className="flex-1 min-w-[45%] bg-theme-card rounded-2xl p-3.5 shadow-sm">
          <View className="flex-row justify-between items-start mb-1">
            <Text className="text-[10px] font-bold text-theme-muted uppercase tracking-wider">
              Readiness (TSB)
            </Text>
            <Text className={`text-[10px] font-bold ${tsb >= 0 ? 'text-emerald-500' : 'text-amber-500'}`}>
              TSB {tsb > 0 ? `+${tsb.toFixed(1)}` : tsb.toFixed(1)}
            </Text>
          </View>
          <Text className={`text-2xl font-extrabold font-barlow tracking-tight mb-2 ${readinessBadge.color}`}>
            {computedReadiness}<Text className="text-xs text-theme-muted">/100</Text>
          </Text>

          {/* Sparkline Graph */}
          <Sparkline
            data={tsbHistory}
            color={tsb >= 0 ? '#10b981' : '#3b82f6'}
            gradientFrom={tsb >= 0 ? '#10b98144' : '#3b82f644'}
            gradientTo="#3b82f600"
            height={32}
            width={120}
          />
          <View className={`self-start mt-1.5 px-2 py-0.5 rounded-full ${readinessBadge.bg}`}>
            <Text className={`text-[9px] font-bold ${readinessBadge.color}`}>
              {readinessBadge.text}
            </Text>
          </View>
        </View>

        {/* Body Weight Trend Card */}
        <View className="flex-1 min-w-[45%] bg-theme-card rounded-2xl p-3.5 shadow-sm">
          <View className="flex-row justify-between items-start mb-1">
            <Text className="text-[10px] font-bold text-theme-muted uppercase tracking-wider">
              Body Weight
            </Text>
            <Ionicons name="scale-outline" size={12} color="#FF5A1F" />
          </View>
          <Text className="text-2xl font-extrabold text-theme-text font-barlow tracking-tight mb-2">
            {weightKg.toFixed(1)} <Text className="text-xs text-theme-muted font-normal">kg</Text>
          </Text>

          {/* Sparkline Graph */}
          <Sparkline
            data={weightHistory}
            color="#FF5A1F"
            gradientFrom="#FF5A1F44"
            gradientTo="#FF5A1F00"
            height={32}
            width={120}
          />
          <Text className="text-[9px] text-theme-muted mt-1">7-day EMA Trendline</Text>
        </View>
      </View>
    </View>
  );
};
