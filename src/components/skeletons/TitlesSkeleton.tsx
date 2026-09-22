import React from 'react';
import { View } from 'react-native';
import { Skeleton } from '../ui/Skeleton';

export function TitlesSkeleton({ count = 2 }: { count?: number }) {
  return (
    <View className="gap-y-2 py-0.5">
      {Array.from({ length: count }).map((_, idx) => (
        <View
          key={`title-skeleton-${idx}`}
          className="flex-row items-center justify-between p-3 rounded-xl bg-theme-bg border border-theme-border/40"
        >
          <View className="flex-row items-center gap-x-2.5 flex-1 mr-3">
            <Skeleton.Circle size={20} />
            <View className="flex-1 gap-y-1.5">
              <Skeleton.Line width="55%" height={14} />
              <Skeleton.Line width="80%" height={10} />
            </View>
          </View>
          <Skeleton.Rect width={24} height={24} borderRadius={12} />
        </View>
      ))}
    </View>
  );
}
