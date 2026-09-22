import React from 'react';
import { View } from 'react-native';
import { Skeleton } from '../ui/Skeleton';

export function TodaysPlanSkeleton() {
  return (
    <View className="mb-5">
      {/* Header Bar */}
      <View className="flex-row items-center justify-between mb-3 px-1">
        <View className="flex-row items-center gap-2">
          <Skeleton.Line width={100} height={18} />
          <Skeleton.Line width={45} height={14} />
        </View>
        <Skeleton.Rect width={65} height={26} borderRadius={13} />
      </View>

      {/* Workout Card Container */}
      <View className="p-3.5 bg-theme-card border border-theme-border/60 rounded-card shadow-sm">
        <View className="flex-row items-center justify-between">
          {/* Left: Sport Icon + Title & Duration */}
          <View className="flex-row items-center gap-3 flex-1 mr-3">
            <Skeleton.Rect width={40} height={40} borderRadius={12} />
            <View className="flex-1 gap-y-1.5">
              <Skeleton.Line width="75%" height={15} />
              <Skeleton.Line width="45%" height={12} />
            </View>
          </View>

          {/* Right: Rooka points placeholder */}
          <Skeleton.Rect width={55} height={24} borderRadius={8} />
        </View>

        {/* Coach note quote box */}
        <View className="mt-3 p-2.5 bg-theme-bg/60 rounded-xl">
          <Skeleton.Line width="85%" height={11} />
        </View>
      </View>
    </View>
  );
}
