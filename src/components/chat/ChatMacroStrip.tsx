import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { usePhysique } from '../../context/PhysiqueStore';
import { MacroRingGauge } from '../dashboard/MacroRingGauge';

interface ChatMacroStripProps {
  isVisible: boolean;
  onToggle: () => void;
}

export function ChatMacroStrip({ isVisible, onToggle }: ChatMacroStripProps) {
  const { nutrition } = usePhysique();

  const handleToggle = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (_) {}
    onToggle();
  };

  return (
    <View className="mb-3 px-2">
      {isVisible ? (
        <View className="bg-theme-card border border-theme-border/50 rounded-3xl p-3 shadow-sm mb-2">
          <View className="flex-row items-center justify-around">
            <MacroRingGauge
              label="Carbs"
              target={nutrition.carbsTarget}
              logged={nutrition.loggedCarbs || 0}
              size={64}
            />
            <MacroRingGauge
              label="Protein"
              target={nutrition.proteinTarget}
              logged={nutrition.loggedProtein || 0}
              size={64}
            />
            <MacroRingGauge
              label="Fat"
              target={nutrition.fatTarget}
              logged={nutrition.loggedFat || 0}
              size={64}
            />
          </View>
        </View>
      ) : null}

      <TouchableOpacity
        onPress={handleToggle}
        activeOpacity={0.7}
        className="self-center flex-row items-center bg-theme-bg border border-theme-border/50 px-3 py-1 rounded-full shadow-sm"
      >
        <Ionicons name={isVisible ? "chevron-down" : "chevron-up"} size={14} color="#94A3B8" />
        <Text className="text-[10px] font-extrabold text-theme-muted ml-1 uppercase tracking-wider">
          {isVisible ? 'Hide Rings' : 'Show Rings'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}
