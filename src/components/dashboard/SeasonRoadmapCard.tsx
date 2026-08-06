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

  // Progress percentage across total phases to position indicator
  const totalPhases = info.phases.length || 4;
  const progressPercent = ((info.currentPhaseIndex + 0.55) / totalPhases) * 100;

  return (
    <Card className="p-4 mb-4 border-theme-border/60 bg-theme-card">
      {/* Clean Header Bar */}
      <View className="flex-row items-center justify-between mb-3.5">
        <View className="flex-row items-center gap-2.5">
          <View className="w-8 h-8 rounded-xl bg-theme-accent/15 border border-theme-accent/30 items-center justify-center">
            <Ionicons name="compass-outline" size={18} color="#16ACBD" />
          </View>
          <Text className="text-base font-extrabold text-theme-text">Training Phase</Text>
        </View>

        {/* Race Countdown Badge */}
        <View className="bg-theme-accent/10 border border-theme-accent/25 px-3 py-1.5 rounded-xl flex-row items-center gap-1.5">
          <Ionicons name="trophy-outline" size={14} color="#16ACBD" />
          <Text className="text-xs font-mono font-extrabold text-theme-accent">
            {info.daysRemaining}d to {info.raceTargetName}
          </Text>
        </View>
      </View>

      {/* 4-Block Timeline Visualizer (With vibrant orange progress fill to the left of the indicator line!) */}
      <TouchableOpacity
        onPress={() => setIsExpanded(!isExpanded)}
        activeOpacity={0.8}
        className="relative w-full h-11 border border-theme-border/70 rounded-xl flex-row bg-theme-bg overflow-hidden mb-2"
      >
        {/* Vibrant Orange Progress Fill Layer */}
        <View
          className="absolute top-0 bottom-0 left-0 bg-[#FF5A1F]/25 border-r border-[#FF5A1F]"
          style={{ width: `${progressPercent}%` }}
        />

        {/* 4 Phase Block Labels (Transparent background so the orange fill is 100% visible!) */}
        {info.phases.map((phase, idx) => {
          const isCurrent = idx === info.currentPhaseIndex;
          const isCompleted = idx < info.currentPhaseIndex;

          return (
            <View
              key={phase.name}
              className={`flex-1 items-center justify-center border-r border-theme-border/40 z-10 bg-transparent ${
                idx === info.phases.length - 1 ? 'border-r-0' : ''
              }`}
            >
              <Text
                className={`text-xs font-extrabold uppercase tracking-wider ${
                  isCurrent
                    ? 'text-theme-accent font-black'
                    : isCompleted
                    ? 'text-theme-text font-bold'
                    : 'text-theme-muted'
                }`}
              >
                {phase.name.replace(' PHASE', '')}
              </Text>
            </View>
          );
        })}

        {/* Today Indicator Line & Badge */}
        <View
          className="absolute top-0 bottom-0 w-[3px] bg-[#FF5A1F] z-20"
          style={{ left: `${progressPercent}%` }}
        >
          <View className="absolute -top-3 -translate-x-1/2 left-0 bg-theme-card border border-theme-accent px-1.5 py-0.2 rounded shadow-sm">
            <Text className="text-[8px] font-extrabold text-theme-accent uppercase">Today</Text>
          </View>
        </View>
      </TouchableOpacity>

      {/* Expand / Collapse Button Bar */}
      <TouchableOpacity
        onPress={() => setIsExpanded(!isExpanded)}
        activeOpacity={0.7}
        className="flex-row items-center justify-between pt-1"
      >
        <Text className="text-xs text-theme-muted font-medium">
          Target Fitness: <Text className="font-extrabold text-theme-text">{info.currentCTL} / {info.targetCTL} CTL</Text>
        </Text>
        <View className="flex-row items-center gap-1">
          <Text className="text-xs font-bold text-theme-accent">
            {isExpanded ? 'Hide Phase Details' : 'View Phase Details'}
          </Text>
          <Ionicons
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={14}
            color="#16ACBD"
          />
        </View>
      </TouchableOpacity>

      {/* Expanded Details Section */}
      {isExpanded && (
        <View className="mt-4 pt-3 border-t border-theme-border/60">
          {/* CTL Progress Metric Bar */}
          <View className="bg-theme-bg/80 p-3 rounded-xl border border-theme-border/60 mb-3">
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

          {/* Phase Cards */}
          <View className="space-y-2.5">
            {info.phases.map((phase) => {
              const isCompleted = phase.status === 'completed';
              const isActive = phase.status === 'active';

              return (
                <View
                  key={phase.name}
                  className={`p-3 rounded-xl border ${
                    isActive
                      ? 'bg-theme-accent-soft/30 border-theme-accent'
                      : isCompleted
                      ? 'bg-theme-bg/50 border-theme-border/50'
                      : 'bg-theme-bg/30 border-theme-border/30 opacity-70'
                  }`}
                >
                  <View className="flex-row items-center justify-between mb-1">
                    <View className="flex-row items-center gap-2">
                      <Text
                        className={`text-xs font-extrabold uppercase tracking-wide ${
                          isActive ? 'text-theme-accent font-black' : 'text-theme-text'
                        }`}
                      >
                        {phase.name}
                      </Text>
                      <Text className="text-xs font-mono text-theme-muted">({phase.weeks})</Text>
                    </View>

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
                  </View>

                  <Text className="text-xs font-bold text-theme-text mb-1">
                    Focus: {phase.focus}
                  </Text>
                  <Text className="text-xs text-theme-muted leading-relaxed">
                    {phase.description}
                  </Text>

                  {isCompleted && phase.achievementLabel && (
                    <View className="mt-1.5 pt-1.5 border-t border-theme-border/40 flex-row items-center justify-between">
                      <Text className="text-xs font-mono font-bold text-emerald-500">
                        {phase.achievementLabel}
                      </Text>
                      <Text className="text-xs font-mono text-theme-muted">
                        {phase.achievedCTL} / {phase.targetCTL} CTL
                      </Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        </View>
      )}
    </Card>
  );
}
