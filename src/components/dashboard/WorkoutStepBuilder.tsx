import { BrandColors } from '@/constants/theme';
import React, { useCallback } from 'react';
import { View, Text, TouchableOpacity, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

import { WorkoutStep } from '../../types/plan';
import { SportType } from '../../types/dashboard';
import { makeStepId } from '../../utils/stepId';
import { StepCard } from '../workout/StepCard';
import { CARD_COLORS } from '../workout/StepCard.styles';
import { stepMultiplier } from '../../domain/rookaScore';
import { ScalePressable } from '@/components/ui/ScalePressable';

let DraggableFlatListComponent: any = FlatList;
let ScaleDecorator: any = ({ children }: any) => <>{children}</>;
try {
  const mod = require('react-native-draggable-flatlist');
  DraggableFlatListComponent = mod.default || mod;
  if (mod.ScaleDecorator) {
    ScaleDecorator = mod.ScaleDecorator;
  }
} catch (e) {
  console.warn('[WorkoutStepBuilder] react-native-draggable-flatlist failed to load, falling back to FlatList:', e);
  DraggableFlatListComponent = FlatList;
}

interface WorkoutStepBuilderProps {
  steps: WorkoutStep[];
  sport?: SportType | string;
  durationMinutes?: number;
  quickDurations?: number[];
  onDurationChange?: (mins: number) => void;
  onChangeSteps: (newSteps: WorkoutStep[], computedRooka: number) => void;
  ListHeaderComponent?: React.ReactNode;
  ListFooterComponent?: React.ReactNode;
}

const MemoizedHeader = React.memo(({
  ListHeaderComponent,
  stepsLength,
  handleAddStep,
  handleAddRepeat
}: any) => {
  return (
    <>
      {ListHeaderComponent}

      {/* UNIFIED WORKOUT STRUCTURE BUILDER CARD CONTAINER MATCHING IMAGE 1 */}
      <View className="p-4 rounded-[24px] bg-theme-bg/60 border border-theme-border my-3 flex-col gap-3.5">
        {/* Section Header */}
        <View className="flex-row items-center justify-between pb-2.5 border-b border-theme-border/60">
          <View className="flex-row items-center gap-2">
            <View className="w-8 h-8 rounded-xl bg-theme-accent/15 items-center justify-center">
              <Ionicons name="layers-outline" size={16} color={BrandColors.primary} />
            </View>
            <View>
              <Text className="text-xs font-extrabold text-theme-text">
                Workout Structure Builder
              </Text>
              <Text className="text-xs text-theme-muted font-bold">
                Target duration & interval block manager
              </Text>
            </View>
          </View>
        </View>

        {/* Add Interval Blocks */}
        <View>
          <Text className="text-xs font-bold text-theme-muted dark:text-theme-muted mb-2">
            Add Interval Blocks:
          </Text>

          <View className="flex-row flex-wrap gap-2 mb-1">
            <ScalePressable
              onPress={() => handleAddStep('warmup')}
              activeScale={0.95}
              haptic="light"
              className="px-3 py-2 bg-white dark:bg-slate-800/90 border border-slate-200/80 dark:border-white/10 rounded-xl flex-row items-center gap-1.5 shadow-xs"
            >
              <View className="w-2 h-2 rounded-full bg-emerald-500" />
              <Text className="text-xs font-extrabold text-emerald-600 dark:text-emerald-400">+ Warmup</Text>
            </ScalePressable>

            <ScalePressable
              onPress={() => handleAddStep('interval')}
              activeScale={0.95}
              haptic="light"
              className="px-3 py-2 bg-white dark:bg-slate-800/90 border border-slate-200/80 dark:border-white/10 rounded-xl flex-row items-center gap-1.5 shadow-xs"
            >
              <View className="w-2 h-2 rounded-full bg-blue-500" />
              <Text className="text-xs font-extrabold text-blue-600 dark:text-blue-400">+ Interval</Text>
            </ScalePressable>

            <ScalePressable
              onPress={() => handleAddStep('recovery')}
              activeScale={0.95}
              haptic="light"
              className="px-3 py-2 bg-white dark:bg-slate-800/90 border border-slate-200/80 dark:border-white/10 rounded-xl flex-row items-center gap-1.5 shadow-xs"
            >
              <View className="w-2 h-2 rounded-full bg-amber-500" />
              <Text className="text-xs font-extrabold text-amber-600 dark:text-amber-400">+ Recovery</Text>
            </ScalePressable>

            <ScalePressable
              onPress={() => handleAddStep('cooldown')}
              activeScale={0.95}
              haptic="light"
              className="px-3 py-2 bg-white dark:bg-slate-800/90 border border-slate-200/80 dark:border-white/10 rounded-xl flex-row items-center gap-1.5 shadow-xs"
            >
              <View className="w-2 h-2 rounded-full bg-purple-500" />
              <Text className="text-xs font-extrabold text-purple-600 dark:text-purple-400">+ Cooldown</Text>
            </ScalePressable>

            <ScalePressable
              onPress={handleAddRepeat}
              activeScale={0.95}
              haptic="light"
              className="px-3 py-2 bg-white dark:bg-slate-800/90 border border-slate-200/80 dark:border-white/10 rounded-xl flex-row items-center gap-1.5 shadow-xs"
            >
              <Ionicons name="repeat" size={13} color={BrandColors.primary} />
              <Text className="text-xs font-extrabold text-theme-accent">Repeat</Text>
            </ScalePressable>
          </View>

          {stepsLength === 0 && (
            <Animated.View
              entering={FadeIn.duration(180)}
              exiting={FadeOut.duration(150)}
              layout={LinearTransition.springify().damping(16).stiffness(160)}
              className="py-6 px-4 items-center justify-center border border-dashed border-slate-300 dark:border-slate-700/80 rounded-2xl bg-slate-50/50 dark:bg-slate-900/40 mt-3"
            >
              <View className="w-10 h-10 rounded-full bg-theme-accent/10 dark:bg-theme-accent/20 items-center justify-center mb-2.5">
                <Ionicons name="layers-outline" size={20} color={BrandColors.primary} />
              </View>
              <Text className="text-xs font-extrabold text-theme-text text-center mb-1">
                Build Your Interval Structure
              </Text>
              <Text className="text-[11px] text-theme-muted text-center max-w-[240px]">
                Tap the blocks above to add warmup, work intervals, and recovery targets.
              </Text>
            </Animated.View>
          )}
        </View>
      </View>

      {/* Label for active step cards list */}
      {stepsLength > 0 && (
        <Animated.View
          entering={FadeIn.duration(180)}
          exiting={FadeOut.duration(150)}
          layout={LinearTransition.springify().damping(16).stiffness(160)}
        >
          <Text className="text-xs font-extrabold text-theme-muted mb-2 px-1">
            Configured Interval Steps
          </Text>
        </Animated.View>
      )}
    </>
  );
});

MemoizedHeader.displayName = 'MemoizedHeader';

export function calculateWbRooka(steps: WorkoutStep[], isStrength: boolean, sport?: SportType | string): number {
  let totalRooka = 0;

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
        // Shared with the server so the builder's preview and the recorded
        // score cannot disagree.
        const multiplier = stepMultiplier(sub.target_type, sub.zone, sub.target_value);
        repeatMins += mins * multiplier;
      });
      totalRooka += repeatMins * iterations;
    } else {
      const mins = getStepEquivalentMinutes(step);
      const multiplier = stepMultiplier(step.target_type, step.zone, step.target_value);
      totalRooka += mins * multiplier;
    }
  });

  return Math.ceil(totalRooka);
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
    const computedRooka = calculateWbRooka(newSteps, isStrength, sport);
    onChangeSteps(newSteps, computedRooka);
  }, [isStrength, sport, onChangeSteps]);

  const handleAddStep = useCallback((type: WorkoutStep['type']) => {
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
  }, [isStrength, steps, updateStepsAndNotify]);

  const handleAddRepeat = useCallback(() => {
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
  }, [isStrength, sport, steps, updateStepsAndNotify]);

  const handleAddSubStep = useCallback((parentId: string | undefined, type: WorkoutStep['type']) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newSubStep: WorkoutStep = isStrength
      ? { id: makeStepId(), type, condition_type: 'reps', condition_value: 10, target_type: 'no.target', weight: 0, exerciseName: '' }
      : { id: makeStepId(), type, condition_type: 'time', condition_value: 3, target_type: 'no.target' };

    updateStepsAndNotify(
      steps.map((s) =>
        s.id !== parentId
          ? s
          : {
              ...s,
              steps: [...(s.steps || []), newSubStep],
            }
      )
    );
  }, [isStrength, steps, updateStepsAndNotify]);

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
      <ScaleDecorator>
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
          onAddSubStep={handleAddSubStep}
        />
      </ScaleDecorator>
    );
  }, [isStrength, sport, handleUpdateStep, handleRemoveStep, handleUpdateSubStep, handleRemoveSubStep, handleAddSubStep]);

  // Shown as a dashed drop-zone in the slot the dragged step will land in if released.
  const renderPlaceholder = useCallback(({ item }: { item: WorkoutStep }) => {
    const colorConfig = CARD_COLORS[item.type as keyof typeof CARD_COLORS] || CARD_COLORS.default;
    return (
      <View
        style={{
          flex: 1,
          marginBottom: 8,
          borderRadius: 16,
          borderWidth: 2,
          borderStyle: 'dashed',
          borderColor: colorConfig.border,
          backgroundColor: colorConfig.bg,
        }}
      />
    );
  }, []);

  const headerElement = React.useMemo(() => (
    <MemoizedHeader
      ListHeaderComponent={ListHeaderComponent}
      stepsLength={steps.length}
      handleAddStep={handleAddStep}
      handleAddRepeat={handleAddRepeat}
    />
  ), [ListHeaderComponent, steps.length, handleAddStep, handleAddRepeat]);

  return (
    <DraggableFlatListComponent
      data={steps}
      extraData={steps}
      keyExtractor={(item: any) => item.id!}
      onDragEnd={({ data }: any) => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        updateStepsAndNotify(data);
      }}
      renderItem={renderItem}
      renderPlaceholder={renderPlaceholder}
      ListHeaderComponent={headerElement}
      ListFooterComponent={ListFooterComponent}
      contentContainerStyle={{ paddingBottom: 20 }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    />
  );
}
