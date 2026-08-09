import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { WorkoutItem, SportType } from '../../types/dashboard';

interface TodaysPlanCardProps {
  dateLabel: string; // e.g. 'FRI Jul 24'
  tempLabel: string; // e.g. '24°C'
  weatherIcon?: string;
  workouts: WorkoutItem[];
  onAdaptPress: () => void;
  onAddWorkout: () => void;
  onSelectWorkout: (workout: WorkoutItem) => void;
}

export function TodaysPlanCard({
  dateLabel,
  tempLabel,
  weatherIcon = 'partly-sunny-outline',
  workouts,
  onAdaptPress,
  onAddWorkout,
  onSelectWorkout,
}: TodaysPlanCardProps) {
  const getDisciplineConfig = (type: SportType) => {
    switch (type) {
      case 'SWIM':
        return {
          bg: 'bg-[#2E8FE0]/20',
          text: 'text-[#38BDF8]',
          borderLeft: 'border-l-[#38BDF8]',
          label: 'SWIM',
          icon: 'water-outline',
          badgeColor: '#38BDF8',
        };
      case 'RUN':
        return {
          bg: 'bg-[#F97316]/20',
          text: 'text-[#FB923C]',
          borderLeft: 'border-l-[#FB923C]',
          label: 'RUN',
          icon: 'walk-outline',
          badgeColor: '#FB923C',
        };
      case 'BIKE':
        return {
          bg: 'bg-[#10B981]/20',
          text: 'text-[#34D399]',
          borderLeft: 'border-l-[#34D399]',
          label: 'BIKE',
          icon: 'bicycle-outline',
          badgeColor: '#34D399',
        };
      case 'STRENGTH':
        return {
          bg: 'bg-[#A855F7]/20',
          text: 'text-[#C084FC]',
          borderLeft: 'border-l-[#C084FC]',
          label: 'STRENGTH',
          icon: 'barbell-outline',
          badgeColor: '#C084FC',
        };
      case 'MOBILITY':
        return {
          bg: 'bg-[#14B8A6]/20',
          text: 'text-[#2DD4BF]',
          borderLeft: 'border-l-[#2DD4BF]',
          label: 'MOBILITY',
          icon: 'body-outline',
          badgeColor: '#2DD4BF',
        };
      default:
        return {
          bg: 'bg-slate-700/30',
          text: 'text-slate-400',
          borderLeft: 'border-l-slate-400',
          label: 'REST',
          icon: 'moon-outline',
          badgeColor: '#94A3B8',
        };
    }
  };

  const handleAdapt = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onAdaptPress();
  };

  const handleAdd = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onAddWorkout();
  };

  const formatHumanDuration = (durationStr?: string, sport?: SportType) => {
    if (!durationStr) return `45 min ${sport ? sport.toLowerCase() : 'session'}`;
    const cleanDur = durationStr.replace(/mins?/i, 'min').trim();
    const sportName = sport ? sport.toLowerCase() : 'session';
    return `${cleanDur} ${sportName}`;
  };

  return (
    <View className="p-4 md:p-5 bg-[#0F172A] rounded-3xl shadow-lg mb-5 overflow-hidden">
      {/* Header Bar */}
      <View className="flex-row items-center justify-between pb-3 mb-3.5">
        <View className="flex-row items-center gap-3">
          <View className="w-10 h-10 rounded-2xl bg-cyan-500/20 items-center justify-center">
            <Ionicons name="fitness-outline" size={20} color="#38BDF8" />
          </View>
          <View>
            <View className="flex-row items-center gap-2">
              <Text className="text-base font-extrabold text-white tracking-tight">Today's Plan</Text>
              <View className="bg-cyan-500/20 px-2 py-0.5 rounded-full">
                <Text className="text-[9px] font-extrabold text-[#38BDF8] uppercase tracking-wider">Today</Text>
              </View>
            </View>
            <Text className="text-[11px] text-slate-400">{dateLabel} · {tempLabel}</Text>
          </View>
        </View>

        {/* Adjust Today Trigger Button */}
        <TouchableOpacity
          onPress={handleAdapt}
          activeOpacity={0.7}
          className="bg-slate-800/80 px-3.5 py-1.5 rounded-full flex-row items-center gap-1.5 shadow-sm"
        >
          <Ionicons name="options-outline" size={13} color="#38BDF8" />
          <Text className="text-xs font-bold text-slate-200">Adjust Today</Text>
        </TouchableOpacity>
      </View>

      {/* Content Area */}
      {workouts.length === 0 ? (
        <View className="p-5 rounded-2xl bg-slate-800/50 flex-col items-center justify-center gap-2">
          <Ionicons name="moon-outline" size={24} color="#94A3B8" />
          <Text className="text-sm font-bold text-white">Rest & Recovery Day</Text>
          <Text className="text-xs text-slate-400 text-center px-4">
            No structured sessions scheduled for today. Take time to stretch and refuel.
          </Text>

          <TouchableOpacity
            onPress={handleAdd}
            className="mt-2 flex-row items-center gap-1.5 px-4 py-2 rounded-xl bg-cyan-500"
          >
            <Ionicons name="add" size={16} color="#FFFFFF" />
            <Text className="text-xs font-extrabold text-white">Log Extra Activity</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View className="space-y-3">
          {workouts.map((workout) => {
            const cfg = getDisciplineConfig(workout.type);
            const humanDuration = formatHumanDuration(workout.duration, workout.type);

            return (
              <TouchableOpacity
                key={workout.id}
                onPress={() => {
                  Haptics.selectionAsync();
                  onSelectWorkout(workout);
                }}
                activeOpacity={0.8}
                className={`p-4 rounded-2xl border-l-4 ${cfg.borderLeft} bg-slate-800/60 flex-col gap-2.5`}
              >
                {/* Top Row: Discipline Tag & Spark Score */}
                <View className="flex-row items-center justify-between">
                  <View className={`px-2.5 py-0.5 rounded-md ${cfg.bg} flex-row items-center gap-1.5`}>
                    <Ionicons name={cfg.icon as any} size={13} color={cfg.badgeColor} />
                    <Text className={`text-xs font-extrabold ${cfg.text}`}>{cfg.label}</Text>
                  </View>

                  <View className="flex-row items-center gap-2">
                    <Text className="text-xs font-mono font-bold text-cyan-400">
                      +{workout.sparkPoints} Spark
                    </Text>

                    {workout.isCompleted && (
                      <View className="flex-row items-center gap-1 bg-emerald-500/20 px-2 py-0.5 rounded-full">
                        <Ionicons name="checkmark-circle" size={12} color="#10B981" />
                        <Text className="text-[9px] font-extrabold text-emerald-400">DONE</Text>
                      </View>
                    )}
                  </View>
                </View>

                {/* Workout Title */}
                <Text className="text-sm font-extrabold text-white leading-snug">{workout.title}</Text>

                {/* Subline: Clean Human Metric Summary + Chevron */}
                <View className="flex-row items-center justify-between pt-1">
                  <Text className="text-xs text-slate-300 font-medium">
                    {humanDuration} · +{workout.sparkPoints} Spark
                  </Text>

                  {workout.actualMetrics ? (
                    <Text className="text-xs font-mono font-bold text-emerald-400">
                      {workout.actualMetrics}
                    </Text>
                  ) : (
                    <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
                  )}
                </View>
              </TouchableOpacity>
            );
          })}

          {/* Quick Add Button */}
          <TouchableOpacity
            onPress={handleAdd}
            activeOpacity={0.8}
            className="w-full py-3 bg-slate-800/40 rounded-2xl flex-row items-center justify-center gap-1.5 active:bg-slate-800"
          >
            <Ionicons name="add-circle-outline" size={16} color="#38BDF8" />
            <Text className="text-xs font-extrabold text-cyan-400">+ Add Exercise</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
