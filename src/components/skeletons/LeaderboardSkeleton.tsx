import React from 'react';
import { View } from 'react-native';
import { Skeleton } from '../ui/Skeleton';

export function LeaderboardSkeleton({ count = 5 }: { count?: number }) {
  return (
    <View className="pb-4">
      {Array.from({ length: count }).map((_, index) => (
        <View
          key={`leaderboard-skeleton-${index}`}
          className="bg-theme-card border border-theme-border/60 rounded-2xl p-4 mb-2.5 flex-row justify-between items-center shadow-sm"
        >
          {/* Left rank + avatar + name */}
          <View className="flex-row items-center gap-x-3 flex-1">
            <Skeleton.Circle size={36} />
            <Skeleton.Circle size={38} />
            <View className="gap-y-1.5 flex-1 pr-3">
              <Skeleton.Line width="65%" height={14} />
              <Skeleton.Line width="35%" height={10} />
            </View>
          </View>

          {/* Right points pill */}
          <Skeleton.Rect width={70} height={28} borderRadius={14} />
        </View>
      ))}
    </View>
  );
}
