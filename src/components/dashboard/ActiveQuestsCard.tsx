import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Quest } from '../../types/gamification';
import { gamificationApi } from '../../services/apiServices';

const defaultActiveQuest: Quest = {
  id: 'q-active-1',
  description: 'Log 3 Threshold Rides this week',
  target_metric: 'rides',
  target_value: 3,
  progress: 2,
  reward_points: 75,
  status: 'active',
  target_sport: 'BIKE',
};

export function ActiveQuestsCard() {
  const [activeQuest, setActiveQuest] = useState<Quest | null>(defaultActiveQuest);
  const [loading, setLoading] = useState(false);

  const fetchActiveQuest = async () => {
    try {
      const data = await gamificationApi.getGamificationData();
      if (data && Array.isArray(data.quests)) {
        const currentActive = data.quests.find((q) => q.status === 'active');
        if (currentActive) {
          setActiveQuest(currentActive);
        }
      }
    } catch (err) {
      console.log('Active Quest fetch info:', err);
    }
  };

  useEffect(() => {
    fetchActiveQuest();
  }, []);

  const handleGenerateQuest = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);
    try {
      const newQuest = await gamificationApi.generateQuest();
      if (newQuest) {
        setActiveQuest(newQuest);
      }
    } catch (err) {
      console.error('Generate quest error:', err);
    } finally {
      setLoading(false);
    }
  };

  const progressPercent = activeQuest
    ? Math.min(100, Math.round(((activeQuest.progress || 0) / (activeQuest.target_value || 1)) * 100))
    : 0;

  return (
    <View className="mb-4 rounded-3xl bg-theme-card shadow-sm">
      <View className="p-0 overflow-hidden rounded-3xl">
      {/* Header Bar */}
      <View className="px-4 py-3 flex-row justify-between items-center bg-theme-bg/40">
        <View className="flex-row items-center gap-2">
          <View className="w-7 h-7 rounded-lg bg-amber-500/15 items-center justify-center">
            <Ionicons name="trophy-outline" size={14} color="#F97316" />
          </View>
          <View>
            <Text className="text-sm font-extrabold text-theme-text">Active Quest</Text>
            <Text className="text-[9px] text-theme-muted">Weekly Goal</Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={handleGenerateQuest}
          disabled={loading}
          activeOpacity={0.8}
          className="flex-row items-center gap-1 bg-theme-bg/60 px-3 py-1.5 rounded-full"
        >
          {loading ? (
            <ActivityIndicator size="small" color="#F97316" />
          ) : (
            <>
              <Ionicons name="refresh-outline" size={12} color="#F97316" />
              <Text className="text-[10px] font-bold text-amber-500">
                {activeQuest ? 'Swap Challenge' : 'New Challenge'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Main Content Area */}
      <View className="p-3.5">
        {activeQuest ? (
          <View className="p-4 bg-theme-bg/50 rounded-2xl">
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-xs font-extrabold text-theme-text flex-1 pr-2 leading-tight">
                {activeQuest.description}
              </Text>
              <View className="bg-amber-500/10 px-2.5 py-0.5 rounded-full flex-row items-center gap-1">
                <Ionicons name="flash" size={11} color="#F97316" />
                <Text className="text-[10px] font-extrabold text-amber-500">
                  +{activeQuest.reward_points} Spark
                </Text>
              </View>
            </View>

            {/* Progress Bar */}
            <View className="mt-1.5">
              <View className="flex-row justify-between items-center mb-1">
                <Text className="text-[10px] text-theme-muted font-mono">
                  {activeQuest.progress || 0} of {activeQuest.target_value} done
                </Text>
                <Text className="text-[10px] font-mono font-bold text-theme-accent">
                  {progressPercent}%
                </Text>
              </View>
              <View className="w-full h-2.5 bg-theme-bg/80 rounded-full overflow-hidden">
                <View
                  className="h-full bg-amber-500 rounded-full"
                  style={{ width: `${progressPercent}%` }}
                />
              </View>
            </View>
          </View>
        ) : (
          <View className="py-4 items-center justify-center bg-theme-bg/30 rounded-2xl">
            <Text className="text-xs text-theme-muted font-medium">No active quest</Text>
          </View>
        )}
      </View>
      </View>
    </View>
  );
}
