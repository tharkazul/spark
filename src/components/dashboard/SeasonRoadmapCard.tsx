import React, { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { MacroPeriodInfo } from '../../types/dashboard';

interface SeasonRoadmapCardProps {
  info: MacroPeriodInfo;
}

export function SeasonRoadmapCard({ info }: SeasonRoadmapCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const totalPhases = info.phases.length || 4;
  const progressPercent = ((info.currentPhaseIndex + 0.55) / totalPhases) * 100;

  const toggleExpand = () => {
    Haptics.selectionAsync();
    setIsExpanded((prev) => !prev);
  };

  return (
    <View className="p-4 md:p-5 rounded-3xl bg-theme-card/80 shadow-sm mb-5">
      {/* Header Bar */}
      <TouchableOpacity
        onPress={toggleExpand}
        activeOpacity={0.75}
        className="flex-row items-center justify-between pb-3 mb-3.5"
      >
        <View className="flex-row items-center gap-3">
          <View className="w-10 h-10 rounded-2xl bg-theme-accent/15 items-center justify-center">
            <Ionicons name="compass-outline" size={20} color="#38BDF8" />
          </View>

          <View className="flex-row items-center gap-1.5">
            <Text className="text-base font-extrabold text-theme-text">Training Phase</Text>
            <Ionicons
              name={isExpanded ? 'chevron-up' : 'chevron-down'}
              size={15}
              color="#38BDF8"
            />
          </View>
        </View>

        {/* Race Countdown Badge */}
        <View className="bg-theme-bg/60 px-3 py-1.5 rounded-full flex-row items-center gap-1.5 shadow-sm">
          <Ionicons name="trophy-outline" size={13} color="#38BDF8" />
          <Text className="text-xs font-mono font-extrabold text-theme-accent">
            {info.daysRemaining}d to {info.raceTargetName}
          </Text>
        </View>
      </TouchableOpacity>

      {/* 4-Block Timeline Visualizer Box */}
      <TouchableOpacity
        onPress={toggleExpand}
        activeOpacity={0.85}
        className="relative w-full h-11 rounded-2xl flex-row bg-theme-bg/60 overflow-hidden"
      >
        {/* Progress Fill Layer */}
        <View
          className="absolute top-0 bottom-0 left-0 bg-[#F97316]/25"
          style={{ width: `${progressPercent}%` }}
        />

        {/* 4 Phase Block Labels */}
        {info.phases.map((phase, idx) => {
          const isCurrent = idx === info.currentPhaseIndex;
          const isCompleted = idx < info.currentPhaseIndex;

          return (
            <View
              key={phase.name}
              className="flex-1 items-center justify-center z-10 bg-transparent"
            >
              <Text
                className={`text-[11px] font-extrabold uppercase tracking-wider ${
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
          className="absolute top-0 bottom-0 w-[2.5px] bg-[#F97316] z-20"
          style={{ left: `${progressPercent}%` }}
        >
          <View className="absolute -top-2.5 -translate-x-1/2 left-0 bg-theme-card px-1 py-0.2 rounded shadow-sm">
            <Text className="text-[7.5px] font-extrabold text-theme-accent uppercase">Today</Text>
          </View>
        </View>
      </TouchableOpacity>

      {/* Expanded Details Section */}
      {isExpanded && (
        <View className="mt-4 pt-3.5">
          {/* Fitness Projection Bar */}
          <View className="bg-theme-bg/50 p-3 rounded-2xl mb-3">
            <View className="flex-row justify-between items-center mb-1.5">
              <Text className="text-xs font-bold text-theme-text">Fitness Projection (CTL)</Text>
              <Text className="text-xs font-mono font-bold text-theme-accent">
                {info.currentCTL} CTL <Text className="text-theme-muted font-normal">/ Target {info.targetCTL} CTL</Text>
              </Text>
            </View>
            <View className="w-full h-2 bg-theme-bg/80 rounded-full overflow-hidden">
              <View
                className="h-full bg-theme-accent rounded-full"
                style={{ width: `${Math.min(100, (info.currentCTL / info.targetCTL) * 100)}%` }}
              />
            </View>
          </View>

          {/* Phase Cards List */}
          <View className="space-y-2.5">
            {info.phases.map((phase) => {
              const isCompleted = phase.status === 'completed';
              const isActive = phase.status === 'active';

              return (
                <View
                  key={phase.name}
                  className={`p-3 rounded-2xl ${
                    isActive
                      ? 'bg-theme-accent-soft/30'
                      : isCompleted
                      ? 'bg-theme-bg/50'
                      : 'bg-theme-bg/30 opacity-70'
                  }`}
                >
                  <View className="flex-row items-center justify-between mb-1">
                    <View className="flex-row items-center gap-1.5">
                      <Text
                        className={`text-xs font-extrabold uppercase tracking-wide ${
                          isActive ? 'text-theme-accent font-black' : 'text-theme-text'
                        }`}
                      >
                        {phase.name}
                      </Text>
                      <Text className="text-[11px] font-mono text-theme-muted">({phase.weeks})</Text>
                    </View>

                    {isCompleted && (
                      <View className="flex-row items-center gap-1 bg-emerald-500/15 px-2 py-0.5 rounded-full">
                        <Ionicons name="checkmark-circle" size={11} color="#10B981" />
                        <Text className="text-[8.5px] font-extrabold text-emerald-500">DONE</Text>
                      </View>
                    )}

                    {isActive && (
                      <View className="bg-theme-accent px-2 py-0.5 rounded-full">
                        <Text className="text-[8.5px] font-extrabold text-white uppercase">ACTIVE</Text>
                      </View>
                    )}
                  </View>

                  <Text className="text-xs font-bold text-theme-text mb-0.5">
                    Focus: {phase.focus}
                  </Text>
                  <Text className="text-xs text-theme-muted leading-relaxed">
                    {phase.description}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
}
