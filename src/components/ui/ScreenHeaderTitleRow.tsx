import React from 'react';
import { useTheme } from '@/hooks/use-theme';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface ScreenHeaderTitleRowProps {
  title?: string;
  children?: React.ReactNode;
  dateLabel?: string;
  rightElement?: React.ReactNode;
}

export function ScreenHeaderTitleRow({ title, children, dateLabel, rightElement }: ScreenHeaderTitleRowProps) {
    const theme = useTheme();
  const now = new Date();
  const dayOfWeekShort = now.toLocaleDateString('en-US', { weekday: 'short' });
  const monthShort = now.toLocaleDateString('en-US', { month: 'short' });
  const dayNum = now.getDate();
  const formattedDate = dateLabel || `${dayOfWeekShort}, ${monthShort} ${dayNum}`;

  return (
    <View className="flex-row justify-between items-center mb-3">
      <View className="flex-1 mr-2">
        {children || (
          <Text className="text-2xl font-extrabold text-theme-text tracking-tight">{title}</Text>
        )}
      </View>
      <View className="flex-row items-center gap-x-2">
        {rightElement}
        <View className="flex-row items-center gap-1.5 py-1.5">
          <Ionicons name="calendar-outline" size={13} color={theme.tint} />
          <Text className="text-xs font-bold font-mono text-theme-muted">{formattedDate}</Text>
        </View>
      </View>
    </View>
  );
}
