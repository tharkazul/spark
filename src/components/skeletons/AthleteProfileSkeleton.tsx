import React from 'react';
import { View } from 'react-native';
import { Skeleton } from '../ui/Skeleton';

export function AthleteProfileSkeleton() {
  return (
    <View className="p-4 gap-y-4">
      {/* Hero / Identity Card */}
      <View className="bg-theme-card rounded-card p-5 border border-theme-border/60 shadow-sm">
        <View className="flex-row items-center gap-x-4">
          <Skeleton.Circle size={64} />
          <View className="flex-1 gap-y-2">
            <Skeleton.Line width="60%" height={18} />
            <Skeleton.Line width="35%" height={13} />
            <Skeleton.Rect width={90} height={20} borderRadius={10} className="mt-1" />
          </View>
        </View>

        {/* Bio / Accolade line */}
        <View className="mt-4 pt-3 border-t border-theme-border/40 gap-y-1.5">
          <Skeleton.Line width="90%" height={12} />
          <Skeleton.Line width="70%" height={12} />
        </View>
      </View>

      {/* Rooka Level Card */}
      <View className="bg-theme-card rounded-card p-4 border border-theme-border/60 shadow-sm">
        <View className="flex-row items-center justify-between mb-3">
          <View className="flex-row items-center gap-x-2">
            <Skeleton.Circle size={32} />
            <Skeleton.Line width={90} height={16} />
          </View>
          <Skeleton.Line width={70} height={14} />
        </View>
        <Skeleton.Rect width="100%" height={12} borderRadius={6} className="my-2" />
        <View className="flex-row justify-between items-center mt-1">
          <Skeleton.Line width={110} height={11} />
          <Skeleton.Line width={30} height={11} />
        </View>
      </View>

      {/* Telemetry Sparklines Cards */}
      <View className="flex-row flex-wrap gap-2.5">
        <View className="flex-1 min-w-[45%] bg-theme-card rounded-tile p-3.5 shadow-sm border border-theme-border/40">
          <Skeleton.Line width={50} height={12} className="mb-2" />
          <Skeleton.Line width={45} height={22} className="mb-2" />
          <Skeleton.Rect width="100%" height={32} borderRadius={6} />
        </View>
        <View className="flex-1 min-w-[45%] bg-theme-card rounded-tile p-3.5 shadow-sm border border-theme-border/40">
          <Skeleton.Line width={50} height={12} className="mb-2" />
          <Skeleton.Line width={45} height={22} className="mb-2" />
          <Skeleton.Rect width="100%" height={32} borderRadius={6} />
        </View>
      </View>
    </View>
  );
}
