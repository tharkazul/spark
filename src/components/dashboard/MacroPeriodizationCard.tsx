import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/use-theme';
import React from 'react';
import { Text, View } from 'react-native';
import { MacroPeriodInfo } from '../../types/dashboard';
import { Card } from '../ui/Card';

interface MacroPeriodizationCardProps {
  info: MacroPeriodInfo;
}

export function MacroPeriodizationCard({ info }: MacroPeriodizationCardProps) {
    const theme = useTheme();
  const currentPhaseName = info.phases[info.currentPhaseIndex]?.name || 'BUILD';

  return (
    <Card className="p-0 overflow-hidden mb-3.5">
      {/* Header Bar */}
      <View className="px-4 py-2.5 flex-row justify-between items-center bg-theme-bg/60">
        <View className="flex-row items-center gap-2">
          <View className="w-7 h-7 rounded-lg bg-theme-accent/15 items-center justify-center">
            <Ionicons name="compass-outline" size={14} color={theme.tint} />
          </View>
          <View>
            <Text className="text-sm font-extrabold text-theme-text">Macro Periodization</Text>
            <Text className="text-xs text-theme-muted">16-Week Training Block</Text>
          </View>
        </View>

        {/* Days Countdown Badge */}
        <View className="bg-theme-card px-2.5 py-1 rounded-control">
          <Text className="text-xs font-mono font-extrabold text-theme-accent">
            {info.daysRemaining} Days to {info.raceTargetName}
          </Text>
        </View>
      </View>

      {/* Stage Timeline */}
      <View className="p-3.5">
        <View className="relative w-full h-12 rounded-xl flex-row bg-theme-bg overflow-hidden">
          {info.phases.map((phase, idx) => {
            const isCurrent = idx === info.currentPhaseIndex;

            return (
              <View
                key={phase.name}
                className={`flex-1 items-center justify-center ${isCurrent ? 'bg-theme-accent/15' : ''}`}
              >
                <Text
                  className={`text-xs font-extrabold tracking-widest ${isCurrent ? 'text-theme-accent' : 'text-theme-muted'
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
          <Text className="text-xs text-theme-muted font-mono">
            {info.phases[info.currentPhaseIndex]?.weeks || ''}
          </Text>
        </View>
      </View>
    </Card>
  );
}
