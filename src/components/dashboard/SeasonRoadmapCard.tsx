import React, { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Card } from '../ui/Card';
import { Ionicons } from '@expo/vector-icons';
import { MacroPeriodInfo } from '../../types/dashboard';

interface SeasonRoadmapCardProps {
  info: MacroPeriodInfo;
}

export function SeasonRoadmapCard({ info }: SeasonRoadmapCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const currentPhase = info.phases[info.currentPhaseIndex] || info.phases[1];

  // Calculate timeline progress percentage to position the indicator line & fill
  const totalPhases = info.phases.length || 4;
  const progressPercent = ((info.currentPhaseIndex + 0.55) / totalPhases) * 100;

  return (
    <Card className="p-0 overflow-hidden mb-4 border-theme-border shadow-sm">
      {/* Header Bar (Responsive & Room for Long Target Names) */}
      <TouchableOpacity
        onPress={() => setIsExpanded(!isExpanded)}
        activeOpacity={0.8}
        className="px-4 py-3 border-b border-theme-border/60 flex-row items-center justify-between gap-2 bg-theme-bg/60"
      >
        {/* Title */}
        <View className="flex-row items-center gap-2 shrink-0">
          <View className="w-7 h-7 rounded-lg bg-theme-accent/15 border border-theme-accent/30 items-center justify-center">
            <Ionicons name="map-outline" size={14} color="#16ACBD" />
          </View>
          <Text className="text-sm font-extrabold text-theme-text">Training Phase</Text>
        </View>

        {/* Dynamic Target Race Pill (Flex Shrink + Ellipsis to grow gracefully without overlapping!) */}
        <View className="flex-1 flex-row items-center justify-end gap-1.5 min-w-0">
          <View className="bg-theme-card border border-theme-border px-2.5 py-1 rounded-lg shadow-sm flex-row items-center gap-1 shrink flex-1 max-w-[200px] justify-end">
            <Text
              numberOfLines={1}
              ellipsizeMode="tail"
              className="text-xs font-mono font-bold text-theme-accent text-right"
            >
              {info.daysRemaining}d to {info.raceTargetName}
            </Text>
          </View>

          <Ionicons
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={16}
            color="#8E9BA4"
            className="shrink-0"
          />
        </View>
      </TouchableOpacity>

      {/* Main 4-Block Timeline Visualizer */}
      <View className="p-4 bg-theme-card">
        <View className="relative w-full h-11 border border-theme-border rounded-xl flex-row bg-theme-bg overflow-hidden shadow-inner mb-3">
          {/* Progress fill to the left of the indicator line */}
          <View
            className="absolute top-0 bottom-0 left-0 bg-theme-accent/25 z-0"
            style={{ width: `${progressPercent}%` }}
          />

          {/* 4 Stage Block Labels */}
          {info.phases.map((phase, idx) => {
            const isCurrent = idx === info.currentPhaseIndex;
            return (
              <View
                key={phase.name}
                className={`flex-1 items-center justify-center border-r border-theme-border/60 z-10 ${
                  idx === info.phases.length - 1 ? 'border-r-0' : ''
                }`}
              >
                <Text
                  className={`text-[9px] font-extrabold uppercase tracking-widest ${
                    isCurrent ? 'text-theme-accent' : 'text-theme-muted'
                  }`}
                >
                  {phase.name.replace(' PHASE', '')}
                </Text>
              </View>
            );
          })}

          {/* Indicator Line & Today Badge (Circles removed!) */}
          <View
            className="absolute top-0 bottom-0 w-[2px] bg-theme-accent z-20 shadow-md"
            style={{ left: `${progressPercent}%` }}
          >
            {/* Today Badge on Top */}
            <View className="absolute -top-3.5 -translate-x-1/2 left-0 bg-theme-card border border-theme-accent px-1.5 py-0.2 rounded shadow-sm">
              <Text className="text-[8px] font-extrabold text-theme-accent uppercase">Today</Text>
            </View>
          </View>
        </View>

        {/* Phase Summary Row */}
        <TouchableOpacity
          onPress={() => setIsExpanded(!isExpanded)}
          activeOpacity={0.7}
          className="flex-row items-center justify-between"
        >
          <Text className="text-xs text-theme-muted">
            Current: <Text className="font-extrabold text-theme-accent">{currentPhase.name}</Text>
          </Text>
          <Text className="text-[11px] font-bold text-theme-accent flex-row items-center">
            {isExpanded ? 'Hide Details' : 'View Phase Details'} →
          </Text>
        </TouchableOpacity>

        {/* Expanded Details Section */}
        {isExpanded && (
          <View className="mt-4 pt-3 border-t border-theme-border/60">
            {/* Fitness Projection (CTL) Metric Bar */}
            <View className="bg-theme-bg/80 p-3 rounded-xl border border-theme-border mb-4">
              <View className="flex-row justify-between items-center mb-1.5">
                <Text className="text-xs font-bold text-theme-text">Fitness Projection (CTL)</Text>
                <Text className="text-xs font-mono font-bold text-theme-accent">
                  {info.currentCTL} CTL <Text className="text-theme-muted font-normal">/ Target {info.targetCTL} CTL</Text>
                </Text>
              </View>
              <View className="w-full h-2 bg-theme-border/60 rounded-full overflow-hidden">
                <View
                  className="h-full bg-theme-accent rounded-full"
                  style={{ width: `${Math.min(100, (info.currentCTL / info.targetCTL) * 100)}%` }}
                />
              </View>
            </View>

            {/* Expanded Detailed Phase Cards */}
            <View className="space-y-3">
              {info.phases.map((phase) => {
                const isCompleted = phase.status === 'completed';
                const isActive = phase.status === 'active';

                return (
                  <View
                    key={phase.name}
                    className={`p-3.5 rounded-2xl border ${
                      isActive
                        ? 'bg-theme-accent-soft/30 border-theme-accent'
                        : isCompleted
                        ? 'bg-theme-bg/40 border-theme-border/60'
                        : 'bg-theme-bg/30 border-theme-border/40 opacity-75'
                    }`}
                  >
                    {/* Phase Title Row */}
                    <View className="flex-row items-center justify-between mb-1">
                      <View className="flex-row items-center gap-2">
                        <Text
                          className={`text-xs font-extrabold uppercase tracking-wide ${
                            isActive
                              ? 'text-theme-accent font-black'
                              : isCompleted
                              ? 'text-theme-text'
                              : 'text-theme-muted'
                          }`}
                        >
                          {phase.name}
                        </Text>
                        <Text className="text-xs font-mono text-theme-muted font-medium">
                          ({phase.weeks})
                        </Text>
                      </View>

                      {/* Status Badges */}
                      {isCompleted && (
                        <View className="flex-row items-center gap-1 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                          <Ionicons name="checkmark-circle" size={12} color="#10B981" />
                          <Text className="text-[9px] font-extrabold text-emerald-500">DONE</Text>
                        </View>
                      )}

                      {isActive && (
                        <View className="bg-theme-accent px-2 py-0.5 rounded-full">
                          <Text className="text-[9px] font-extrabold text-white uppercase">ACTIVE</Text>
                        </View>
                      )}

                      {!isCompleted && !isActive && (
                        <View className="bg-theme-border/50 px-2 py-0.5 rounded-full">
                          <Text className="text-[9px] font-bold text-theme-muted uppercase">UPCOMING</Text>
                        </View>
                      )}
                    </View>

                    {/* Primary Focus Tag */}
                    <Text className="text-xs font-bold text-theme-text mb-1">
                      Focus: {phase.focus}
                    </Text>

                    {/* Detailed Training Stimulus Description */}
                    <Text className="text-[11px] text-theme-muted leading-relaxed mb-1.5">
                      {phase.description}
                    </Text>

                    {/* Completion Stats for Finished Phase */}
                    {isCompleted && phase.achievementLabel && (
                      <View className="mt-1 pt-1.5 border-t border-theme-border/40 flex-row items-center justify-between">
                        <Text className="text-[10px] font-mono font-bold text-emerald-500">
                          {phase.achievementLabel}
                        </Text>
                        {phase.targetCTL && phase.achievedCTL && (
                          <Text className="text-[10px] font-mono text-theme-muted">
                            {phase.achievedCTL} / {phase.targetCTL} CTL
                          </Text>
                        )}
                      </View>
                    )}

                    {/* Progress bar for Active Phase */}
                    {isActive && (
                      <View className="mt-2 pt-2 border-t border-theme-accent/20">
                        <View className="flex-row justify-between items-center mb-1">
                          <Text className="text-[10px] font-bold text-theme-accent">Phase Completion</Text>
                          <Text className="text-[10px] font-mono font-bold text-theme-accent">
                            {phase.progressPercent}%
                          </Text>
                        </View>
                        <View className="w-full h-1.5 bg-theme-accent/20 rounded-full overflow-hidden">
                          <View
                            className="h-full bg-theme-accent rounded-full"
                            style={{ width: `${phase.progressPercent}%` }}
                          />
                        </View>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        )}
      </View>
    </Card>
  );
}
