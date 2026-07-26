import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Animated, Image } from 'react-native';
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
  // Pulse animation for live coach status indicator
  const pulseAnim = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.4,
          duration: 1200,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [pulseAnim]);

  const handleDiscussPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onDiscussPlan();
  };

  return (
    <Card className="p-5 md:p-6 overflow-hidden mb-5 border-theme-accent/40 bg-theme-accent-soft/20 shadow-md">
      {/* Subtle decorative background icon */}
      <View className="absolute -right-4 -top-4 opacity-5 pointer-events-none">
        <Ionicons name="sparkles" size={130} color="#16ACBD" />
      </View>

      <View className="flex-row items-start gap-4">
        {/* Coach Avatar */}
        <View className="relative">
          <View className="w-16 h-16 rounded-full border-2 border-theme-accent bg-theme-bg overflow-hidden shadow-md items-center justify-center">
            <Image
              source={{ uri: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80' }}
              className="w-full h-full"
              resizeMode="cover"
            />
          </View>
          <View className="absolute bottom-0 right-0 w-4.5 h-4.5 rounded-full bg-emerald-500 border-2 border-theme-bg items-center justify-center shadow-sm">
            <Animated.View
              className="w-2 h-2 rounded-full bg-white"
              style={{ opacity: pulseAnim }}
            />
          </View>
        </View>

        {/* Briefing Content */}
        <View className="flex-1">
          <View className="flex-row items-center gap-2 mb-2">
            <Text className="text-xs uppercase tracking-widest font-extrabold text-theme-accent">
              Coach Highlights
            </Text>
            <Animated.View
              className="w-2 h-2 rounded-full bg-emerald-500"
              style={{ opacity: pulseAnim }}
            />
          </View>

          <Text className="text-theme-text text-base font-medium leading-relaxed mb-4">
            {message}
          </Text>

          {/* Discuss Today's Plan Button */}
          <TouchableOpacity
            onPress={handleDiscussPress}
            activeOpacity={0.8}
            className="w-full bg-theme-accent py-3.5 px-5 rounded-2xl shadow-lg flex-row items-center justify-center gap-2"
          >
            <Ionicons name="chatbubbles" size={20} color="#FFFFFF" />
            <Text className="text-white text-base font-bold">Discuss Today's Plan</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Card>
  );
}
