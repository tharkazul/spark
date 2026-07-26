import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Card } from '../ui/Card';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

interface NutritionTabProps {
  nutritionData?: {
    title: string;
    description: string;
    carbsGrams: number;
    proteinGrams: number;
    fatGrams: number;
  };
}

export const NutritionTab: React.FC<NutritionTabProps> = ({
  nutritionData = {
    title: 'Threshold Run Fueling & Muscle Preservation',
    description:
      'To fuel today\'s intense threshold run and support recovery from a high 23.94 Spark Points load, we are elevating carbohydrates to replenish glycogen while keeping protein exceptionally high to protect your 74kg muscle mass target during this weight-loss phase.',
    carbsGrams: 425,
    proteinGrams: 215,
    fatGrams: 75,
  },
}) => {
  return (
    <View className="space-y-4">
      {/* DAILY AI NUTRITION PROTOCOL CARD */}
      <Card className="mb-4 bg-theme-card border-theme-border relative overflow-hidden">
        <View className="h-1 bg-gradient-to-r from-theme-accent via-blue-500 to-indigo-500 absolute top-0 left-0 right-0" />

        <View className="flex-row items-center space-x-2 mb-3 mt-1">
          <Text className="text-base">🥗</Text>
          <Text className="text-xs font-bold text-theme-muted uppercase tracking-wider">
            Daily AI Nutrition Protocol
          </Text>
        </View>

        <Text className="text-lg font-extrabold text-theme-text mb-2">
          {nutritionData.title}
        </Text>

        <Text className="text-xs text-theme-muted leading-5 mb-5">
          {nutritionData.description}
        </Text>

        {/* MACRO CIRCLES / TARGET BADGES */}
        <View className="flex-row justify-around items-center py-2 border-t border-b border-theme-border/50 my-2">
          {/* Carbs */}
          <View className="items-center">
            <View className="w-20 h-20 rounded-full border-4 border-[#208AEF] items-center justify-center bg-[#208AEF]/10 shadow-sm">
              <Text className="text-base font-black text-theme-text">
                {nutritionData.carbsGrams}g
              </Text>
            </View>
            <Text className="text-[10px] font-bold text-theme-muted uppercase tracking-widest mt-2">
              Carbs
            </Text>
          </View>

          {/* Protein */}
          <View className="items-center">
            <View className="w-20 h-20 rounded-full border-4 border-[#E3494F] items-center justify-center bg-[#E3494F]/10 shadow-sm">
              <Text className="text-base font-black text-theme-text">
                {nutritionData.proteinGrams}g
              </Text>
            </View>
            <Text className="text-[10px] font-bold text-theme-muted uppercase tracking-widest mt-2">
              Protein
            </Text>
          </View>

          {/* Fat */}
          <View className="items-center">
            <View className="w-20 h-20 rounded-full border-4 border-[#F9CF45] items-center justify-center bg-[#F9CF45]/10 shadow-sm">
              <Text className="text-base font-black text-theme-text">
                {nutritionData.fatGrams}g
              </Text>
            </View>
            <Text className="text-[10px] font-bold text-theme-muted uppercase tracking-widest mt-2">
              Fat
            </Text>
          </View>
        </View>
      </Card>

      {/* FUELING STRATEGY & TIMING */}
      <Card className="mb-4 bg-theme-card border-theme-border">
        <Text className="text-xs font-bold text-theme-muted uppercase tracking-wider mb-3">
          Fueling Schedule & Nutrient Timing
        </Text>

        <View className="space-y-3">
          {/* Pre-Workout */}
          <View className="flex-row items-center bg-theme-bg/60 border border-theme-border rounded-xl p-3 mb-2">
            <View className="w-10 h-10 rounded-full bg-blue-500/15 items-center justify-center mr-3 border border-blue-500/30">
              <Ionicons name="time-outline" size={20} color="#208AEF" />
            </View>
            <View className="flex-1">
              <Text className="text-xs font-bold text-theme-text">Pre-Workout (60 mins prior)</Text>
              <Text className="text-[11px] text-theme-muted mt-0.5">
                60g fast-acting carbs (banana + oats) + 300ml water.
              </Text>
            </View>
          </View>

          {/* Intra-Workout */}
          <View className="flex-row items-center bg-theme-bg/60 border border-theme-border rounded-xl p-3 mb-2">
            <View className="w-10 h-10 rounded-full bg-amber-500/15 items-center justify-center mr-3 border border-amber-500/30">
              <Ionicons name="flash-outline" size={20} color="#F9CF45" />
            </View>
            <View className="flex-1">
              <Text className="text-xs font-bold text-theme-text">Intra-Workout (During Run)</Text>
              <Text className="text-[11px] text-theme-muted mt-0.5">
                30g carbs/hr electrolyte gel or hydrogel drink mix.
              </Text>
            </View>
          </View>

          {/* Post-Workout */}
          <View className="flex-row items-center bg-theme-bg/60 border border-theme-border rounded-xl p-3">
            <View className="w-10 h-10 rounded-full bg-emerald-500/15 items-center justify-center mr-3 border border-emerald-500/30">
              <Ionicons name="fitness-outline" size={20} color="#34C759" />
            </View>
            <View className="flex-1">
              <Text className="text-xs font-bold text-theme-text">Post-Workout Recovery</Text>
              <Text className="text-[11px] text-theme-muted mt-0.5">
                35g whey protein isolate + 75g carbs within 45 mins.
              </Text>
            </View>
          </View>
        </View>
      </Card>

      {/* HYDRATION STATUS */}
      <Card className="mb-6 bg-theme-card border-theme-border">
        <View className="flex-row items-center justify-between mb-2">
          <View className="flex-row items-center space-x-2">
            <Ionicons name="water" size={18} color="#16ACBD" />
            <Text className="text-xs font-bold text-theme-muted uppercase tracking-wider">
              Hydration Target
            </Text>
          </View>
          <Text className="text-xs font-bold text-theme-accent">2.4 / 3.2 L</Text>
        </View>

        <View className="w-full h-2.5 bg-theme-bg rounded-full overflow-hidden border border-theme-border/50 my-1">
          <View style={{ width: '75%' }} className="h-full bg-theme-accent rounded-full" />
        </View>
      </Card>
    </View>
  );
};
