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
          activeOpacity={0.7}
          className="flex-1 bg-theme-card border border-amber-500/40 p-3 rounded-2xl items-center justify-center gap-1.5"
        >
          <View className="w-8 h-8 rounded-full bg-amber-500/15 items-center justify-center">
            <Ionicons name="add" size={18} color="#F97316" />
          </View>
          <Text className="text-xs font-bold text-amber-500 mt-0.5">Activity</Text>
        </TouchableOpacity>

        {/* Weight Log */}
        <TouchableOpacity
          onPress={() => handlePress(onLogWeight)}
          activeOpacity={0.7}
          className="flex-1 bg-theme-card border border-amber-500/40 p-3 rounded-2xl items-center justify-center gap-1.5"
        >
          <View className="w-8 h-8 rounded-full bg-amber-500/15 items-center justify-center">
            <Ionicons name="scale-outline" size={16} color="#F97316" />
          </View>
          <Text className="text-xs font-bold text-amber-500 mt-0.5">Weight</Text>
        </TouchableOpacity>

        {/* Injury */}
        <TouchableOpacity
          onPress={() => handlePress(onReportInjury)}
          activeOpacity={0.7}
          className="flex-1 bg-theme-card border border-rose-500/40 p-3 rounded-2xl items-center justify-center gap-1.5"
        >
          <View className="w-8 h-8 rounded-full bg-rose-500/15 items-center justify-center">
            <Ionicons name="bandage-outline" size={16} color="#F43F5E" />
          </View>
          <Text className="text-xs font-bold text-rose-500 mt-0.5">Injury</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
