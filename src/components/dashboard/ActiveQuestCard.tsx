import React, { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Card } from '../ui/Card';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

export interface QuestItem {
  id: string;
  title: string;
  sparkBonus: number;
  currentProgress: number;
  totalTarget: number;
  isFirstQuest?: boolean;
}

interface ActiveQuestCardProps {
  onRerollQuest?: () => void;
}

export function ActiveQuestCard({ onRerollQuest }: ActiveQuestCardProps) {
  // Hardcoded default first quest as requested
  const [quest, setQuest] = useState<QuestItem>({
    id: 'q-first',
    title: 'Log any activity to earn your first Spark Score!',
    sparkBonus: 40,
    currentProgress: 0,
    totalTarget: 10,
    isFirstQuest: true,
  });

  const availableQuests: QuestItem[] = [
    {
      id: 'q-first',
      title: 'Log any activity to earn your first Spark Score!',
      sparkBonus: 40,
      currentProgress: 0,
      totalTarget: 10,
    },
    {
      id: 'q-2',
      title: 'Complete 3 Structured Workouts this week',
      sparkBonus: 50,
      currentProgress: 1,
      totalTarget: 3,
    },
    {
      id: 'q-3',
      title: 'Log a 60+ min Endurance Session',
      sparkBonus: 35,
      currentProgress: 0,
      totalTarget: 1,
    },
    {
      id: 'q-4',
      title: 'Maintain 100% Nutrition Target for 2 Days',
      sparkBonus: 30,
      currentProgress: 1,
      totalTarget: 2,
    },
  ];

  const handleReroll = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const nextIdx = (availableQuests.findIndex((q) => q.id === quest.id) + 1) % availableQuests.length;
    setQuest(availableQuests[nextIdx]);
    if (onRerollQuest) onRerollQuest();
  };

  const progressPercent = Math.round((quest.currentProgress / quest.totalTarget) * 100);

  return (
    <Card className="p-4 md:p-5 border-theme-border shadow-sm mb-5">
      {/* Header matching screenshot */}
      <View className="flex-row items-center justify-between pb-3 mb-3.5 border-b border-theme-border/50">
        <View className="flex-row items-center gap-3">
          <View className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 items-center justify-center">
            <Ionicons name="trophy-outline" size={20} color="#F59E0B" />
          </View>
          <View>
            <Text className="text-base font-extrabold text-theme-text">Active Quest</Text>
            <Text className="text-[11px] text-theme-muted">Single Weekly Challenge</Text>
          </View>
        </View>

        {/* Reroll Button */}
        <TouchableOpacity
          onPress={handleReroll}
          activeOpacity={0.7}
          className="bg-theme-card border border-amber-500/40 px-3.5 py-1.5 rounded-full flex-row items-center gap-1.5 shadow-sm"
        >
          <Ionicons name="refresh" size={13} color="#F59E0B" />
          <Text className="text-xs font-bold text-amber-500">Reroll</Text>
        </TouchableOpacity>
      </View>

      {/* Quest Details Box matching screenshot styling */}
      <View className="p-4 rounded-2xl border border-theme-border bg-theme-bg/60">
        <View className="flex-row items-start justify-between gap-3 mb-4">
          <Text className="flex-1 text-sm font-extrabold text-theme-text leading-snug">
            {quest.title}
          </Text>

          {/* Spark Bonus Badge */}
          <View className="bg-amber-500/15 border border-amber-500/30 px-3 py-1 rounded-full flex-row items-center gap-1 shrink-0">
            <Ionicons name="sparkles" size={12} color="#F59E0B" />
            <Text className="text-xs font-mono font-extrabold text-amber-500">
              +{quest.sparkBonus} Spark
            </Text>
          </View>
        </View>

        {/* Progress Bar & Counter */}
        <View className="space-y-1.5">
          <View className="flex-row justify-between items-center text-xs font-mono">
            <Text className="text-xs font-mono text-theme-muted font-medium">
              Progress: {quest.currentProgress} / {quest.totalTarget}
            </Text>
            <Text className="text-xs font-mono font-bold text-amber-500">
              {progressPercent}%
            </Text>
          </View>

          <View className="w-full h-2 bg-theme-border/60 rounded-full overflow-hidden">
            <View
              className="h-full bg-amber-500 rounded-full"
              style={{ width: `${progressPercent}%` }}
            />
          </View>
        </View>
      </View>
    </Card>
  );
}
