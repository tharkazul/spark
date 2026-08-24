import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Card } from '../ui/Card';
import { BottomSheetModal } from '../ui/BottomSheetModal';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Quest } from '../../types/gamification';
import { useGamification } from '../../context/GamificationStore';

export function ActiveQuestsCard() {
  const { quests, generateQuest: generateNewQuest, swapQuest: swapActiveQuest } = useGamification();
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const activeQuest = quests.find((q) => q.status === 'active') || quests[0] || null;

  const handleGenerateQuest = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);
    try {
      if (activeQuest) {
        await swapActiveQuest(activeQuest.id);
      } else {
        await generateNewQuest();
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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
    <>
      <Card className="p-3.5 bg-theme-card mb-5">
        {activeQuest ? (
          <TouchableOpacity
            onPress={() => {
              Haptics.selectionAsync();
              setIsModalOpen(true);
            }}
            activeOpacity={0.75}
            className="flex-row items-center justify-between"
          >
            {/* Left: Trophy Icon & Quest Info */}
            <View className="flex-row items-center gap-3 flex-1 mr-3">
              <View className="w-10 h-10 rounded-xl bg-amber-500/15 items-center justify-center">
                <Ionicons name="trophy" size={20} color="#FF5F3B" />
              </View>
              <View className="flex-1">
                <View className="flex-row items-center gap-1.5">
                  <Text className="text-sm font-extrabold text-theme-text" numberOfLines={1}>
                    {activeQuest.description ? activeQuest.description.split('.')[0] : 'Active Quest'}
                  </Text>
                </View>
                <Text className="text-xs text-theme-muted font-bold mt-0.5 font-rajdhani">
                  {Math.round(activeQuest.progress || 0)} of {Math.round(activeQuest.target_value || 0)} done · {progressPercent}%
                </Text>
              </View>
            </View>

            {/* Right: Rooka Reward & Chevron */}
            <View className="flex-row items-center gap-2">
              <View className="bg-amber-500/15 px-2.5 py-1 rounded-full">
                <Text className="text-xs font-mono font-extrabold text-amber-500">
                  +{Math.round(activeQuest.reward_points || 0)} ⚡
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#6F6F79" />
            </View>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={handleGenerateQuest}
            activeOpacity={0.75}
            className="flex-row items-center justify-between"
          >
            <View className="flex-row items-center gap-3 flex-1">
              <View className="w-10 h-10 rounded-xl bg-amber-500/15 items-center justify-center">
                <Ionicons name="trophy-outline" size={20} color="#FF5F3B" />
              </View>
              <View className="flex-1">
                <Text className="text-sm font-extrabold text-theme-text">No Active Quest</Text>
                <Text className="text-xs text-theme-muted font-medium">Tap to start a weekly challenge</Text>
              </View>
            </View>
            {loading ? (
              <ActivityIndicator size="small" color="#FF5F3B" />
            ) : (
              <View className="bg-amber-500/15 px-3 py-1.5 rounded-xl">
                <Text className="text-xs font-extrabold text-amber-500">+ Start</Text>
              </View>
            )}
          </TouchableOpacity>
        )}
      </Card>

      {/* Quest Detail Modal */}
      <BottomSheetModal
        visible={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        showHandle
        contentClassName="bg-theme-card rounded-t-3xl px-6 pt-3 pb-6 border-t border-theme-border/50 max-h-[80%]"
      >
        {/* Header */}
        <View className="flex-row items-center justify-between mb-4">
          <View className="flex-row items-center gap-3">
            <View className="w-12 h-12 rounded-2xl bg-amber-500/15 items-center justify-center">
              <Ionicons name="trophy" size={26} color="#FF5F3B" />
            </View>
            <View>
              <Text className="text-lg font-extrabold text-theme-text">Active Quest</Text>
              <Text className="text-xs text-theme-muted font-bold">Expires Sunday midnight</Text>
            </View>
          </View>
          <View className="bg-amber-500/15 px-3 py-1.5 rounded-full">
            <Text className="text-sm font-mono font-extrabold text-amber-500">
              +{Math.round(activeQuest?.reward_points || 0)} Rooka
            </Text>
          </View>
        </View>

        {/* Quest Description */}
        <View className="bg-theme-bg p-4 rounded-2xl border border-theme-border/60 mb-5">
          <Text className="text-sm font-bold text-theme-text leading-relaxed">
            {activeQuest?.description}
          </Text>
        </View>

        {/* Progress Meter */}
        <View className="mb-6">
          <View className="flex-row justify-between items-center mb-2">
            <Text className="text-xs font-bold text-theme-muted">
              Progress ({Math.round(activeQuest?.progress || 0)} / {Math.round(activeQuest?.target_value || 0)})
            </Text>
            <Text className="text-sm font-mono font-bold text-amber-500">
              {progressPercent}%
            </Text>
          </View>
          <View className="w-full h-3 bg-theme-bg rounded-full overflow-hidden">
            <View
              className="h-full bg-amber-500 rounded-full"
              style={{ width: `${progressPercent}%` }}
            />
          </View>
        </View>

        {/* Action Buttons */}
        <View className="flex-row gap-3">
          <TouchableOpacity
            onPress={handleGenerateQuest}
            disabled={loading}
            className="flex-1 py-3.5 bg-theme-bg border border-theme-border rounded-xl flex-row items-center justify-center gap-2"
          >
            {loading ? (
              <ActivityIndicator size="small" color="#FF5F3B" />
            ) : (
              <>
                <Ionicons name="refresh-outline" size={16} color="#6F6F79" />
                <Text className="text-xs font-bold text-theme-muted">Swap Challenge</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setIsModalOpen(false)}
            className="flex-1 py-3.5 bg-theme-accent rounded-xl items-center justify-center"
          >
            <Text className="text-xs font-extrabold text-white">Got it</Text>
          </TouchableOpacity>
        </View>
      </BottomSheetModal>
    </>
  );
}
