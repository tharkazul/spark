import React from 'react';
import { View, Text } from 'react-native';
import { Card } from '../ui/Card';
import { Ionicons } from '@expo/vector-icons';
import { usePhysique } from '../../context/PhysiqueStore';
import { NutritionProtocolCard } from '../dashboard/NutritionProtocolCard';

export const NutritionTab: React.FC = () => {
  const { nutrition } = usePhysique();

  return (
    <View className="space-y-4">
      {/* DAILY AI NUTRITION PROTOCOL CARD */}
      <NutritionProtocolCard nutrition={nutrition} />

      {/* FUELING STRATEGY & TIMING */}
      <Card className="mb-4 bg-theme-card">
        <Text className="text-xs font-bold text-theme-muted uppercase tracking-wider mb-3">
          Fueling Schedule & Nutrient Timing
        </Text>

        <View className="space-y-3">
          {/* Pre-Workout */}
          <View className="flex-row items-center bg-theme-bg/60 rounded-xl p-3 mb-2">
            <View className="w-10 h-10 rounded-full bg-orange-500/15 items-center justify-center mr-3">
              <Ionicons name="time-outline" size={20} color="#FF5A1F" />
            </View>
            <View className="flex-1">
              <Text className="text-xs font-bold text-theme-text">Pre-Workout (60 mins prior)</Text>
              <Text className="text-[11px] text-theme-muted mt-0.5">
                60g fast-acting carbs (banana + oats) + 300ml water.
              </Text>
            </View>
          </View>

          {/* Intra-Workout */}
          <View className="flex-row items-center bg-theme-bg/60 rounded-xl p-3 mb-2">
            <View className="w-10 h-10 rounded-full bg-amber-500/15 items-center justify-center mr-3">
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
          <View className="flex-row items-center bg-theme-bg/60 rounded-xl p-3">
            <View className="w-10 h-10 rounded-full bg-emerald-500/15 items-center justify-center mr-3">
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
      <Card className="mb-6 bg-theme-card">
        <View className="flex-row items-center justify-between mb-2">
          <View className="flex-row items-center space-x-2">
            <Ionicons name="water" size={18} color="#FF5A1F" />
            <Text className="text-xs font-bold text-theme-muted uppercase tracking-wider">
              Hydration Target
            </Text>
          </View>
          <Text className="text-xs font-bold text-theme-accent">2.4 / 3.2 L</Text>
        </View>

        <View className="w-full h-2.5 bg-theme-bg rounded-full overflow-hidden my-1">
          <View style={{ width: '75%' }} className="h-full bg-theme-accent rounded-full" />
        </View>
      </Card>
    </View>
  );
};
