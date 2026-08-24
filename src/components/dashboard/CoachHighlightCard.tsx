import React from 'react';
import { View, Text, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useLanguage } from '../../context/LanguageContext';

interface CoachHighlightCardProps {
  message: string;
  onDiscussPlan: () => void;
}

export function CoachHighlightCard({
  message,
  onDiscussPlan,
}: CoachHighlightCardProps) {
  const { t } = useLanguage();

  const handleDiscussPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onDiscussPlan();
  };

  return (
    <View className="p-0 overflow-hidden mb-4 rounded-3xl bg-theme-card/80 shadow-sm">
      {/* Header Bar */}
      <View className="px-4 py-3 flex-row justify-between items-center bg-theme-bg/40">
        <View className="flex-row items-center gap-2">
          <View className="w-7 h-7 rounded-lg bg-theme-accent/15 items-center justify-center">
            <Ionicons name="chatbubble-ellipses-outline" size={14} color="#38BDF8" />
          </View>
          <View>
            <Text className="text-sm font-extrabold text-theme-text">{t('dashboard.coachBriefing')}</Text>
            <Text className="text-xs text-theme-muted">{t('dashboard.dailyInsightAdvice')}</Text>
          </View>
        </View>
      </View>

      {/* Main Content Area */}
      <View className="p-3.5">
        <View className="flex-row items-center gap-3 mb-3">
          {/* Coach Avatar */}
          <View className="w-11 h-11 rounded-full bg-theme-bg overflow-hidden shadow-md items-center justify-center">
            <Image
              source={{ uri: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80' }}
              className="w-full h-full"
              resizeMode="cover"
            />
          </View>

          {/* Briefing Content */}
          <View className="flex-1">
            <Text
              numberOfLines={3}
              ellipsizeMode="tail"
              className="text-theme-text text-xs md:text-sm font-semibold leading-snug"
            >
              {message}
            </Text>
          </View>
        </View>

        {/* Full-width CTA Button */}
        <TouchableOpacity
          onPress={handleDiscussPress}
          activeOpacity={0.8}
          className="w-full bg-theme-accent py-2.5 px-4 rounded-xl shadow-md flex-row items-center justify-center gap-2"
        >
          <Ionicons name="chatbubbles" size={16} color="#FFFFFF" />
          <Text className="text-white text-xs font-extrabold">{t('dashboard.discussTodaysPlan')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
