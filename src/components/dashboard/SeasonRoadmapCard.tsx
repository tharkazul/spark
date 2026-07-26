import React from 'react';
import { View, Text } from 'react-native';
import { Card } from '../ui/Card';
import { Ionicons } from '@expo/vector-icons';
import { MacroPeriodInfo } from '../../types/dashboard';

interface SeasonRoadmapCardProps {
  info: MacroPeriodInfo;
}

export function SeasonRoadmapCard({ info }: SeasonRoadmapCardProps) {
  const currentPhase = info.phases[info.currentPhaseIndex] || info.phases[1];

  return (
    <Card className="p-0 overflow-hidden mb-6 border-theme-border shadow-md">
      {/* Header Bar */}
      <View className="px-5 py-4 border-b border-theme-border/70 flex-row justify-between items-center bg-theme-bg/60">
        <View className="flex-row items-center gap-2">
          <View className="w-8 h-8 rounded-xl bg-theme-accent/15 border border-theme-accent/30 items-center justify-center">
            <Ionicons name="map-outline" size={16} color="#16ACBD" />
          </View>
          <View>
            <Text className="text-base font-extrabold text-theme-text">Season Roadmap</Text>
            <Text className="text-[10px] text-theme-muted">16-Week Periodization Blueprint</Text>
          </View>
        </View>

        {/* Countdown Badge */}
        <View className="bg-theme-card border border-theme-accent/40 px-3 py-1.5 rounded-xl shadow-sm flex-row items-center gap-1.5">
          <Ionicons name="flag-outline" size={13} color="#16ACBD" />
          <Text className="text-xs font-mono font-extrabold text-theme-accent">
            {info.daysRemaining} Days · {info.raceTargetName}
          </Text>
        </View>
      </View>

      {/* Main Content Area */}
      <View className="p-5">
        {/* Fitness Target Progress Metric Bar */}
        <View className="bg-theme-bg/80 p-3.5 rounded-2xl border border-theme-border mb-5">
          <View className="flex-row justify-between items-center mb-2">
            <Text className="text-xs font-bold text-theme-text">Fitness Projection (CTL)</Text>
            <Text className="text-xs font-mono font-bold text-theme-accent">
              {info.currentCTL} CTL <Text className="text-theme-muted font-normal">/ Target {info.targetCTL} CTL</Text>
            </Text>
          </View>
          <View className="w-full h-2.5 bg-theme-border/60 rounded-full overflow-hidden">
            <View
              className="h-full bg-theme-accent rounded-full"
              style={{ width: `${Math.min(100, (info.currentCTL / info.targetCTL) * 100)}%` }}
            />
          </View>
        </View>

        {/* Phases Cards Visual Grid */}
        <Text className="text-xs uppercase tracking-widest font-extrabold text-theme-muted mb-3">
          Training Phases
        </Text>

        <View className="space-y-3">
          {info.phases.map((phase, idx) => {
            const isCurrent = idx === info.currentPhaseIndex;

            return (
              <View
                key={phase.name}
                className={`p-4 rounded-2xl border ${
                  isCurrent
                    ? 'bg-theme-accent-soft/30 border-theme-accent shadow-md'
                    : 'bg-theme-card border-theme-border/60 opacity-80'
                }`}
              >
                <View className="flex-row items-center justify-between mb-1.5">
                  <View className="flex-row items-center gap-2">
                    <Text
                      className={`text-sm font-extrabold tracking-wide uppercase ${
                        isCurrent ? 'text-theme-accent' : 'text-theme-text'
                      }`}
                    >
                      {phase.name}
                    </Text>
                    <Text className="text-xs font-mono text-theme-muted">({phase.weeks})</Text>
                  </View>

                  {isCurrent && (
                    <View className="bg-theme-accent px-2.5 py-0.5 rounded-full flex-row items-center gap-1 shadow-sm">
                      <View className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                      <Text className="text-[9px] font-extrabold text-white uppercase tracking-wider">
                        ACTIVE PHASE
                      </Text>
                    </View>
                  )}
                </View>

                {/* Phase Focus Description */}
                <Text className="text-xs text-theme-muted mb-2 font-medium">
                  Focus: {phase.focus}
                </Text>

                {/* Phase completion progress for active phase */}
                {isCurrent && (
                  <View className="mt-1 pt-2 border-t border-theme-accent/20">
                    <View className="flex-row justify-between items-center text-[10px] mb-1">
                      <Text className="text-[10px] font-bold text-theme-accent">Phase Progress</Text>
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
    </Card>
  );
}
