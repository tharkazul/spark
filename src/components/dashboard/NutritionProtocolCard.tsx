import React from 'react';
import { View, Text } from 'react-native';
import { Card } from '../ui/Card';
import { Ionicons } from '@expo/vector-icons';
import { NutritionMacro } from '../../types/dashboard';

interface NutritionProtocolCardProps {
  nutrition: NutritionMacro;
}

export function NutritionProtocolCard({ nutrition }: NutritionProtocolCardProps) {
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
            <Text className="text-[9px] text-theme-muted">Fueling & Recovery Targets</Text>
          </View>
        </View>
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

        {/* Macro Gauges Grid */}
        <View className="flex-row justify-around items-center pt-2 pb-1">
          {/* Carbs Gauge (Spark Teal / Cyan) */}
          <View className="items-center">
            <View className="w-16 h-16 rounded-full border-[3.5px] border-theme-accent bg-theme-accent/15 items-center justify-center mb-1.5 shadow-sm">
              <Text className="font-extrabold text-theme-text text-sm">{nutrition.carbs}g</Text>
            </View>
            <Text className="text-[10px] text-theme-accent uppercase font-extrabold tracking-wider">Carbs</Text>
          </View>

          {/* Protein Gauge (Recovery Emerald) */}
          <View className="items-center">
            <View className="w-16 h-16 rounded-full border-[3.5px] border-emerald-500 bg-emerald-500/15 items-center justify-center mb-1.5 shadow-sm">
              <Text className="font-extrabold text-theme-text text-sm">{nutrition.protein}g</Text>
            </View>
            <Text className="text-[10px] text-emerald-500 uppercase font-extrabold tracking-wider">Protein</Text>
          </View>

          {/* Fat Gauge (Warm Gold / Amber) */}
          <View className="items-center">
            <View className="w-16 h-16 rounded-full border-[3.5px] border-amber-500 bg-amber-500/15 items-center justify-center mb-1.5 shadow-sm">
              <Text className="font-extrabold text-theme-text text-sm">{nutrition.fat}g</Text>
            </View>
            <Text className="text-[10px] text-amber-500 uppercase font-extrabold tracking-wider">Fat</Text>
          </View>
        </View>
      </View>
    </Card>
  );
}
