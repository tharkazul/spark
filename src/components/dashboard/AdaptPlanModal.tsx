import React from 'react';
import { View, Text, Modal, TouchableOpacity, ScrollView } from 'react-native';
import { Button } from '../ui/Button';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

interface AdaptPlanModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirmAdapt: (adaptationType: string) => void;
}

export function AdaptPlanModal({
  visible,
  onClose,
  onConfirmAdapt,
}: AdaptPlanModalProps) {
  const handleOption = (type: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onConfirmAdapt(type);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-center items-center bg-black/70 px-4">
        <View className="bg-theme-card border border-theme-accent/40 rounded-[28px] p-5 w-full max-w-sm shadow-2xl max-h-[85%]">
          {/* Top Icon */}
          <View className="w-12 h-12 rounded-full bg-theme-accent/15 border border-theme-accent items-center justify-center self-center mb-3 shadow-md">
            <Ionicons name="flash" size={24} color="#FF5A1F" />
          </View>

          <Text className="text-xl font-extrabold text-theme-text text-center mb-1">
            Adaptive AI Plan
          </Text>

          <Text className="text-xs text-theme-muted text-center mb-4 leading-relaxed">
            Select an adaptation mode for Spark AI to optimize your training schedule:
          </Text>

          {/* Adaptation Options List */}
          <ScrollView className="space-y-2.5 mb-5" showsVerticalScrollIndicator={false}>
            {/* 1. Time Crunch */}
            <TouchableOpacity
              onPress={() => handleOption('TIME_CRUNCH')}
              activeOpacity={0.8}
              className="p-3.5 bg-theme-bg rounded-xl border border-theme-border flex-row items-center gap-3 my-1"
            >
              <View className="w-9 h-9 rounded-lg bg-orange-500/10 border border-orange-500/30 items-center justify-center">
                <Ionicons name="time-outline" size={18} color="#FF5A1F" />
              </View>
              <View className="flex-1">
                <Text className="text-xs font-bold text-theme-text">30-Min Time Crunch</Text>
                <Text className="text-[10px] text-theme-muted">Shorten session without losing peak threshold stimulus</Text>
              </View>
            </TouchableOpacity>

            {/* 2. Skip & Redistribute */}
            <TouchableOpacity
              onPress={() => handleOption('SKIP_REDISTRIBUTE')}
              activeOpacity={0.8}
              className="p-3.5 bg-theme-bg rounded-xl border border-theme-border flex-row items-center gap-3 my-1"
            >
              <View className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/30 items-center justify-center">
                <Ionicons name="swap-horizontal-outline" size={18} color="#F97316" />
              </View>
              <View className="flex-1">
                <Text className="text-xs font-bold text-theme-text">Skip & Redistribute</Text>
                <Text className="text-[10px] text-theme-muted">Skip today and rebalance target Spark points load</Text>
              </View>
            </TouchableOpacity>

            {/* 3. +1 Day Shift */}
            <TouchableOpacity
              onPress={() => handleOption('PUSH_FORWARD')}
              activeOpacity={0.8}
              className="p-3.5 bg-theme-bg rounded-xl border border-theme-border flex-row items-center gap-3 my-1"
            >
              <View className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/30 items-center justify-center">
                <Ionicons name="umbrella-outline" size={18} color="#10B981" />
              </View>
              <View className="flex-1">
                <Text className="text-xs font-bold text-theme-text">+1 Day Shift (Life Happens)</Text>
                <Text className="text-[10px] text-theme-muted">Shift micro-plan schedule 1 day forward</Text>
              </View>
            </TouchableOpacity>

            {/* 4. Move Indoors */}
            <TouchableOpacity
              onPress={() => handleOption('MOVE_INDOORS')}
              activeOpacity={0.8}
              className="p-3.5 bg-theme-bg rounded-xl border border-theme-border flex-row items-center gap-3 my-1"
            >
              <View className="w-9 h-9 rounded-lg bg-purple-500/10 border border-purple-500/30 items-center justify-center">
                <Ionicons name="home-outline" size={18} color="#A855F7" />
              </View>
              <View className="flex-1">
                <Text className="text-xs font-bold text-theme-text">Move Indoors</Text>
                <Text className="text-[10px] text-theme-muted">Convert outdoor ride/run into an indoor structured session</Text>
              </View>
            </TouchableOpacity>
          </ScrollView>

          {/* Buttons */}
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Button label="Cancel" variant="outline" onPress={onClose} />
            </View>
            <View className="flex-1">
              <Button label="Auto Adapt" variant="primary" onPress={() => handleOption('AUTO_ADAPT')} />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}
