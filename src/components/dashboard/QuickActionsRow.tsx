import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

interface QuickActionsRowProps {
  onAddActivity: () => void;
  onLogWeight: () => void;
  onReportInjury: () => void;
}

export function QuickActionsRow({
  onAddActivity,
  onLogWeight,
  onReportInjury,
}: QuickActionsRowProps) {

  const handlePress = (action: () => void) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    action();
  };

  return (
    <View className="mb-5">
      <Text className="text-xs uppercase tracking-wider font-extrabold text-theme-muted mb-2.5">
        Quick Actions
      </Text>

      <View className="flex-row gap-2.5">
        {/* + Activity */}
        <TouchableOpacity
          onPress={() => handlePress(onAddActivity)}
          activeOpacity={0.8}
          className="flex-1 bg-theme-card p-3 rounded-2xl border border-theme-border/50 items-center justify-center gap-1.5 shadow-sm"
        >
          <View className="w-8 h-8 rounded-full bg-amber-500/15 items-center justify-center">
            <Ionicons name="add" size={18} color="#F59E0B" />
          </View>
          <Text className="text-xs font-extrabold text-theme-text mt-1">Activity</Text>
        </TouchableOpacity>

        {/* Weight Log */}
        <TouchableOpacity
          onPress={() => handlePress(onLogWeight)}
          activeOpacity={0.8}
          className="flex-1 bg-theme-card p-3 rounded-2xl border border-theme-border/50 items-center justify-center gap-1.5 shadow-sm"
        >
          <View className="w-8 h-8 rounded-full bg-slate-500/15 items-center justify-center">
            <Ionicons name="scale-outline" size={16} color="#9CA3AF" />
          </View>
          <Text className="text-xs font-extrabold text-theme-text mt-1">Weight</Text>
        </TouchableOpacity>

        {/* Injury */}
        <TouchableOpacity
          onPress={() => handlePress(onReportInjury)}
          activeOpacity={0.8}
          className="flex-1 bg-theme-card p-3 rounded-2xl border border-theme-border/50 items-center justify-center gap-1.5 shadow-sm"
        >
          <View className="w-8 h-8 rounded-full bg-red-500/15 items-center justify-center">
            <Ionicons name="bandage-outline" size={16} color="#EF4444" />
          </View>
          <Text className="text-xs font-extrabold text-theme-text mt-1">Injury</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
