import React, { useState } from 'react';
import { useTheme } from '@/hooks/use-theme';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SocialMentionPayload } from '../../types/chat';

interface SocialMentionCardProps {
  payload: SocialMentionPayload;
  onPressActivity?: (activityId: number | string) => void;
}

export const SocialMentionCard: React.FC<SocialMentionCardProps> = ({
  payload,
  onPressActivity,
}) => {
    const theme = useTheme();
  return (
    <View className="my-3 bg-theme-card/90 border border-theme-border rounded-2xl p-4 shadow-sm">
      <View className="flex-row items-center gap-2.5 mb-2">
        <View className="w-8 h-8 rounded-full bg-amber-500/20 items-center justify-center">
          <Ionicons name="chatbubble-ellipses" size={16} color="#F59E0B" />
        </View>
        <View className="flex-1">
          <Text className="text-theme-text font-bold text-xs">
            {payload.author_name} mentioned you
          </Text>
          {payload.created_at ? (
            <Text className="text-theme-muted text-xs">
              {new Date(payload.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
          ) : null}
        </View>
      </View>

      <View className="bg-theme-bg/60 p-3 rounded-xl border border-theme-border/40 mb-2.5">
        <Text className="text-theme-text text-xs italic leading-4">
          "{payload.comment_text}"
        </Text>
      </View>

      {payload.activity_id && onPressActivity ? (
        <TouchableOpacity
          onPress={() => onPressActivity(payload.activity_id)}
          className="flex-row items-center justify-between pt-1"
          activeOpacity={0.7}
        >
          <Text className="text-theme-accent font-bold text-xs">View Activity Details</Text>
          <Ionicons name="chevron-forward" size={14} color={theme.tint} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
};
