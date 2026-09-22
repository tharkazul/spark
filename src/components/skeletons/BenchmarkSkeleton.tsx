import React from 'react';
import { View } from 'react-native';
import { Skeleton } from '../ui/Skeleton';

export function BenchmarkSkeleton({ count = 2 }: { count?: number }) {
  return (
    <View className="gap-y-2.5 my-1">
      {Array.from({ length: count }).map((_, idx) => (
        <View
          key={`benchmark-skeleton-${idx}`}
          className="p-3 bg-theme-bg rounded-xl border border-theme-border/60 flex-row items-center justify-between"
        >
          <View className="flex-row items-center gap-x-2.5 flex-1 mr-2">
            <Skeleton.Rect width={32} height={32} borderRadius={8} />
            <View className="flex-1 gap-y-1">
              <Skeleton.Line width="60%" height={13} />
              <Skeleton.Line width="35%" height={10} />
            </View>
          </View>
          <Skeleton.Rect width={60} height={22} borderRadius={6} />
        </View>
      ))}
    </View>
  );
}
