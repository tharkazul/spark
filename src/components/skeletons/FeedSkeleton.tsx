import React from 'react';
import { View } from 'react-native';
import { Skeleton } from '../ui/Skeleton';

export function FeedSkeleton({ count = 2 }: { count?: number }) {
  return (
    <View className="gap-y-3.5 pb-4">
      {Array.from({ length: count }).map((_, index) => (
        <View
          key={`feed-skeleton-${index}`}
          className="bg-theme-card rounded-card p-4 shadow-sm border border-slate-100 dark:border-slate-800/60"
        >
          {/* Athlete Header */}
          <View className="flex-row justify-between items-center mb-3">
            <View className="flex-row items-center flex-1">
              <Skeleton.Circle size={40} className="mr-3" />
              <View className="gap-y-1.5 flex-1">
                <Skeleton.Line width="45%" height={14} />
                <Skeleton.Line width="25%" height={10} />
              </View>
            </View>
            <Skeleton.Rect width={55} height={20} borderRadius={10} />
          </View>

          {/* Activity Title & Sport badge */}
          <View className="flex-row items-center justify-between mb-3.5">
            <Skeleton.Line width="60%" height={16} />
            <Skeleton.Rect width={60} height={22} borderRadius={6} />
          </View>

          {/* 3 Metric Pills */}
          <View className="flex-row gap-2 mb-4">
            <View className="flex-1 bg-theme-bg/60 rounded-xl p-2.5 items-center justify-center">
              <Skeleton.Line width="50%" height={10} className="mb-1.5" />
              <Skeleton.Line width="70%" height={18} />
            </View>
            <View className="flex-1 bg-theme-bg/60 rounded-xl p-2.5 items-center justify-center">
              <Skeleton.Line width="50%" height={10} className="mb-1.5" />
              <Skeleton.Line width="70%" height={18} />
            </View>
            <View className="flex-1 bg-theme-bg/60 rounded-xl p-2.5 items-center justify-center">
              <Skeleton.Line width="50%" height={10} className="mb-1.5" />
              <Skeleton.Line width="70%" height={18} />
            </View>
          </View>

          {/* Bottom Action Footer */}
          <View className="flex-row items-center justify-between pt-2 border-t border-theme-border/40">
            <View className="flex-row items-center gap-2">
              <Skeleton.Circle size={28} />
              <Skeleton.Line width={30} height={12} />
            </View>
            <View className="flex-row items-center gap-2">
              <Skeleton.Circle size={28} />
              <Skeleton.Line width={30} height={12} />
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}
