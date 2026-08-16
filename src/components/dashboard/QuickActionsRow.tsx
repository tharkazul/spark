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
    <View className="mb-6">
      <Text className="text-xs uppercase tracking-wider font-extrabold text-theme-muted mb-2.5 px-1">
        Quick Actions
      </Text>

      <View className="flex-row gap-2.5">
        {/* + Activity */}
        <TouchableOpacity
          onPress={() => handlePress(onAddActivity)}
          activeOpacity={0.75}
          className="flex-1 bg-theme-card p-3 rounded-2xl flex-row items-center justify-center gap-2 shadow-xs"
        >
          <View className="w-7 h-7 rounded-lg bg-theme-accent/15 items-center justify-center">
            <Ionicons name="add" size={16} color="#FF5F3B" />
          </View>
          <Text className="text-xs font-bold text-theme-text">Activity</Text>
        </TouchableOpacity>

        {/* Weight Log */}
        <TouchableOpacity
          onPress={() => handlePress(onLogWeight)}
          activeOpacity={0.75}
          className="flex-1 bg-theme-card p-3 rounded-2xl flex-row items-center justify-center gap-2 shadow-xs"
        >
          <View className="w-7 h-7 rounded-lg bg-amber-500/15 items-center justify-center">
            <Ionicons name="scale-outline" size={15} color="#F59E0B" />
          </View>
          <Text className="text-xs font-bold text-theme-text">Weight</Text>
        </TouchableOpacity>

        {/* Injury / Niggle */}
        <TouchableOpacity
          onPress={() => handlePress(onReportInjury)}
          activeOpacity={0.75}
          className="flex-1 bg-theme-card p-3 rounded-2xl flex-row items-center justify-center gap-2 shadow-xs"
        >
          <View className="w-7 h-7 rounded-lg bg-rose-500/15 items-center justify-center">
            <Ionicons name="bandage-outline" size={15} color="#F43F5E" />
          </View>
          <Text className="text-xs font-bold text-theme-text">Injury</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
