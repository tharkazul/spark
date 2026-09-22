import React from 'react';
import { View } from 'react-native';
import { Skeleton } from '../ui/Skeleton';

export interface ActiveQuestSkeletonProps {
  variant?: 'full' | 'tile';
}

export function ActiveQuestSkeleton({ variant = 'full' }: ActiveQuestSkeletonProps) {
  if (variant === 'tile') {
    return (
      <View className="flex-1 bg-theme-card border border-theme-border/60 rounded-card p-4 justify-between h-[152px] shadow-sm">
        <View className="gap-y-1.5">
          <Skeleton.Line width={70} height={12} />
          <Skeleton.Line width={50} height={22} borderRadius={4} className="mt-1" />
        </View>

        <View className="flex-row items-end justify-between">
          <Skeleton.Rect width={52} height={24} borderRadius={12} />
          <Skeleton.Circle size={40} />
        </View>
      </View>
    );
  }

  return (
    <View className="bg-theme-bg/70 rounded-xl p-4 border border-theme-border/40">
      {/* Top row: Title line + Points Badge */}
      <View className="flex-row justify-between items-start mb-2">
        <View className="flex-1 mr-3 gap-y-1.5">
          <Skeleton.Line width="75%" height={15} />
          <Skeleton.Line width="45%" height={12} />
        </View>
        <Skeleton.Rect width={60} height={22} borderRadius={6} />
      </View>

      {/* Progress Bar Section */}
      <View className="my-2.5">
        <View className="flex-row justify-between items-center mb-1.5">
          <Skeleton.Line width={90} height={11} />
          <Skeleton.Line width={32} height={11} />
        </View>
        <Skeleton.Rect width="100%" height={10} borderRadius={5} />
      </View>

      {/* Bottom row: Time remaining + Active Status pill */}
      <View className="flex-row justify-between items-center pt-1 mt-1">
        <View className="flex-row items-center gap-x-1.5">
          <Skeleton.Circle size={13} />
          <Skeleton.Line width={110} height={11} />
        </View>
        <Skeleton.Rect width={50} height={20} borderRadius={6} />
      </View>
    </View>
  );
}
