import React from 'react';
import { View, Text, TouchableOpacity, Image } from 'react-native';
import { Card } from '../ui/Card';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

interface CoachHighlightCardProps {
  message: string;
  onDiscussPlan: () => void;
}

export function CoachHighlightCard({
  message,
  onDiscussPlan,
}: CoachHighlightCardProps) {
  const handleDiscussPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onDiscussPlan();
  };

  return (
    <Card className="p-0 overflow-hidden mb-3.5 border-theme-border shadow-sm">
      {/* Header Bar */}
      <View className="px-4 py-2.5 border-b border-theme-border/70 flex-row justify-between items-center bg-theme-bg/60">
        <View className="flex-row items-center gap-2">
          <View className="w-7 h-7 rounded-lg bg-theme-accent/15 border border-theme-accent/30 items-center justify-center">
            <Ionicons name="sparkles-outline" size={14} color="#16ACBD" />
          </View>
          <View>
            <Text className="text-sm font-extrabold text-theme-text">Coach Highlights</Text>
            <Text className="text-[9px] text-theme-muted">AI Daily Briefing & Advice</Text>
          </View>
        </View>
      </View>

      {/* Main Card Content */}
      <View className="p-3.5">
        <View className="flex-row items-center gap-3 mb-3">
          {/* Coach Avatar */}
          <View className="w-11 h-11 rounded-full border-2 border-theme-accent bg-theme-bg overflow-hidden shadow-md items-center justify-center">
            <Image
              source={{ uri: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80' }}
              className="w-full h-full"
              resizeMode="cover"
            />
          </View>

          {/* Briefing Content */}
          <View className="flex-1">
            <Text className="text-theme-text text-xs md:text-sm font-medium leading-snug">
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
          <Text className="text-white text-xs font-extrabold">Discuss Today's Plan</Text>
        </TouchableOpacity>
      </View>
    </Card>
  );
}
