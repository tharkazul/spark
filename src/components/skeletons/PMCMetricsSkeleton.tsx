import React from 'react';
import { View } from 'react-native';
import { Skeleton } from '../ui/Skeleton';

export function PMCMetricsSkeleton() {
  return (
    <View className="mb-4">
      {/* Section Header */}
      <View className="flex-row items-center justify-between mb-3 px-1">
        <View className="flex-row items-center gap-x-2">
          <Skeleton.Circle size={18} />
          <Skeleton.Line width={150} height={14} />
        </View>
        <Skeleton.Rect width={72} height={20} borderRadius={10} />
      </View>

      {/* 4 Grid Metric Cards (2x2) */}
      <View className="flex-row flex-wrap gap-2.5">
        {/* Metric 1: Fitness (CTL) */}
        <View className="flex-1 min-w-[45%] bg-theme-card rounded-tile p-3.5 shadow-sm">
          <View className="flex-row justify-between items-start mb-2">
            <Skeleton.Line width={48} height={12} />
            <Skeleton.Rect width={36} height={16} borderRadius={4} />
          </View>
          <Skeleton.Line width={56} height={24} borderRadius={6} className="mb-2" />
          <Skeleton.Rect width="100%" height={32} borderRadius={6} />
          <Skeleton.Line width={80} height={10} className="mt-2" />
        </View>

        {/* Metric 2: Fatigue (ATL) */}
        <View className="flex-1 min-w-[45%] bg-theme-card rounded-tile p-3.5 shadow-sm">
          <View className="flex-row justify-between items-start mb-2">
            <Skeleton.Line width={48} height={12} />
            <Skeleton.Rect width={36} height={16} borderRadius={4} />
          </View>
          <Skeleton.Line width={56} height={24} borderRadius={6} className="mb-2" />
          <Skeleton.Rect width="100%" height={32} borderRadius={6} />
          <Skeleton.Line width={74} height={10} className="mt-2" />
        </View>

        {/* Metric 3: Readiness (TSB) */}
        <View className="flex-1 min-w-[45%] bg-theme-card rounded-tile p-3.5 shadow-sm">
          <View className="flex-row justify-between items-start mb-2">
            <Skeleton.Line width={56} height={12} />
            <Skeleton.Line width={42} height={12} />
          </View>
          <Skeleton.Line width={64} height={24} borderRadius={6} className="mb-2" />
          <Skeleton.Rect width="100%" height={32} borderRadius={6} />
          <Skeleton.Rect width={88} height={18} borderRadius={9} className="mt-2" />
        </View>

        {/* Metric 4: Weight Trend */}
        <View className="flex-1 min-w-[45%] bg-theme-card rounded-tile p-3.5 shadow-sm">
          <View className="flex-row justify-between items-start mb-2">
            <Skeleton.Line width={44} height={12} />
            <Skeleton.Circle size={14} />
          </View>
          <Skeleton.Line width={60} height={24} borderRadius={6} className="mb-2" />
          <Skeleton.Rect width="100%" height={32} borderRadius={6} />
          <Skeleton.Line width={82} height={10} className="mt-2" />
        </View>
      </View>
    </View>
  );
}
