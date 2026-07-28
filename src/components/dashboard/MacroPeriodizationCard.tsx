import React from 'react';
import { View, Text } from 'react-native';
import { Card } from '../ui/Card';
import { Ionicons } from '@expo/vector-icons';
import { MacroPeriodInfo } from '../../types/dashboard';

interface MacroPeriodizationCardProps {
  info: MacroPeriodInfo;
}

export function MacroPeriodizationCard({ info }: MacroPeriodizationCardProps) {
  const currentPhaseName = info.phases[info.currentPhaseIndex]?.name || 'BUILD';

  return (
    <Card className="p-0 overflow-hidden mb-3.5 border-theme-border shadow-sm">
      {/* Header Bar */}
      <View className="px-4 py-2.5 border-b border-theme-border/70 flex-row justify-between items-center bg-theme-bg/60">
        <View className="flex-row items-center gap-2">
          <View className="w-7 h-7 rounded-lg bg-theme-accent/15 border border-theme-accent/30 items-center justify-center">
            <Ionicons name="compass-outline" size={14} color="#16ACBD" />
          </View>
          <View>
            <Text className="text-sm font-extrabold text-theme-text">Macro Periodization</Text>
            <Text className="text-[9px] text-theme-muted">16-Week Training Block</Text>
          </View>
        </View>

        {/* Days Countdown Badge */}
        <View className="bg-theme-card border border-theme-border px-2.5 py-1 rounded-lg shadow-sm">
          <Text className="text-[10px] font-mono font-extrabold text-theme-accent">
            {info.daysRemaining} Days to {info.raceTargetName}
          </Text>
        </View>
      </View>

      {/* Stage Timeline */}
      <View className="p-3.5">
        <View className="relative w-full h-12 border border-theme-border rounded-xl flex-row bg-theme-bg overflow-hidden shadow-inner">
          {info.phases.map((phase, idx) => {
            const isCurrent = idx === info.currentPhaseIndex;

            return (
              <View
                key={phase.name}
                className={`flex-1 items-center justify-center border-r border-theme-border/60 ${
                  idx === info.phases.length - 1 ? 'border-r-0' : ''
                } ${isCurrent ? 'bg-theme-accent/15' : ''}`}
              >
                <Text
                  className={`text-[10px] font-extrabold uppercase tracking-widest ${
                    isCurrent ? 'text-theme-accent' : 'text-theme-muted'
                  }`}
                >
                  {phase.name}
                </Text>
                {isCurrent && (
                  <View className="absolute bottom-1 w-1.5 h-1.5 rounded-full bg-theme-accent" />
                )}
              </View>
            );
          })}
        </View>

        {/* Legend */}
        <View className="flex-row items-center justify-between mt-3 px-1">
          <Text className="text-xs text-theme-muted font-medium">
            Active Phase: <Text className="text-theme-accent font-extrabold">{currentPhaseName}</Text>
          </Text>
          <Text className="text-[10px] text-theme-muted font-mono">
            {info.phases[info.currentPhaseIndex]?.weeks || ''}
          </Text>
        </View>
      </View>
    </Card>
  );
}
