import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Card } from '../ui/Card';
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
          bg: 'bg-blue-500/10',
          text: 'text-blue-500',
          borderLeft: 'border-l-blue-500',
          borderColor: 'border-blue-500/30',
          label: 'SWIM',
          icon: 'water-outline',
        };
      case 'RUN':
        return {
          bg: 'bg-amber-500/10',
          text: 'text-amber-500',
          borderLeft: 'border-l-amber-500',
          borderColor: 'border-amber-500/30',
          label: 'RUN',
          icon: 'walk-outline',
        };
      case 'BIKE':
        return {
          bg: 'bg-emerald-500/10',
          text: 'text-emerald-500',
          borderLeft: 'border-l-emerald-500',
          borderColor: 'border-emerald-500/30',
          label: 'BIKE',
          icon: 'bicycle-outline',
        };
      case 'STRENGTH':
        return {
          bg: 'bg-purple-500/10',
          text: 'text-purple-500',
          borderLeft: 'border-l-purple-500',
          borderColor: 'border-purple-500/30',
          label: 'STRENGTH',
          icon: 'barbell-outline',
        };
      case 'MOBILITY':
        return {
          bg: 'bg-teal-500/10',
          text: 'text-teal-500',
          borderLeft: 'border-l-teal-500',
          borderColor: 'border-teal-500/30',
          label: 'MOBILITY',
          icon: 'body-outline',
        };
      default:
        return {
          bg: 'bg-gray-500/10',
          text: 'text-gray-400',
          borderLeft: 'border-l-gray-400',
          borderColor: 'border-gray-500/30',
          label: 'REST',
          icon: 'moon-outline',
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

  return (
    <Card className="p-0 overflow-hidden mb-3.5 border-theme-border shadow-sm">
      {/* Header Bar */}
      <View className="px-4 py-2.5 border-b border-theme-border/70 flex-row justify-between items-center bg-theme-bg/60">
        <View className="flex-row items-center gap-2">
          <View className="w-7 h-7 rounded-lg bg-theme-accent/15 border border-theme-accent/30 items-center justify-center">
            <Ionicons name="calendar-outline" size={14} color="#16ACBD" />
          </View>
          <View>
            <Text className="text-sm font-extrabold text-theme-text">Today's Plan</Text>
            <Text className="text-[9px] text-theme-muted">Daily Training Schedule</Text>
          </View>
        </View>

        {/* Right Info Row: Date + Temp + Adapt Button */}
        <View className="flex-row items-center gap-1.5">
          <View className="bg-theme-card px-2 py-0.5 rounded-lg border border-theme-border flex-row items-center gap-1">
            <Ionicons name={(weatherIcon as any) || 'partly-sunny-outline'} size={12} color="#16ACBD" />
            <Text className="text-[10px] font-bold text-theme-text">{tempLabel}</Text>
          </View>

          <TouchableOpacity
            onPress={handleAdapt}
            activeOpacity={0.7}
            className="flex-row items-center gap-1 bg-theme-accent-soft px-2 py-0.5 rounded-lg border border-theme-accent/30"
          >
            <Ionicons name="flash" size={11} color="#16ACBD" />
            <Text className="text-[10px] font-extrabold text-theme-accent">ADAPT</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Main Content Area */}
      <View className="p-3.5">
        {/* Workouts List */}
        <View className="space-y-3">
          {workouts.length === 0 ? (
            <View className="py-6 items-center justify-center">
              <Ionicons name="sparkles-outline" size={28} color="#8E9BA4" />
              <Text className="text-theme-muted text-xs mt-2 font-medium">No exercises scheduled for today</Text>
            </View>
          ) : (
            workouts.map((workout) => {
              const cfg = getDisciplineConfig(workout.type);

              return (
                <TouchableOpacity
                  key={workout.id}
                  onPress={() => {
                    Haptics.selectionAsync();
                    onSelectWorkout(workout);
                  }}
                  activeOpacity={0.85}
                  className={`p-4 rounded-2xl border border-l-4 ${cfg.borderLeft} ${cfg.borderColor} bg-theme-card shadow-md my-1`}
                >
                  <View className="flex-row items-center justify-between mb-2">
                    <View className="flex-row items-center gap-2">
                      <View className={`px-2.5 py-1 rounded-lg ${cfg.bg} flex-row items-center gap-1`}>
                        <Ionicons name={cfg.icon as any} size={12} color={workout.type === 'SWIM' ? '#208AEF' : workout.type === 'RUN' ? '#F97316' : workout.type === 'BIKE' ? '#10B981' : '#A855F7'} />
                        <Text className={`text-[10px] font-extrabold tracking-wider ${cfg.text}`}>
                          {cfg.label}
                        </Text>
                      </View>
                    </View>

                    {/* Completion / Execution Status Visualization */}
                    {workout.isCompleted ? (
                      <View className="flex-row items-center gap-1 bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-1 rounded-full">
                        <Ionicons name="checkmark-circle" size={14} color="#10B981" />
                        <Text className="text-[10px] font-extrabold text-emerald-500">
                          {workout.executionScore ? `${workout.executionScore}% EXECUTED` : 'COMPLETED'}
                        </Text>
                      </View>
                    ) : (
                      <View className="flex-row items-center gap-1">
                        {workout.isStructured && (
                          <Text className="text-[10px] text-theme-accent font-bold">
                            Structured
                          </Text>
                        )}
                        <Ionicons name="cloud-done-outline" size={14} color="#8E9BA4" />
                      </View>
                    )}
                  </View>

                  {/* Workout Title */}
                  <Text className="text-base font-extrabold text-theme-text mb-2">
                    {workout.title}
                  </Text>

                  {/* Uploaded Telemetry Visualization for Completed Activity */}
                  {workout.isCompleted && workout.actualMetrics ? (
                    <View className="bg-theme-bg/90 p-2.5 rounded-xl border border-theme-border/60 flex-row items-center justify-between mt-1">
                      <View className="flex-row items-center gap-1.5">
                        <Ionicons name="pulse" size={14} color="#10B981" />
                        <Text className="text-xs font-mono font-bold text-theme-text">
                          {workout.actualMetrics}
                        </Text>
                      </View>
                      <Text className="text-[10px] font-mono text-emerald-500 font-bold">
                        +{workout.sparkPoints} Spark
                      </Text>
                    </View>
                  ) : (
                    /* Planned Session Target Summary */
                    <View className="flex-row items-center justify-between pt-1">
                      <Text className="text-xs text-theme-muted font-medium">
                        Target: {workout.duration || '45 mins'} · {workout.sparkPoints} Spark Points
                      </Text>
                      <Text className="text-[10px] text-theme-accent font-semibold">Tap to edit</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })
          )}

          {/* Dotted Add Button */}
          <TouchableOpacity
            onPress={handleAdd}
            activeOpacity={0.7}
            className="w-full py-3.5 border border-dashed border-theme-border rounded-xl items-center justify-center flex-row gap-1 bg-theme-bg/30 mt-2"
          >
            <Ionicons name="add-circle-outline" size={18} color="#16ACBD" />
            <Text className="text-xs font-bold text-theme-accent">Add Exercise</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Card>
  );
}
