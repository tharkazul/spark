import React, { useCallback } from 'react';
import { View, Text, TouchableOpacity, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { WorkoutStep } from '../../types/plan';
import { SportType } from '../../types/dashboard';
import { makeStepId } from '../../utils/stepId';
import { StepCard } from '../workout/StepCard';

let DraggableFlatListComponent: any = FlatList;
try {
  const mod = require('react-native-draggable-flatlist');
  DraggableFlatListComponent = mod.default || mod;
} catch (e) {
  DraggableFlatListComponent = FlatList;
}

interface WorkoutStepBuilderProps {
  steps: WorkoutStep[];
  sport?: SportType | string;
  durationMinutes?: number;
  quickDurations?: number[];
  onDurationChange?: (mins: number) => void;
  onChangeSteps: (newSteps: WorkoutStep[], computedSpark: number) => void;
  ListHeaderComponent?: React.ReactNode;
  ListFooterComponent?: React.ReactNode;
}

export function calculateWbSpark(steps: WorkoutStep[], isStrength: boolean, sport?: SportType | string): number {
  let totalSpark = 0;

  const getStepEquivalentMinutes = (step: WorkoutStep): number => {
    const val = Number(step.condition_value) || 0;
    const condType = step.condition_type || 'time';

    if (condType === 'time') return val;
    if (condType === 'time_sec') return val / 60;
    if (condType === 'distance_km') return val * (sport === 'BIKE' ? 2 : 5);
    if (condType === 'distance') {
      if (sport === 'SWIM') return (val / 100) * 1.8;
      return (val / 1000) * 5;
    }
    if (condType === 'reps') return val * 0.05;
    return val;
  };

  steps.forEach((step) => {
    if (step.type === 'repeat') {
      let repeatMins = 0;
      let iterations = step.iterations || 1;
      (step.steps || []).forEach((sub) => {
        let mins = getStepEquivalentMinutes(sub);
        let multiplier = 1.2;
        if (sub.target_type && sub.target_type.endsWith('.zone')) {
          let z = Number(sub.zone) || 2;
          if (z >= 4) multiplier = 1.5;
          else if (z === 3) multiplier = 1.3;
          else if (z <= 1) multiplier = 1.0;
        } else if (sub.target_type === 'pace.exact' || sub.target_type === 'power.exact') {
          multiplier = 1.4;
        }
        repeatMins += mins * multiplier;
      });
      totalSpark += repeatMins * iterations;
    } else {
      let mins = getStepEquivalentMinutes(step);
      let multiplier = 1.2;
      if (step.target_type && step.target_type.endsWith('.zone')) {
        let z = Number(step.zone) || 2;
        if (z >= 4) multiplier = 1.5;
        else if (z === 3) multiplier = 1.3;
        else if (z <= 1) multiplier = 1.0;
      } else if (step.target_type === 'pace.exact' || step.target_type === 'power.exact') {
        multiplier = 1.4;
      }
      totalSpark += mins * multiplier;
    }
  });

  return Math.ceil(totalSpark);
}

export function WorkoutStepBuilder({
  steps,
  sport,
  durationMinutes = 45,
  quickDurations = [15, 30, 45, 60, 90, 120],
  onDurationChange,
  onChangeSteps,
  ListHeaderComponent,
  ListFooterComponent,
}: WorkoutStepBuilderProps) {
  const isStrength = sport === 'STRENGTH' || sport === 'MOBILITY';

  const updateStepsAndNotify = useCallback((newSteps: WorkoutStep[]) => {
    const computedSpark = calculateWbSpark(newSteps, isStrength, sport);
    onChangeSteps(newSteps, computedSpark);
  }, [isStrength, sport, onChangeSteps]);

  const handleAddStep = (type: WorkoutStep['type']) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newStep: WorkoutStep = isStrength
      ? { id: makeStepId(), type, condition_type: 'reps', condition_value: 10, target_type: 'no.target', weight: 0, exerciseName: '' }
      : {
          id: makeStepId(),
          type,
          condition_type: 'time',
          condition_value: type === 'warmup' || type === 'cooldown' ? 10 : 5,
          target_type: 'no.target',
        };
    updateStepsAndNotify([...steps, newStep]);
  };

  const handleAddRepeat = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const repeatStep: WorkoutStep = {
      id: makeStepId(),
      type: 'repeat',
      iterations: 3,
      steps: [
        isStrength
          ? { id: makeStepId(), type: 'interval', condition_type: 'reps', condition_value: 10, target_type: 'no.target', weight: 0, exerciseName: '' }
          : { id: makeStepId(), type: 'interval', condition_type: sport === 'SWIM' ? 'distance' : 'time', condition_value: sport === 'SWIM' ? 100 : 3, target_type: 'no.target' },
        { id: makeStepId(), type: 'recovery', condition_type: 'time', condition_value: 2, target_type: 'no.target' },
      ],
    };
    updateStepsAndNotify([...steps, repeatStep]);
  };

  const handleUpdateStep = useCallback((id: string | undefined, field: keyof WorkoutStep, val: any) => {
    updateStepsAndNotify(steps.map((s) => (s.id === id ? { ...s, [field]: val } : s)));
  }, [steps, updateStepsAndNotify]);

  const handleUpdateSubStep = useCallback((parentId: string | undefined, subId: string | undefined, field: keyof WorkoutStep, val: any) => {
    updateStepsAndNotify(
      steps.map((s) =>
        s.id !== parentId
          ? s
          : {
              ...s,
              steps: s.steps?.map((sub) => (sub.id === subId ? { ...sub, [field]: val } : sub)),
            }
      )
    );
  }, [steps, updateStepsAndNotify]);

  const handleRemoveStep = useCallback((id: string | undefined) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    updateStepsAndNotify(steps.filter((s) => s.id !== id));
  }, [steps, updateStepsAndNotify]);

  const handleRemoveSubStep = useCallback((parentId: string | undefined, subId: string | undefined) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    updateStepsAndNotify(
      steps.map((s) =>
        s.id !== parentId
          ? s
          : {
              ...s,
              steps: s.steps?.filter((sub) => sub.id !== subId),
            }
      )
    );
  }, [steps, updateStepsAndNotify]);

  const renderItem = useCallback(({ item, drag, isActive }: { item: WorkoutStep; drag?: () => void; isActive?: boolean }) => {
    return (
      <View className="mb-2">
        <StepCard
          step={item}
          isStrength={isStrength}
          sport={sport || 'RUN'}
          isActive={!!isActive}
          drag={drag || (() => {})}
          onUpdate={handleUpdateStep}
          onRemove={handleRemoveStep}
          onUpdateSub={handleUpdateSubStep}
          onRemoveSub={handleRemoveSubStep}
        />
      </View>
    );
  }, [isStrength, sport, handleUpdateStep, handleRemoveStep, handleUpdateSubStep, handleRemoveSubStep]);

  const renderHeader = () => (
    <>
      {ListHeaderComponent}

      {/* UNIFIED WORKOUT STRUCTURE BUILDER CARD CONTAINER */}
      <View className="p-4 rounded-[24px] bg-theme-bg/60 border border-theme-border my-3 flex-col gap-3.5">
        {/* Section Header */}
        <View className="flex-row items-center justify-between pb-2.5 border-b border-theme-border/60">
          <View className="flex-row items-center gap-2">
            <View className="w-8 h-8 rounded-xl bg-theme-accent/15 items-center justify-center">
              <Ionicons name="layers-outline" size={16} color="#FF5F3B" />
            </View>
            <View>
              <Text className="text-xs uppercase tracking-wider font-extrabold text-theme-text">
                Workout Structure Builder
              </Text>
              <Text className="text-[10px] text-theme-muted font-bold">
                Target duration & interval block manager
              </Text>
            </View>
          </View>
        </View>

        {/* Quick Duration Presets */}
        {onDurationChange && (
          <View>
            <Text className="text-[11px] font-bold text-theme-muted mb-2">
              Quick Duration Presets:
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {quickDurations.map((mins) => {
                const isSelected = durationMinutes === mins;
                return (
                  <TouchableOpacity
                    key={mins}
                    onPress={() => {
                      Haptics.selectionAsync();
                      onDurationChange(mins);
                    }}
                    activeOpacity={0.7}
                    className={`px-3 py-1.5 rounded-xl border ${
                      isSelected
                        ? 'bg-theme-accent border-theme-accent'
                        : 'bg-theme-card border-theme-border'
                    }`}
                  >
                    <Text
                      className={`text-xs font-mono font-extrabold ${
                        isSelected ? 'text-white' : 'text-theme-text'
                      }`}
                    >
                      {mins}m
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        <View className="h-px bg-theme-border/60 my-0.5" />

        {/* Add Interval Blocks */}
        <View>
          <Text className="text-[11px] font-bold text-theme-muted mb-2">
            Add Interval Blocks:
          </Text>

          <View className="flex-row flex-wrap gap-1.5 mb-1">
            <TouchableOpacity
              onPress={() => handleAddStep('warmup')}
              className="px-2.5 py-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex-row items-center gap-1"
            >
              <Ionicons name="add" size={13} color="#10B981" />
              <Text className="text-xs font-extrabold text-emerald-500">+ Warmup</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => handleAddStep('interval')}
              className="px-2.5 py-1.5 bg-blue-500/10 border border-blue-500/30 rounded-xl flex-row items-center gap-1"
            >
              <Ionicons name="add" size={13} color="#38BDF8" />
              <Text className="text-xs font-extrabold text-blue-500">+ Interval</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => handleAddStep('recovery')}
              className="px-2.5 py-1.5 bg-amber-500/10 border border-amber-500/30 rounded-xl flex-row items-center gap-1"
            >
              <Ionicons name="add" size={13} color="#F97316" />
              <Text className="text-xs font-extrabold text-amber-500">+ Recovery</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => handleAddStep('cooldown')}
              className="px-2.5 py-1.5 bg-purple-500/10 border border-purple-500/30 rounded-xl flex-row items-center gap-1"
            >
              <Ionicons name="add" size={13} color="#A855F7" />
              <Text className="text-xs font-extrabold text-purple-500">+ Cooldown</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleAddRepeat}
              className="px-2.5 py-1.5 bg-theme-card border border-theme-border rounded-xl flex-row items-center gap-1"
            >
              <Ionicons name="repeat" size={13} color="#FF5F3B" />
              <Text className="text-xs font-extrabold text-theme-accent">+ Repeat Block</Text>
            </TouchableOpacity>
          </View>

          {steps.length === 0 && (
            <View className="py-4 items-center justify-center border border-dashed border-theme-border/80 rounded-2xl bg-theme-card/50 mt-2">
              <Text className="text-xs text-theme-muted italic font-bold">
                No structured interval steps. Tap above to add blocks.
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Label for active step cards list */}
      {steps.length > 0 && (
        <Text className="text-xs uppercase tracking-wider font-extrabold text-theme-muted mb-2 px-1">
          Configured Interval Steps
        </Text>
      )}
    </>
  );

  return (
    <DraggableFlatListComponent
      data={steps}
      keyExtractor={(item: any) => item.id!}
      onDragEnd={({ data }: any) => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        updateStepsAndNotify(data);
      }}
      renderItem={renderItem}
      ListHeaderComponent={renderHeader}
      ListFooterComponent={ListFooterComponent}
      contentContainerStyle={{ paddingBottom: 20 }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    />
  );
}
