import React from 'react';
import { View } from 'react-native';
import { Skeleton } from '../ui/Skeleton';

export function CoachChatSkeleton() {
  return (
    <View className="flex-1 px-4 py-3 justify-end gap-y-4">
      {/* 1. Coach Greeting Message Bubble */}
      <View className="flex-row items-end gap-x-2.5 max-w-[85%]">
        <Skeleton.Circle size={32} />
        <View className="bg-theme-card border border-theme-border/50 rounded-2xl rounded-bl-sm p-4 gap-y-2 flex-1 shadow-sm">
          <Skeleton.Line width="90%" height={14} />
          <Skeleton.Line width="75%" height={14} />
          <Skeleton.Line width="40%" height={14} />
        </View>
      </View>

      {/* 2. User Response Bubble */}
      <View className="self-end max-w-[75%] bg-theme-accent/20 border border-theme-accent/30 rounded-2xl rounded-br-sm p-3.5 gap-y-2">
        <Skeleton.Line width={180} height={14} />
        <Skeleton.Line width={120} height={14} />
      </View>

      {/* 3. Coach Suggestion / Workout Card Bubble */}
      <View className="flex-row items-end gap-x-2.5 max-w-[90%]">
        <Skeleton.Circle size={32} />
        <View className="bg-theme-card border border-theme-border/50 rounded-2xl rounded-bl-sm p-4 gap-y-3 flex-1 shadow-sm">
          <Skeleton.Line width="80%" height={14} />
          
          {/* Nested Workout Card Placeholder */}
          <View className="bg-theme-bg/80 border border-theme-border/60 rounded-xl p-3 gap-y-2">
            <View className="flex-row justify-between items-center">
              <Skeleton.Line width="50%" height={14} />
              <Skeleton.Rect width={50} height={20} borderRadius={6} />
            </View>
            <Skeleton.Line width="85%" height={11} />
            <View className="flex-row gap-2 mt-1">
              <Skeleton.Rect width={65} height={24} borderRadius={8} />
              <Skeleton.Rect width={65} height={24} borderRadius={8} />
            </View>
          </View>

          <Skeleton.Line width="55%" height={12} />
        </View>
      </View>
    </View>
  );
}
