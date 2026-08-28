import React from 'react';
import { useTheme } from '@/hooks/use-theme';
import { View, Text, TouchableOpacity } from 'react-native';
import { Card } from '../ui/Card';
import { Ionicons } from '@expo/vector-icons';
import { usePhysique } from '../../context/PhysiqueStore';
import { NutritionProtocolCard } from '../dashboard/NutritionProtocolCard';
import { useLanguage } from '../../context/LanguageContext';

import { useUser } from '../../context/UserStore';
import { useSubscription } from '../../context/SubscriptionStore';
import { useRouter } from 'expo-router';

export const NutritionTab: React.FC = () => {
  const theme = useTheme();
  const { t } = useLanguage();
  const { nutrition } = usePhysique();
  const { user } = useUser();
  const { presentPaywall } = useSubscription();
  const router = useRouter();

  if (user?.subscription_tier === 'free') {
    return (
      <View className="bg-theme-card border border-theme-border rounded-card p-6 items-center justify-center mt-4 shadow-sm">
        <Ionicons name="lock-closed-outline" size={48} color={theme.tint} />
        <Text className="text-lg font-extrabold text-theme-text mt-4 text-center">Nutrition Locked</Text>
        <Text className="text-sm text-theme-muted mt-2 text-center leading-relaxed">
          Upgrade to the Rooka+ subscription to unlock daily AI nutrition protocols.
        </Text>
        <TouchableOpacity 
          onPress={() => router.navigate({ pathname: '/profile', params: { subtab: 'account' } })}
          className="bg-theme-accent px-6 py-3 rounded-2xl w-full mt-6 shadow-sm shadow-theme-accent/30"
          activeOpacity={0.8}
        >
          <Text className="text-white font-black text-center">Upgrade to Rooka+</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View className="space-y-4">
      {/* DAILY AI NUTRITION PROTOCOL CARD */}
      <NutritionProtocolCard nutrition={nutrition} />

      {/* FUELING STRATEGY & TIMING */}
      <Card className="mb-4 bg-theme-card border-theme-border">
        <Text className="text-xs font-bold text-theme-muted mb-3">
          {t('dashboard.fuelingSchedule')}
        </Text>

        <View className="space-y-3">
          {/* Pre-Workout */}
          <View className="flex-row items-center bg-theme-bg/60 border border-theme-border rounded-xl p-3 mb-2">
            <View className="w-10 h-10 rounded-full bg-theme-accent/15 items-center justify-center mr-3 border border-theme-accent/30">
              <Ionicons name="time-outline" size={20} color={theme.tint} />
            </View>
            <View className="flex-1">
              <Text className="text-xs font-bold text-theme-text">{t('dashboard.preWorkout')}</Text>
              <Text className="text-xs text-theme-muted mt-0.5">
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
              <Text className="text-xs font-bold text-theme-text">{t('dashboard.intraWorkout')}</Text>
              <Text className="text-xs text-theme-muted mt-0.5">
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
              <Text className="text-xs font-bold text-theme-text">{t('dashboard.postWorkout')}</Text>
              <Text className="text-xs text-theme-muted mt-0.5">
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
            <Ionicons name="water" size={18} color={theme.tint} />
            <Text className="text-xs font-bold text-theme-muted">
              {t('dashboard.hydrationTarget')}
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
