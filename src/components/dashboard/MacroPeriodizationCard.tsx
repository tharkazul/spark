import React from 'react';
import { View, Text } from 'react-native';
import { Card } from '../ui/Card';
import { MacroPeriodInfo } from '../../types/dashboard';

interface MacroPeriodizationCardProps {
  info: MacroPeriodInfo;
}

export function MacroPeriodizationCard({ info }: MacroPeriodizationCardProps) {
  const currentPhaseName = info.phases[info.currentPhaseIndex] || 'BUILD';

  return (
    <Card className="p-0 overflow-hidden mb-5 border-theme-border shadow-sm">
      {/* Header */}
      <View className="px-4 md:px-5 py-3.5 border-b border-theme-border flex-row justify-between items-center bg-theme-bg/50">
        <View>
          <Text className="text-sm font-bold text-theme-text">Macro Periodization</Text>
          <Text className="text-[10px] text-theme-muted mt-0.5">16-Week Training Block</Text>
        </View>

        {/* Days Countdown Badge */}
        <View className="bg-theme-card border border-theme-border px-3 py-1 rounded-lg shadow-sm">
          <Text className="text-xs font-mono font-bold text-theme-accent">
            {info.daysRemaining} Days to {info.raceTargetName}
          </Text>
        </View>
      </View>

      {/* Stage Timeline */}
      <View className="p-5 md:p-6">
        <View className="relative w-full h-12 border border-theme-border rounded-xl flex-row bg-theme-bg overflow-hidden shadow-inner">
          {info.phases.map((phase, idx) => {
            const isCurrent = idx === info.currentPhaseIndex;

            return (
              <View
                key={phase}
                className={`flex-1 items-center justify-center border-r border-theme-border/60 ${
                  idx === info.phases.length - 1 ? 'border-r-0' : ''
                } ${isCurrent ? 'bg-theme-accent/15' : ''}`}
              >
                <Text
                  className={`text-[10px] font-extrabold uppercase tracking-widest ${
                    isCurrent ? 'text-theme-accent' : 'text-theme-muted'
                  }`}
                >
                  {phase}
                </Text>
              </View>
            );
          })}

          {/* Today Marker Line & Dot */}
          {/* Position based on currentPhaseIndex (e.g. index 1 = Build phase, ~42% across) */}
          <View
            className="absolute top-0 bottom-0 w-[2px] bg-theme-accent z-20 shadow-md"
            style={{ left: `${((info.currentPhaseIndex + 0.6) / info.phases.length) * 100}%` }}
          >
            {/* Today Badge */}
            <View className="absolute -top-3.5 -translate-x-1/2 left-0 bg-theme-card border border-theme-accent px-1.5 py-0.5 rounded shadow-sm">
              <Text className="text-[8px] font-extrabold text-theme-accent uppercase">Today</Text>
            </View>

            {/* Top Dot */}
            <View className="absolute top-0 -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 border-2 border-theme-accent bg-theme-card rounded-full items-center justify-center shadow">
              <View className="w-1.5 h-1.5 rounded-full bg-theme-accent" />
            </View>

            {/* Bottom Dot */}
            <View className="absolute bottom-0 -translate-x-1/2 translate-y-1/2 w-3.5 h-3.5 border-2 border-theme-accent bg-theme-card rounded-full items-center justify-center shadow">
              <View className="w-1.5 h-1.5 rounded-full bg-theme-accent" />
            </View>
          </View>
        </View>

        {/* Phase Summary */}
        <View className="mt-3.5 flex-row items-center justify-between">
          <Text className="text-xs text-theme-muted">
            Current Phase: <Text className="font-bold text-theme-accent">{currentPhaseName}</Text>
          </Text>
          <Text className="text-[10px] text-theme-muted/70 font-mono">High Aerobic & Threshold Focus</Text>
        </View>
      </View>
    </Card>
  );
}
