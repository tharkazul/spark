import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Card } from '../ui/Card';
import { Ionicons } from '@expo/vector-icons';
import { NutritionMacro } from '../../types/dashboard';
import { MacroRingGauge } from './MacroRingGauge';
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
    <Card className="p-4 md:p-5 border-theme-border shadow-sm mb-5">
      {/* Header Bar matching Quest Card design */}
      <View className="flex-row items-center justify-between pb-3 mb-3.5 border-b border-theme-border/50">
        <View className="flex-row items-center gap-3">
          <View className="w-10 h-10 rounded-xl bg-emerald-500/15 items-center justify-center">
            <Ionicons name="restaurant-outline" size={20} color="#10B981" />
          </View>
          <View>
            <Text className="text-base font-extrabold text-theme-text">Daily AI Nutrition Protocol</Text>
            <Text className="text-[11px] text-theme-muted">Fueling & Conversational Meal Targets</Text>
          </View>
        </View>

        {hasLoggedFood && (
          <TouchableOpacity
            onPress={handleClearLoggedFood}
            className="bg-theme-card border border-theme-border px-3.5 py-1.5 rounded-full flex-row items-center gap-1.5 shadow-sm"
          >
            <Ionicons name="refresh-outline" size={12} color="#94A3B8" />
            <Text className="text-xs font-bold text-theme-muted">Reset Today</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Content Box matching Quest Card inner box styling */}
      <View className="p-4 rounded-2xl border border-theme-border bg-theme-bg/60">
        {/* Rationale Banner */}
        <View className="p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/20 mb-4">
          <Text className="text-xs font-bold text-emerald-600 mb-0.5">{nutrition.focusTitle}</Text>
          <Text className="text-xs text-theme-text/80 leading-relaxed">{nutrition.rationale}</Text>
        </View>

        {/* 3 Macro Rings Row */}
        <View className="flex-row items-center justify-around py-2">
          {/* Carbohydrates Ring */}
          <MacroRingGauge
            label="Carbs"
            current={nutrition.carbs}
            target={nutrition.carbsTarget}
            color="#3B82F6"
            unit="g"
          />

          {/* Protein Ring */}
          <MacroRingGauge
            label="Protein"
            current={nutrition.protein}
            target={nutrition.proteinTarget}
            color="#10B981"
            unit="g"
          />

          {/* Fat Ring */}
          <MacroRingGauge
            label="Fat"
            current={nutrition.fat}
            target={nutrition.fatTarget}
            color="#F59E0B"
            unit="g"
          />
        </View>

        {/* Logged Meal Items List */}
        {loggedItems.length > 0 && (
          <View className="mt-4 pt-3 border-t border-theme-border/50">
            <Text className="text-xs font-extrabold text-theme-text mb-2">Logged Foods Today</Text>
            <View className="space-y-1.5">
              {loggedItems.map((item, idx) => (
                <View
                  key={`${item.name}-${idx}`}
                  className="flex-row items-center justify-between p-2.5 bg-theme-card rounded-xl border border-theme-border"
                >
                  <Text className="text-xs font-bold text-theme-text">{item.name}</Text>
                  <Text className="text-xs font-mono font-bold text-theme-accent">{item.calories} kcal</Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </View>
    </Card>
  );
}
