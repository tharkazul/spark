import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
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

  const rawItems = nutrition.loggedItems;
  const loggedItems: any[] = Array.isArray(rawItems) ? rawItems : (typeof rawItems === 'string' ? rawItems.split(',').filter(Boolean) : []);
  const hasLoggedFood = (nutrition.loggedCarbs || 0) > 0 || (nutrition.loggedProtein || 0) > 0 || (nutrition.loggedFat || 0) > 0;

  return (
    <View className="mb-4 rounded-3xl bg-theme-card shadow-sm">
      <View className="p-0 overflow-hidden rounded-3xl">
      {/* Header Bar matching Quest Card header design */}
      <View className="px-4 py-3 flex-row justify-between items-center bg-theme-bg/40">
        <View className="flex-row items-center gap-2">
          <View className="w-7 h-7 rounded-lg bg-emerald-500/15 items-center justify-center">
            <Ionicons name="restaurant-outline" size={14} color="#10B981" />
          </View>
          <View>
            <Text className="text-sm font-extrabold text-theme-text">Today's Fueling Plan</Text>
            <Text className="text-[9px] text-theme-muted font-medium">Macro Fueling & Meal Targets</Text>
          </View>
        </View>

        {hasLoggedFood && (
          <TouchableOpacity
            onPress={handleClearLoggedFood}
            className="flex-row items-center gap-1 bg-theme-bg/60 px-3 py-1.5 rounded-full"
          >
            <Ionicons name="refresh-outline" size={12} color="#94A3B8" />
            <Text className="text-[10px] font-bold text-theme-muted">Reset Today</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Main Content Area matching Quest Card inner box styling */}
      <View className="p-3.5">
        <View className="p-4 bg-theme-bg/50 rounded-2xl">
          {/* Rationale Banner */}
          <View className="p-3 bg-emerald-500/10 rounded-xl mb-4">
            <Text className="text-xs font-bold text-emerald-500 mb-0.5">{nutrition.focusTitle}</Text>
            <Text className="text-xs text-theme-text/80 leading-relaxed">{nutrition.rationale}</Text>
          </View>

          {/* 3 Macro Rings Row (Carbs, Protein, Fat) */}
          <View className="flex-row items-center justify-around py-2">
            {/* Carbohydrates Ring */}
            <MacroRingGauge
              label="Carbs"
              target={nutrition.carbsTarget}
              logged={nutrition.loggedCarbs || 0}
            />

            {/* Protein Ring */}
            <MacroRingGauge
              label="Protein"
              target={nutrition.proteinTarget}
              logged={nutrition.loggedProtein || 0}
            />

            {/* Fat Ring */}
            <MacroRingGauge
              label="Fat"
              target={nutrition.fatTarget}
              logged={nutrition.loggedFat || 0}
            />
          </View>

          {/* Logged Meal Items List */}
          {loggedItems.length > 0 && (
            <View className="mt-4 pt-3 border-t border-theme-border/20">
              <Text className="text-xs font-extrabold text-theme-text mb-2">Logged Foods Today</Text>
              <View className="space-y-1.5">
                {loggedItems.map((item: any, idx: number) => (
                  <View
                    key={`${item.name || item}-${idx}`}
                    className="flex-row items-center justify-between p-2.5 bg-theme-card/80 rounded-xl"
                  >
                    <Text className="text-xs font-bold text-theme-text">{typeof item === 'string' ? item : item.name}</Text>
                    {typeof item !== 'string' && item.calories && (
                      <Text className="text-xs font-mono font-bold text-theme-accent">{item.calories} kcal</Text>
                    )}
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>
        </View>
      </View>
    </View>
  );
}
