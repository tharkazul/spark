import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Card } from '../ui/Card';
import { Ionicons } from '@expo/vector-icons';
import { NutritionMacro } from '../../types/dashboard';
import { MacroRingGauge } from './MacroRingGauge';
import { physiqueApi } from '../../services/apiServices';
import { usePhysique } from '../../context/PhysiqueStore';

interface NutritionProtocolCardProps {
  nutrition: NutritionMacro;
}

export function NutritionProtocolCard({ nutrition }: NutritionProtocolCardProps) {
  const { clearLoggedNutrition } = usePhysique();

  const handleClearLoggedFood = async () => {
    try {
      await clearLoggedNutrition();
    } catch (err) {
      console.error('Failed to clear logged nutrition:', err);
    }
  };

  const loggedItems = nutrition.loggedItems || [];
  const hasLoggedFood = (nutrition.loggedCarbs || 0) > 0 || (nutrition.loggedProtein || 0) > 0 || (nutrition.loggedFat || 0) > 0;

  return (
    <Card className="p-0 overflow-hidden mb-3.5 border-theme-border shadow-sm">
      {/* Header Bar */}
      <View className="px-4 py-2.5 border-b border-theme-border/70 flex-row justify-between items-center bg-theme-bg/60">
        <View className="flex-row items-center gap-2">
          <View className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/30 items-center justify-center">
            <Ionicons name="restaurant-outline" size={14} color="#10B981" />
          </View>
          <View>
            <Text className="text-sm font-extrabold text-theme-text">Daily AI Nutrition Protocol</Text>
            <Text className="text-[9px] text-theme-muted">Fueling & Conversational Meal Targets</Text>
          </View>
        </View>

        {hasLoggedFood && (
          <TouchableOpacity
            onPress={handleClearLoggedFood}
            className="flex-row items-center gap-1 bg-theme-card border border-theme-border px-2 py-1 rounded-lg"
          >
            <Ionicons name="refresh-outline" size={11} color="#94A3B8" />
            <Text className="text-[9px] font-bold text-theme-muted">Reset Today</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Main Content Area */}
      <View className="p-3.5">
        {/* Focus Title & Rationale */}
        <Text className="text-base font-extrabold text-theme-text mb-1">
          {nutrition.focusTitle}
        </Text>
        <Text className="text-xs text-theme-muted leading-relaxed mb-4">
          {nutrition.rationale}
        </Text>

        {/* Macro Ring Gauges Grid (Protein, Carbs, Fat) */}
        <View className="flex-row justify-around items-center pt-1 pb-3">
          {/* Protein Ring */}
          <MacroRingGauge
            label="Protein"
            target={nutrition.protein}
            logged={nutrition.loggedProtein || 0}
          />

          {/* Carbs Ring */}
          <MacroRingGauge
            label="Carbs"
            target={nutrition.carbs}
            logged={nutrition.loggedCarbs || 0}
          />

          {/* Fat Ring */}
          <MacroRingGauge
            label="Fat"
            target={nutrition.fat}
            logged={nutrition.loggedFat || 0}
          />
        </View>

        {/* Logged Meal Chips (when shared in chat) */}
        {loggedItems.length > 0 && (
          <View className="mt-2 pt-2.5 border-t border-theme-border/50">
            <Text className="text-[10px] font-extrabold text-theme-muted uppercase tracking-wider mb-1.5">
              Meals Logged via Coach Chat
            </Text>
            <View className="flex-row flex-wrap gap-1.5">
              {loggedItems.map((item, idx) => (
                <View
                  key={idx}
                  className="bg-theme-accent-soft/20 border border-theme-accent/30 px-2.5 py-1 rounded-lg flex-row items-center gap-1"
                >
                  <Ionicons name="checkmark-circle" size={10} color="#FF5A1F" />
                  <Text className="text-[10px] font-bold text-theme-text">{item}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </View>
    </Card>
  );
}
