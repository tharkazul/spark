import React from 'react';
import { View, Text } from 'react-native';
import { Card } from '../ui/Card';
import { NutritionMacro } from '../../types/dashboard';

interface NutritionProtocolCardProps {
  nutrition: NutritionMacro;
}

export function NutritionProtocolCard({ nutrition }: NutritionProtocolCardProps) {
  return (
    <Card className="p-0 overflow-hidden mb-6 border-theme-border shadow-sm">
      {/* Top Accent Strip */}
      <View className="h-1.5 bg-gradient-to-r from-theme-accent via-purple-500 to-amber-500 bg-theme-accent" />

      {/* Card Header */}
      <View className="p-4 md:p-5 border-b border-theme-border/60 flex-row items-center justify-between bg-theme-bg/30">
        <View className="flex-row items-center gap-2">
          <Text className="text-lg">🥗</Text>
          <Text className="text-sm font-bold text-theme-text">Daily AI Nutrition Protocol</Text>
        </View>
      </View>

      {/* Content */}
      <View className="p-4 md:p-5">
        {/* Focus Title & Rationale */}
        <Text className="text-base font-bold text-theme-text mb-1">
          {nutrition.focusTitle}
        </Text>
        <Text className="text-xs text-theme-muted leading-relaxed mb-5">
          {nutrition.rationale}
        </Text>

        {/* Macro Gauges Grid */}
        <View className="flex-row justify-around items-center pt-2 pb-1">
          {/* Carbs Gauge */}
          <View className="items-center">
            <View className="w-16 h-16 rounded-full border-[3.5px] border-blue-500/80 bg-blue-500/10 items-center justify-center mb-1.5 shadow-sm">
              <Text className="font-extrabold text-theme-text text-sm">{nutrition.carbs}g</Text>
            </View>
            <Text className="text-[10px] text-theme-muted uppercase font-bold tracking-wider">Carbs</Text>
            <Text className="text-[9px] text-theme-muted/70 mt-0.5">Target: {nutrition.carbsTarget}g</Text>
          </View>

          {/* Protein Gauge */}
          <View className="items-center">
            <View className="w-16 h-16 rounded-full border-[3.5px] border-rose-500/80 bg-rose-500/10 items-center justify-center mb-1.5 shadow-sm">
              <Text className="font-extrabold text-theme-text text-sm">{nutrition.protein}g</Text>
            </View>
            <Text className="text-[10px] text-theme-muted uppercase font-bold tracking-wider">Protein</Text>
            <Text className="text-[9px] text-theme-muted/70 mt-0.5">Target: {nutrition.proteinTarget}g</Text>
          </View>

          {/* Fat Gauge */}
          <View className="items-center">
            <View className="w-16 h-16 rounded-full border-[3.5px] border-amber-500/80 bg-amber-500/10 items-center justify-center mb-1.5 shadow-sm">
              <Text className="font-extrabold text-theme-text text-sm">{nutrition.fat}g</Text>
            </View>
            <Text className="text-[10px] text-theme-muted uppercase font-bold tracking-wider">Fat</Text>
            <Text className="text-[9px] text-theme-muted/70 mt-0.5">Target: {nutrition.fatTarget}g</Text>
          </View>
        </View>
      </View>
    </Card>
  );
}
