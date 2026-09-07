import React from 'react';
import { useTheme } from '@/hooks/use-theme';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCoachChat } from '@/context/CoachChatStore';
import { RookaMark } from './RookaPoints';

interface ScreenHeaderTitleRowProps {
  title?: string;
  children?: React.ReactNode;
  dateLabel?: string;
  rightElement?: React.ReactNode;
  showCoachBadge?: boolean;
  unreadCount?: number;
  onCoachPress?: () => void;
}

export function ScreenHeaderTitleRow({
  title,
  children,
  dateLabel,
  rightElement,
  showCoachBadge = true,
  unreadCount,
  onCoachPress,
}: ScreenHeaderTitleRowProps) {
  const theme = useTheme();
  const router = useRouter();
  const { unreadCount: storeUnreadCount } = useCoachChat();
  const effectiveUnreadCount = unreadCount !== undefined ? unreadCount : storeUnreadCount;

  const now = new Date();
  const dayOfWeekShort = now.toLocaleDateString('en-US', { weekday: 'short' });
  const monthShort = now.toLocaleDateString('en-US', { month: 'short' });
  const dayNum = now.getDate();
  const formattedDate = dateLabel || `${dayOfWeekShort}, ${monthShort} ${dayNum}`;

  const handleCoachPress = () => {
    if (onCoachPress) {
      onCoachPress();
    } else {
      router.push('/(tabs)/coach');
    }
  };

  return (
    <View className="flex-row justify-between items-center mb-3">
      <View className="flex-1 mr-2">
        {children || (
          <Text className="text-2xl font-extrabold text-theme-text tracking-tight">{title}</Text>
        )}
      </View>
      <View className="flex-row items-center gap-x-2">
        {rightElement}
        {showCoachBadge && effectiveUnreadCount > 0 && (
          <TouchableOpacity
            onPress={handleCoachPress}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`Coach chat, ${effectiveUnreadCount} unread message${effectiveUnreadCount > 1 ? 's' : ''}`}
            className="flex-row items-center bg-theme-card border border-theme-border rounded-full pl-2.5 pr-2 py-1 shadow-sm"
          >
            <RookaMark size={14} color={theme.tint} />
            <Text className="text-xs font-bold text-theme-text ml-1.5 mr-1.5">Coach</Text>
            <View className="bg-red-500 rounded-full min-w-[18px] h-[18px] px-1 items-center justify-center">
              <Text className="text-white text-[10px] font-black leading-none">
                {effectiveUnreadCount > 9 ? '9+' : effectiveUnreadCount}
              </Text>
            </View>
          </TouchableOpacity>
        )}
        <View className="flex-row items-center gap-1.5 py-1.5">
          <Ionicons name="calendar-outline" size={13} color={theme.tint} />
          <Text className="text-xs font-bold font-mono text-theme-muted">{formattedDate}</Text>
        </View>
      </View>
    </View>
  );
}

