import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Card } from '../ui/Card';
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
    <Card className="p-4 md:p-5 border-theme-border shadow-sm mb-5">
      {/* Header Bar matching TodaysPlanCard header design exactly */}
      <View className="flex-row items-center justify-between pb-3 mb-3.5 border-b border-theme-border/50">
        <View className="flex-row items-center gap-3">
          <View className="w-10 h-10 rounded-xl bg-amber-500/15 items-center justify-center">
            <Ionicons name="trophy-outline" size={20} color="#F97316" />
          </View>
          <View>
            <Text className="text-base font-extrabold text-theme-text">Active Quest</Text>
            <Text className="text-[11px] text-theme-muted">Weekly Goal</Text>
          </View>
        </View>

        {/* Action Trigger Button matching TodaysPlanCard ADAPT button styling exactly */}
        <TouchableOpacity
          onPress={handleGenerateQuest}
          disabled={loading}
          activeOpacity={0.7}
          className="bg-theme-card border border-amber-500/40 px-3.5 py-1.5 rounded-full flex-row items-center gap-1.5 shadow-sm"
        >
          {loading ? (
            <ActivityIndicator size="small" color="#F97316" />
          ) : (
            <>
              <Ionicons name="refresh-outline" size={13} color="#F97316" />
              <Text className="text-xs font-bold text-amber-500">
                {activeQuest ? 'Swap Challenge' : 'New Challenge'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Main Content Area matching TodaysPlanCard inner item styling */}
      {activeQuest ? (
        <View className="p-4 rounded-2xl border border-l-4 border-l-amber-500 border-amber-500/30 bg-theme-bg/60 flex-col gap-2.5">
          {/* Top Line: Description & Reward Badge */}
          <View className="flex-row items-center justify-between">
            <Text className="text-sm font-extrabold text-theme-text flex-1 pr-2 leading-snug">
              {activeQuest.description}
            </Text>
            <View className="bg-amber-500/10 border border-amber-500/30 px-2.5 py-0.5 rounded-full flex-row items-center gap-1">
              <Ionicons name="flash" size={11} color="#F97316" />
              <Text className="text-[10px] font-extrabold text-amber-500">
                +{activeQuest.reward_points} Spark
              </Text>
            </View>
          </View>

          {/* Subline & Progress Bar matching TodaysPlanCard subline styling */}
          <View className="pt-1.5 border-t border-theme-border/40">
            <View className="flex-row justify-between items-center mb-1.5">
              <Text className="text-xs text-theme-muted font-bold">
                {activeQuest.progress || 0} of {activeQuest.target_value} done
              </Text>
              <Text className="text-xs font-mono font-bold text-amber-500">
                {progressPercent}%
              </Text>
            </View>
            <View className="w-full h-2.5 bg-theme-border/60 rounded-full overflow-hidden">
              <View
                className="h-full bg-amber-500 rounded-full"
                style={{ width: `${progressPercent}%` }}
              />
            </View>
          </View>
        </View>
      ) : (
        <View className="p-5 rounded-2xl border border-theme-border bg-theme-bg/60 flex-col items-center justify-center gap-2">
          <Ionicons name="trophy-outline" size={24} color="#6F6F79" />
          <Text className="text-sm font-bold text-theme-text">No Active Quest</Text>
          <Text className="text-xs text-theme-muted text-center px-4">
            Tap above to generate your next weekly challenge.
          </Text>
        </View>
      )}
    </Card>
  );
}
