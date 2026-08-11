import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTabBar } from '../../context/TabBarContext';
import { useUser } from '../../context/UserStore';
import { canAccessLeaderboard } from '../../utils/permissions';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useLanguage } from '../../context/LanguageContext';

import { ScreenHeaderTitleRow } from '../../components/ui/ScreenHeaderTitleRow';

export default function SocialScreen() {
  const { user } = useUser();
  const { t } = useLanguage();
  const { tabBarOccupied } = useTabBar();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const hasAccess = canAccessLeaderboard(user?.subscription_tier);

  return (
    <View className="flex-1 bg-theme-bg" style={{ paddingTop: insets.top }}>
      <View className="px-5 pt-3 pb-2 bg-theme-bg">
        <ScreenHeaderTitleRow title="Social" />
      </View>

      <ScrollView className="flex-1 px-5 pt-2" contentContainerStyle={{ paddingBottom: tabBarOccupied + 20 }} showsVerticalScrollIndicator={false}>
        {!hasAccess ? (
          <View className="bg-theme-card rounded-2xl p-6 items-center justify-center mt-10">
            <Ionicons name="lock-closed" size={48} color="#16ACBD" className="mb-4" />
            <Text className="text-lg font-extrabold text-theme-text mt-4 text-center">Leaderboard Locked</Text>
            <Text className="text-sm text-theme-muted mt-2 text-center">Upgrade to the Subscription Tier to see how you rank against your friends.</Text>
            <TouchableOpacity 
              onPress={() => router.navigate('/profile')}
              className="mt-6 bg-theme-accent px-6 py-3 rounded-full"
            >
              <Text className="text-white font-bold text-center">Upgrade Now</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View className="bg-theme-card rounded-2xl p-6 mb-6">
            <View className="flex-row items-center mb-6">
              <Ionicons name="trophy" size={24} color="#FF5A1F" />
              <Text className="text-lg font-extrabold text-theme-text ml-2">Leaderboard</Text>
            </View>
            <View className="flex-row justify-between items-center py-3 border-b border-theme-bg">
              <Text className="text-base font-bold text-theme-text">1. Athlete One</Text>
              <Text className="text-base font-bold text-theme-accent">2405 Points</Text>
            </View>
            <View className="flex-row justify-between items-center py-3 border-b border-theme-bg">
              <Text className="text-base font-bold text-theme-text">2. Athlete Two</Text>
              <Text className="text-base font-bold text-theme-accent">1930 Points</Text>
            </View>
            <View className="flex-row justify-between items-center py-3">
              <Text className="text-base font-bold text-theme-text">3. Athlete Three</Text>
              <Text className="text-base font-bold text-theme-accent">1200 Points</Text>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
