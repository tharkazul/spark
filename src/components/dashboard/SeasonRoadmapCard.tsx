import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Card } from '../ui/Card';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { MacroPeriodInfo } from '../../types/dashboard';

interface SeasonRoadmapCardProps {
  info: MacroPeriodInfo;
  resetStageKey?: number | string;
}

export function SeasonRoadmapCard({ info, resetStageKey }: SeasonRoadmapCardProps) {
  // Stage 1 = Most Minimal, Stage 2 = Intermediate Detail, Stage 3 = Most Detailed
  const [stage, setStage] = useState<1 | 2 | 3>(1);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(info.currentPhaseIndex);

  // Auto reset to Stage 1 whenever navigating to planning page
  useEffect(() => {
    setStage(1);
    setExpandedIndex(null);
  }, [resetStageKey]);

  const handleStage1Click = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setStage(2);
  };

  const handlePhaseClick = (idx: number) => {
    Haptics.selectionAsync();
    if (stage === 2) {
      setStage(3);
      setExpandedIndex(idx);
    } else if (stage === 3) {
      if (expandedIndex === idx) {
        setExpandedIndex(null);
        setStage(2);
      } else {
        setExpandedIndex(idx);
      }
    }
  };

  const handleCollapseToStage1 = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setStage(1);
    setExpandedIndex(null);
  };

  // Calculate cumulative season progress percentage for the "Today" pin
  const totalWeeks = info.phases.reduce((acc, p) => acc + (parseInt(p.weeks, 10) || 4), 0);
  let weeksPassed = 0;
  for (let i = 0; i < info.currentPhaseIndex; i++) {
    weeksPassed += parseInt(info.phases[i].weeks, 10) || 4;
  }
  const currentPhaseWeeks = parseInt(info.phases[info.currentPhaseIndex]?.weeks, 10) || 4;
  const currentPhaseProgress = (info.phases[info.currentPhaseIndex]?.progressPercent || 0) / 100;
  weeksPassed += currentPhaseWeeks * currentPhaseProgress;
  const todayProgressPercent = Math.min(96, Math.max(4, Math.round((weeksPassed / (totalWeeks || 16)) * 100)));

  return (
    <Card className="p-0 overflow-hidden mb-3.5 border-theme-border shadow-md">
      {/* Header Bar */}
      <View className="px-4 py-2.5 border-b border-theme-border/70 flex-row justify-between items-center bg-theme-bg/60">
        <View className="flex-row items-center gap-2">
          <View className="w-7 h-7 rounded-lg bg-theme-accent/15 border border-theme-accent/30 items-center justify-center">
            <Ionicons name="map-outline" size={14} color="#16ACBD" />
          </View>
          <View>
            <Text className="text-sm font-extrabold text-theme-text">Season Roadmap</Text>
            <Text className="text-[9px] text-theme-muted">16-Week Periodization Blueprint</Text>
          </View>
        </View>

        {/* Countdown Badge */}
        <View className="bg-theme-card border border-theme-accent/40 px-2.5 py-1 rounded-lg shadow-sm flex-row items-center gap-1">
          <Ionicons name="flag-outline" size={12} color="#16ACBD" />
          <Text className="text-[10px] font-mono font-extrabold text-theme-accent">
            {info.daysRemaining} Days · {info.raceTargetName}
          </Text>
        </View>
      </View>

      {/* Main Content Area */}
      <View className="p-3.5">
        {/* Fitness Target Progress Metric Bar (Shown in all stages) */}
        <View className="bg-theme-bg/80 p-3 rounded-xl border border-theme-border mb-3.5">
          <View className="flex-row justify-between items-center mb-1.5">
            <Text className="text-xs font-extrabold text-theme-text">Fitness Projection (CTL)</Text>
            <Text className="text-xs font-mono font-extrabold text-theme-accent">
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

        {/* STAGE 1: MOST MINIMAL LAYOUT (Spark web style) */}
        {stage === 1 && (
          <View>
            <TouchableOpacity
              onPress={handleStage1Click}
              activeOpacity={0.85}
              className="relative pt-6 pb-2"
            >
              {/* Floating "Today" Pin Marker */}
              <View
                className="absolute top-0 z-20 items-center"
                style={{ left: `${todayProgressPercent}%`, transform: [{ translateX: -18 }] }}
              >
                <View className="bg-theme-card border border-theme-accent/50 px-2 py-0.5 rounded-md shadow-sm">
                  <Text className="text-[9px] font-extrabold text-theme-accent">Today</Text>
                </View>
                <View className="w-2.5 h-2.5 rounded-full bg-theme-accent border-2 border-white -mt-0.5 shadow-sm" />
              </View>

              {/* Top Cyan Progress Line */}
              <View className="w-full h-1 bg-theme-border/40 -mb-1 z-10 rounded-t-xl overflow-hidden">
                <View
                  className="h-full bg-theme-accent rounded-full"
                  style={{ width: `${todayProgressPercent}%` }}
                />
              </View>

              {/* Horizontal Phase Blocks Bar */}
              <View className="w-full h-11 border border-theme-border rounded-xl flex-row bg-theme-bg overflow-hidden shadow-inner">
                {info.phases.map((phase, idx) => {
                  const isCurrent = idx === info.currentPhaseIndex;
                  return (
                    <View
                      key={phase.name}
                      className={`flex-1 items-center justify-center border-r border-theme-border/50 ${
                        idx === info.phases.length - 1 ? 'border-r-0' : ''
                      } ${isCurrent ? 'bg-theme-accent/15' : ''}`}
                    >
                      <Text
                        className={`text-[10px] font-extrabold tracking-widest ${
                          isCurrent ? 'text-theme-accent' : 'text-theme-muted'
                        }`}
                      >
                        {phase.name.replace(/phase/gi, '').trim().toUpperCase()}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </TouchableOpacity>

            {/* Click to see more Prompt Button */}
            <TouchableOpacity
              onPress={handleStage1Click}
              activeOpacity={0.7}
              className="mt-2.5 py-2 items-center justify-center border border-dashed border-theme-border rounded-xl bg-theme-bg/30 flex-row gap-1"
            >
              <Text className="text-xs font-bold text-theme-accent">Click to see more</Text>
              <Ionicons name="chevron-down" size={14} color="#16ACBD" />
            </TouchableOpacity>
          </View>
        )}

        {/* STAGE 2 & STAGE 3: INTERMEDIATE & MOST DETAILED LAYOUT */}
        {(stage === 2 || stage === 3) && (
          <View>
            {/* Header Controls for Stage 2 & 3 */}
            <View className="flex-row justify-between items-center mb-3">
              <Text className="text-xs uppercase tracking-widest font-extrabold text-theme-muted">
                Training Phases
              </Text>
              <TouchableOpacity
                onPress={handleCollapseToStage1}
                className="flex-row items-center gap-1 px-2 py-1 rounded-lg bg-theme-bg border border-theme-border"
              >
                <Text className="text-[10px] font-bold text-theme-accent">Show minimal view</Text>
                <Ionicons name="chevron-up" size={12} color="#16ACBD" />
              </TouchableOpacity>
            </View>

            {/* Phase Blocks List */}
            <View className="space-y-2.5">
              {info.phases.map((phase, idx) => {
                const isCurrent = idx === info.currentPhaseIndex;
                const isExpanded = stage === 3 && expandedIndex === idx;

                return (
                  <TouchableOpacity
                    key={phase.name}
                    onPress={() => handlePhaseClick(idx)}
                    activeOpacity={0.85}
                    className={`p-3.5 rounded-2xl border ${
                      isCurrent
                        ? 'bg-theme-accent-soft/30 border-theme-accent shadow-md'
                        : 'bg-theme-card border-theme-border/60 opacity-90'
                    } my-1`}
                  >
                    <View className="flex-row items-center justify-between mb-1">
                      <View className="flex-row items-center gap-2">
                        <Text
                          className={`text-sm font-extrabold tracking-wide uppercase ${
                            isCurrent ? 'text-theme-accent' : 'text-theme-text'
                          }`}
                        >
                          {phase.name.replace(/phase/gi, '').trim().toUpperCase()}
                        </Text>
                        <Text className="text-xs font-mono text-theme-muted">({phase.weeks})</Text>
                      </View>

                      <View className="flex-row items-center gap-2">
                        {isCurrent && (
                          <View className="bg-theme-accent px-2 py-0.5 rounded-full flex-row items-center gap-1 shadow-sm">
                            <View className="w-1.5 h-1.5 rounded-full bg-white" />
                            <Text className="text-[8px] font-extrabold text-white uppercase tracking-wider">
                              ACTIVE
                            </Text>
                          </View>
                        )}
                        <Ionicons
                          name={isExpanded ? 'chevron-up' : 'chevron-down'}
                          size={14}
                          color="#8E9BA4"
                        />
                      </View>
                    </View>

                    {/* Phase Focus Description (Stage 2 & 3) */}
                    <Text className="text-xs text-theme-muted font-medium">
                      Focus: {phase.focus}
                    </Text>

                    {/* Active phase progress bar */}
                    {isCurrent && (
                      <View className="mt-2 pt-2 border-t border-theme-accent/20">
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

                    {/* STAGE 3: EXPANDED MOST DETAILED BREAKDOWN */}
                    {isExpanded && (
                      <View className="mt-3 pt-3 border-t border-theme-border/60 space-y-2">
                        <View className="flex-row items-center justify-between bg-theme-bg/80 p-2.5 rounded-xl border border-theme-border/50">
                          <View className="flex-row items-center gap-1.5">
                            <Ionicons name="time-outline" size={14} color="#16ACBD" />
                            <Text className="text-xs text-theme-muted font-medium">Target Volume</Text>
                          </View>
                          <Text className="text-xs font-mono font-bold text-theme-text">
                            {phase.targetVolume || '8-10 hrs/wk'}
                          </Text>
                        </View>

                        <View className="flex-row items-center justify-between bg-theme-bg/80 p-2.5 rounded-xl border border-theme-border/50">
                          <View className="flex-row items-center gap-1.5">
                            <Ionicons name="sparkles-outline" size={14} color="#F97316" />
                            <Text className="text-xs text-theme-muted font-medium">Target Weekly Spark</Text>
                          </View>
                          <Text className="text-xs font-mono font-bold text-theme-text">
                            {phase.targetSpark || '420-480 Spark/wk'}
                          </Text>
                        </View>

                        {phase.keySessions && phase.keySessions.length > 0 && (
                          <View className="bg-theme-bg/80 p-2.5 rounded-xl border border-theme-border/50">
                            <Text className="text-[10px] font-extrabold text-theme-text uppercase tracking-wider mb-1">
                              Key Focus Sessions
                            </Text>
                            {phase.keySessions.map((session, sIdx) => (
                              <View key={sIdx} className="flex-row items-center gap-1.5 my-0.5">
                                <Ionicons name="checkmark-circle-outline" size={13} color="#10B981" />
                                <Text className="text-xs text-theme-muted">{session}</Text>
                              </View>
                            ))}
                          </View>
                        )}
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}
      </View>
    </Card>
  );
}
