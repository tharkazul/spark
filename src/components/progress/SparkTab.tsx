import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Card } from '../ui/Card';
import { LineChart } from 'react-native-gifted-charts';
import { AthleteRadarChart } from './AthleteRadarChart';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

interface SparkTabProps {
  levelInfo?: {
    level: number;
    currentXp: number;
    nextLevelXp: number;
  };
  archetypeData?: {
    endurance: number;
    strength: number;
    versatility: number;
    explosiveness: number;
  };
}

export const SparkTab: React.FC<SparkTabProps> = ({
  levelInfo = { level: 14, currentXp: 10351, nextLevelXp: 10842 },
  archetypeData = { endurance: 82, strength: 65, versatility: 74, explosiveness: 58 },
}) => {
  const xpPercent = Math.min(
    100,
    Math.round((levelInfo.currentXp / levelInfo.nextLevelXp) * 100)
  );

  // Mock 30-Day trend datasets matching PWA sparklines
  const fitnessData = [
    { value: 42 }, { value: 45 }, { value: 48 }, { value: 50 },
    { value: 54 }, { value: 52 }, { value: 58 }, { value: 61 },
    { value: 65 }, { value: 63 }, { value: 68 }, { value: 72 },
  ];

  const fatigueData = [
    { value: 58 }, { value: 65 }, { value: 60 }, { value: 72 },
    { value: 68 }, { value: 55 }, { value: 50 }, { value: 48 },
    { value: 42 }, { value: 38 }, { value: 35 }, { value: 32 },
  ];

  const readinessData = [
    { value: -16 }, { value: -20 }, { value: -12 }, { value: -22 },
    { value: -14 }, { value: -3 }, { value: 8 }, { value: 13 },
    { value: 23 }, { value: 25 }, { value: 33 }, { value: 40 },
  ];

  const weightData = [
    { value: 76.5 }, { value: 76.2 }, { value: 76.0 }, { value: 75.6 },
    { value: 75.3 }, { value: 75.1 }, { value: 74.8 }, { value: 74.5 },
  ];

  return (
    <View className="space-y-4">
      {/* SPARK LEVEL CARD */}
      <Card className="mb-4 bg-theme-card border-theme-border">
        <View className="flex-row items-center justify-between mb-2">
          <View className="flex-row items-center space-x-2">
            <View className="w-8 h-8 rounded-full bg-theme-accent/20 items-center justify-center border border-theme-accent/40">
              <Ionicons name="flash" size={18} color="#16ACBD" />
            </View>
            <Text className="text-xs font-bold text-theme-muted uppercase tracking-wider">
              SPARK LEVEL <Text className="text-theme-accent text-lg font-black">{levelInfo.level}</Text>
            </Text>
          </View>
          <Text className="text-xs font-semibold text-theme-muted">
            {levelInfo.currentXp} <Text className="text-theme-text font-bold">/ {levelInfo.nextLevelXp} XP</Text>
          </Text>
        </View>

        {/* Progress Fill Bar */}
        <View className="w-full h-3 bg-theme-bg rounded-full overflow-hidden border border-theme-border/50 my-2">
          <View
            style={{ width: `${xpPercent}%` }}
            className="h-full bg-theme-accent rounded-full"
          />
        </View>

        <View className="flex-row justify-between items-center mt-1">
          <Text className="text-[11px] text-theme-muted">Progress to next level</Text>
          <Text className="text-[11px] font-bold text-theme-accent">{xpPercent}%</Text>
        </View>
      </Card>

      {/* ATHLETE ARCHETYPE CARD */}
      <Card className="mb-4 bg-theme-card border-theme-border">
        <View className="flex-row items-center justify-between mb-3">
          <Text className="text-xs font-bold text-theme-muted uppercase tracking-wider">
            Athlete Archetype
          </Text>
          <View className="px-2.5 py-1 bg-theme-accent/15 rounded-full border border-theme-accent/30">
            <Text className="text-[10px] font-bold text-theme-accent uppercase">Balanced Hybrid</Text>
          </View>
        </View>

        <AthleteRadarChart data={archetypeData} size={230} />
      </Card>

      {/* 30-DAY TRENDS GRID */}
      <Card className="mb-4 bg-theme-card border-theme-border">
        <Text className="text-xs font-bold text-theme-muted uppercase tracking-wider mb-4">
          30-Day Trends
        </Text>

        <View className="flex-row flex-wrap justify-between">
          {/* Fitness (CTL) */}
          <View className="w-[48%] bg-theme-bg/60 border border-theme-border rounded-xl p-3 mb-3">
            <View className="flex-row items-center justify-between mb-1">
              <Text className="text-[10px] font-bold text-theme-muted uppercase">Fitness (CTL)</Text>
              <Text className="text-xs font-extrabold text-[#208AEF]">72</Text>
            </View>
            <View className="-ml-4 -mb-2">
              <LineChart
                data={fitnessData}
                height={55}
                width={120}
                color="#208AEF"
                thickness={2.5}
                hideDataPoints
                xAxisColor="transparent"
                yAxisColor="transparent"
                hideRules
                curved
              />
            </View>
          </View>

          {/* Fatigue (ATL) */}
          <View className="w-[48%] bg-theme-bg/60 border border-theme-border rounded-xl p-3 mb-3">
            <View className="flex-row items-center justify-between mb-1">
              <Text className="text-[10px] font-bold text-theme-muted uppercase">Fatigue (ATL)</Text>
              <Text className="text-xs font-extrabold text-[#E3494F]">32</Text>
            </View>
            <View className="-ml-4 -mb-2">
              <LineChart
                data={fatigueData}
                height={55}
                width={120}
                color="#E3494F"
                thickness={2.5}
                hideDataPoints
                xAxisColor="transparent"
                yAxisColor="transparent"
                hideRules
                curved
              />
            </View>
          </View>

          {/* Readiness (TSB) */}
          <View className="w-[48%] bg-theme-bg/60 border border-theme-border rounded-xl p-3">
            <View className="flex-row items-center justify-between mb-1">
              <Text className="text-[10px] font-bold text-theme-muted uppercase">Readiness (TSB)</Text>
              <Text className="text-xs font-extrabold text-[#34C759]">+40</Text>
            </View>
            <View className="-ml-4 -mb-2">
              <LineChart
                data={readinessData}
                height={55}
                width={120}
                color="#34C759"
                thickness={2.5}
                hideDataPoints
                xAxisColor="transparent"
                yAxisColor="transparent"
                hideRules
                curved
              />
            </View>
          </View>

          {/* Weight */}
          <View className="w-[48%] bg-theme-bg/60 border border-theme-border rounded-xl p-3">
            <View className="flex-row items-center justify-between mb-1">
              <Text className="text-[10px] font-bold text-theme-muted uppercase">Weight</Text>
              <Text className="text-xs font-extrabold text-[#F9CF45]">74.5kg</Text>
            </View>
            <View className="-ml-4 -mb-2">
              <LineChart
                data={weightData}
                height={55}
                width={120}
                color="#F9CF45"
                thickness={2.5}
                hideDataPoints
                xAxisColor="transparent"
                yAxisColor="transparent"
                hideRules
                curved
              />
            </View>
          </View>
        </View>
      </Card>

      {/* QUESTS LOG */}
      <Card className="mb-6 bg-theme-card border-theme-border">
        <View className="flex-row items-center justify-between mb-3">
          <View className="flex-row items-center space-x-2">
            <View className="w-2.5 h-2.5 rounded-full bg-theme-accent" />
            <Text className="text-xs font-bold text-theme-muted uppercase tracking-wider">
              Quests Log
            </Text>
          </View>
          <Text className="text-[11px] text-theme-muted">1 Active</Text>
        </View>

        <View className="bg-theme-bg/70 border border-theme-border rounded-xl p-4">
          <Text className="text-sm font-bold text-theme-text mb-1">
            Complete 10km Total Distance
          </Text>
          <Text className="text-xs text-theme-muted mb-3 leading-4">
            Across any combination of your favorite activities (Run, Ride, or Swim) over the next 3 days.
          </Text>

          <View className="flex-row justify-between items-center pt-2 border-t border-theme-border/50">
            <View className="flex-row items-center space-x-1">
              <Ionicons name="trophy-outline" size={14} color="#16ACBD" />
              <Text className="text-xs font-bold text-theme-accent">Reward: 75 Spark</Text>
            </View>

            <TouchableOpacity
              onPress={() => Haptics.selectionAsync()}
              className="px-3 py-1 bg-theme-accent/15 border border-theme-accent/30 rounded-lg"
            >
              <Text className="text-xs font-bold text-theme-accent">Status: Active</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Card>
    </View>
  );
};
