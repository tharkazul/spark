import React, { useState } from 'react';
import { useTheme } from '@/hooks/use-theme';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { MacroPeriodInfo } from '../../types/dashboard';

interface SeasonRoadmapCardProps {
  info: MacroPeriodInfo;
}

export function SeasonRoadmapCard({ info }: SeasonRoadmapCardProps) {
    const theme = useTheme();
  const [isExpanded, setIsExpanded] = useState(false);

  const totalPhases = info.phases.length || 4;
  const progressPercent = ((info.currentPhaseIndex + 0.55) / totalPhases) * 100;

  const toggleExpand = () => {
    Haptics.selectionAsync();
    setIsExpanded((prev) => !prev);
  };

  return (
    <View>
      {/* Header Bar matching TodaysPlanCard header format */}
      <TouchableOpacity
        onPress={toggleExpand}
        activeOpacity={0.75}
        className="flex-row items-center gap-3 pb-3 mb-3.5 border-b border-theme-border/50"
      >
        <View className="w-10 h-10 rounded-xl bg-theme-accent/15 items-center justify-center">
          <Ionicons name="compass-outline" size={20} color={theme.tint} />
        </View>

        <View className="flex-1">
          <View className="flex-row items-center gap-1.5">
            <Text className="text-lg font-extrabold text-theme-text">Training Phase</Text>
            <Ionicons
              name={isExpanded ? 'chevron-up' : 'chevron-down'}
              size={15}
              color={theme.tint}
            />
          </View>

          {/* The countdown reads as a line of text rather than a pill beside
              the title. A pill cannot grow or wrap, so "Ironman 70.3" already
              ran off the card and "Marathon des Sables" would be far worse.
              This is the same title-over-meta shape DetailedDayCard uses. */}
          <Text className="text-sm text-theme-muted">
            <Text className="font-extrabold text-theme-accent">
              {info.daysRemaining} {info.daysRemaining === 1 ? 'day' : 'days'}
            </Text>
            {' to '}
            {info.raceTargetName}
          </Text>
        </View>
      </TouchableOpacity>

      {/* 4-Block Timeline Visualizer Box */}
      <TouchableOpacity
        onPress={toggleExpand}
        activeOpacity={0.85}
        className="relative w-full h-11 rounded-2xl flex-row bg-theme-bg overflow-hidden"
      >
        {/* Progress Fill Layer */}
        <View
          className="absolute top-0 bottom-0 left-0 bg-theme-accent/20"
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
                className={`text-xs font-extrabold ${
                  isCurrent
                    ? 'text-theme-accent font-extrabold'
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
          className="absolute top-0 bottom-0 w-[2.5px] bg-theme-accent z-20"
          style={{ left: `${progressPercent}%` }}
        >
          <View className="absolute -top-2.5 -translate-x-1/2 left-0 bg-theme-card px-1 py-0.2 rounded shadow-sm">
            <Text className="text-xs font-extrabold text-theme-accent">Today</Text>
          </View>
        </View>
      </TouchableOpacity>

      {/* Expanded Details Section */}
      {isExpanded && (
        <View className="mt-4 pt-3.5">
          {/* Fitness Projection Bar */}
          <View className="bg-theme-bg/50 p-3 rounded-2xl mb-3 border border-theme-border/40">
            <View className="flex-row justify-between items-center mb-1.5">
              <Text className="text-sm font-bold text-theme-text">Fitness Projection (CTL)</Text>
              <Text className="text-sm font-mono font-bold text-theme-accent">
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
          <View className="gap-y-2.5">
            {info.phases.map((phase) => {
              const isCompleted = phase.status === 'completed';
              const isActive = phase.status === 'active';

              return (
                <View
                  key={phase.name}
                  className={`p-3 rounded-2xl border ${
                    isActive
                      ? 'bg-theme-accent-soft border-theme-accent'
                      : isCompleted
                      ? 'bg-theme-bg/50 border-theme-border/60'
                      : 'bg-theme-bg/30 border-theme-border/40 opacity-70'
                  }`}
                >
                  <View className="flex-row items-center justify-between mb-1">
                    <View className="flex-row items-center gap-1.5">
                      <Text
                        className={`text-sm font-extrabold ${
                          isActive ? 'text-theme-accent font-extrabold' : 'text-theme-text'
                        }`}
                      >
                        {phase.name}
                      </Text>
                      <Text className="text-xs font-mono text-theme-muted">({phase.weeks})</Text>
                    </View>

                    {isCompleted && (
                      <View className="flex-row items-center gap-1 bg-semantic-success/15 px-2 py-0.5 rounded-full">
                        <Ionicons name="checkmark-circle" size={11} color="#10B981" />
                        <Text className="text-xs font-extrabold text-semantic-success">DONE</Text>
                      </View>
                    )}

                    {isActive && (
                      <View className="bg-theme-accent px-2 py-0.5 rounded-full">
                        <Text className="text-xs font-extrabold text-white">ACTIVE</Text>
                      </View>
                    )}
                  </View>

                  <Text className="text-sm font-bold text-theme-text mb-0.5">
                    Focus: {phase.focus}
                  </Text>
                  <Text className="text-sm text-theme-muted leading-relaxed">
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
