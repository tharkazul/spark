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
      <Text className="text-xs uppercase tracking-wider font-extrabold text-theme-muted mb-2.5">
        Quick Actions
      </Text>

      <View className="flex-row gap-2.5">
        {/* + Activity */}
        <TouchableOpacity
          onPress={() => handlePress(onAddActivity)}
          activeOpacity={0.8}
          className="flex-1 bg-theme-card border border-theme-border p-3 rounded-2xl flex-row items-center justify-center gap-2 shadow-sm"
        >
          <Ionicons name="add-circle-outline" size={18} color="#16ACBD" />
          <Text className="text-xs font-bold text-theme-text">+ Activity</Text>
        </TouchableOpacity>

        {/* Weight Log */}
        <TouchableOpacity
          onPress={() => handlePress(onLogWeight)}
          activeOpacity={0.8}
          className="flex-1 bg-theme-card border border-theme-border p-3 rounded-2xl flex-row items-center justify-center gap-2 shadow-sm"
        >
          <Ionicons name="scale-outline" size={18} color="#16ACBD" />
          <Text className="text-xs font-bold text-theme-text">Weight</Text>
        </TouchableOpacity>

        {/* Injury */}
        <TouchableOpacity
          onPress={() => handlePress(onReportInjury)}
          activeOpacity={0.8}
          className="flex-1 bg-theme-card border border-theme-border p-3 rounded-2xl flex-row items-center justify-center gap-2 shadow-sm"
        >
          <Ionicons name="bandage-outline" size={18} color="#F43F5E" />
          <Text className="text-xs font-bold text-theme-text">Injury</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
