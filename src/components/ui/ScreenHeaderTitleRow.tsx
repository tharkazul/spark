import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface ScreenHeaderTitleRowProps {
  title?: string;
  children?: React.ReactNode;
  dateLabel?: string;
}

export function ScreenHeaderTitleRow({ title, children, dateLabel }: ScreenHeaderTitleRowProps) {
  const now = new Date();
  const dayOfWeekShort = now.toLocaleDateString('en-US', { weekday: 'short' });
  const monthShort = now.toLocaleDateString('en-US', { month: 'short' });
  const dayNum = now.getDate();
  const formattedDate = dateLabel || `${dayOfWeekShort}, ${monthShort} ${dayNum}`;

  return (
    <View className="flex-row justify-between items-center mb-3">
      <View className="flex-1 mr-4">
        {children || (
          <Text className="text-2xl font-extrabold text-theme-text tracking-tight">{title}</Text>
        )}
      </View>
      <View className="flex-row items-center gap-1.5 bg-theme-card px-3 py-1.5 rounded-full">
        <Ionicons name="calendar-outline" size={13} color="#FF5F3B" />
        <Text className="text-xs font-bold font-mono text-theme-muted">{formattedDate}</Text>
      </View>
    </View>
  );
}
