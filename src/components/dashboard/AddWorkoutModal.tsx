import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TextInput } from '../ui/TextInput';
import { Button } from '../ui/Button';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { SportType, WorkoutItem } from '../../types/dashboard';
import { WorkoutStep } from '../../types/plan';
import { WorkoutStepBuilder, calculateWbSpark } from './WorkoutStepBuilder';
import { ensureStepIds } from '../../utils/stepId';
import { useUser } from '../../context/UserStore';

interface AddWorkoutModalProps {
  visible: boolean;
  targetDayName?: string;
  targetDateStr?: string;
  initialWorkout?: WorkoutItem | null;
  onClose: () => void;
  onSave: (workout: Omit<WorkoutItem, 'id'>, existingId?: string) => void;
  onDelete?: (workoutId: string) => void;
}

// Helper to scale/rebalance structured steps so Warmup + Interval + Cooldown matches total duration
const scaleStepsForDuration = (
  targetMins: number,
  existingSteps: WorkoutStep[],
  sport: SportType
): WorkoutStep[] => {
  const isStrength = sport === 'STRENGTH' || sport === 'MOBILITY';

  if (isStrength) {
    if (!existingSteps || existingSteps.length === 0) {
      return [
        { type: 'warmup', condition_type: 'time', condition_value: 5, target_type: 'no.target' },
        { type: 'interval', condition_type: 'reps', condition_value: 12, target_type: 'no.target', weight: 15, exerciseName: 'Main Compound' },
        { type: 'cooldown', condition_type: 'time', condition_value: 5, target_type: 'no.target' },
      ];
    }
    return existingSteps;
  }

  // Calculate default Warmup & Cooldown times
  let warmupMins = targetMins <= 30 ? 5 : targetMins >= 90 ? 15 : 10;
  let cooldownMins = targetMins <= 30 ? 5 : targetMins >= 90 ? 15 : 10;
  let intervalMins = Math.max(5, targetMins - (warmupMins + cooldownMins));

  if (!existingSteps || existingSteps.length === 0) {
    return [
      { type: 'warmup', condition_type: 'time', condition_value: warmupMins, target_type: 'heart.rate.zone', zone: 2 },
      { type: 'interval', condition_type: 'time', condition_value: intervalMins, target_type: 'heart.rate.zone', zone: 3 },
      { type: 'cooldown', condition_type: 'time', condition_value: cooldownMins, target_type: 'heart.rate.zone', zone: 1 },
    ];
  }

  // Re-balance existing step list
  return existingSteps.map((step) => {
    if (step.type === 'warmup') {
      return { ...step, condition_value: warmupMins };
    }
    if (step.type === 'cooldown') {
      return { ...step, condition_value: cooldownMins };
    }
    if (step.type === 'interval' && (step.condition_type === 'time' || !step.condition_type)) {
      return { ...step, condition_value: intervalMins };
    }
    return step;
  });
};

export function AddWorkoutModal({
  visible,
  targetDayName = 'FRI',
  targetDateStr = 'Aug 7',
  initialWorkout = null,
  onClose,
  onSave,
  onDelete,
}: AddWorkoutModalProps) {
  const { user } = useUser();
  const insets = useSafeAreaInsets();

  const [selectedSport, setSelectedSport] = useState<SportType>('RUN');
  const [title, setTitle] = useState('');
  const [durationMinutes, setDurationMinutes] = useState<number>(45);
  const [steps, setSteps] = useState<WorkoutStep[]>([]);
  const [customSpark, setCustomSpark] = useState<number | null>(null);

  const slideAnim = useRef(new Animated.Value(400)).current;

  // Preset quick duration options in minutes
  const quickDurations = [15, 30, 45, 60, 90, 120];

  useEffect(() => {
    if (visible) {
      slideAnim.setValue(400);
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        friction: 9,
        tension: 70,
      }).start();
    }
  }, [visible, slideAnim]);

  useEffect(() => {
    if (initialWorkout) {
      setSelectedSport(initialWorkout.type);
      setTitle(initialWorkout.title);
      const parsedDur = parseInt(initialWorkout.duration || '45', 10);
      const dur = isNaN(parsedDur) ? 45 : parsedDur;
      setDurationMinutes(dur);

      if (initialWorkout.steps && Array.isArray(initialWorkout.steps) && initialWorkout.steps.length > 0) {
        setSteps(ensureStepIds(initialWorkout.steps));
      } else {
        setSteps(ensureStepIds(scaleStepsForDuration(dur, [], initialWorkout.type)));
      }
    } else {
      const dayKey = targetDayName.toUpperCase();
      const userPreferredDur = user?.daily_availability?.[dayKey] || (dayKey === 'SAT' ? 90 : 60);

      setSelectedSport('RUN');
      setTitle('');
      setDurationMinutes(userPreferredDur);
      setSteps(ensureStepIds(scaleStepsForDuration(userPreferredDur, [], 'RUN')));
    }
    setCustomSpark(null);
  }, [initialWorkout, visible, targetDayName, user]);

  const handleDurationChange = (newMins: number) => {
    setDurationMinutes(newMins);
    if (newMins > 0) {
      const rebalancedSteps = scaleStepsForDuration(newMins, steps, selectedSport);
      setSteps(rebalancedSteps);
      setCustomSpark(calculateWbSpark(rebalancedSteps, selectedSport === 'STRENGTH' || selectedSport === 'MOBILITY', selectedSport));
    }
  };

  const calculateSparkPoints = (type: SportType, mins: number, currentSteps: WorkoutStep[]): number => {
    if (currentSteps && currentSteps.length > 0) {
      return calculateWbSpark(currentSteps, type === 'STRENGTH', type);
    }

    let ratePerMin = 0.8;
    switch (type) {
      case 'RUN':
        ratePerMin = 0.8;
        break;
      case 'BIKE':
        ratePerMin = 0.7;
        break;
      case 'SWIM':
        ratePerMin = 0.6;
        break;
      case 'STRENGTH':
        ratePerMin = 0.5;
        break;
      case 'MOBILITY':
        ratePerMin = 0.3;
        break;
    }
    return Math.max(5, Math.round(mins * ratePerMin));
  };

  const calculatedSpark = Math.round(
    customSpark !== null
      ? customSpark
      : calculateSparkPoints(selectedSport, durationMinutes, steps)
  );

  const sports: { type: SportType; label: string; icon: string }[] = [
    { type: 'RUN', label: 'Run', icon: 'walk-outline' },
    { type: 'BIKE', label: 'Bike', icon: 'bicycle-outline' },
    { type: 'SWIM', label: 'Swim', icon: 'water-outline' },
    { type: 'STRENGTH', label: 'Strength', icon: 'barbell-outline' },
    { type: 'MOBILITY', label: 'Mobility', icon: 'body-outline' },
  ];

  const handleSave = () => {
    if (!title.trim()) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onSave(
      {
        day: initialWorkout ? initialWorkout.day : targetDayName,
        dateStr: initialWorkout ? initialWorkout.dateStr : targetDateStr,
        type: selectedSport,
        title: title.trim(),
        duration: `${durationMinutes} mins`,
        sparkPoints: calculatedSpark,
        isStructured: steps.length > 0,
        steps: steps,
        isCompleted: initialWorkout ? initialWorkout.isCompleted : false,
        actualMetrics: initialWorkout?.actualMetrics,
        executionScore: initialWorkout?.executionScore,
      },
      initialWorkout?.id
    );
    onClose();
  };

  const handleDelete = () => {
    if (initialWorkout && onDelete) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      onDelete(initialWorkout.id);
      onClose();
    }
  };

  const handleGarminSync = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const { syncGarminWorkout } = require('../../api/integrations');
      await syncGarminWorkout([{ date: targetDateStr || new Date().toISOString().split('T')[0], sport: selectedSport }]);
      Alert.alert('Garmin Push Complete', `"${title || 'Workout'}" has been pushed to your Garmin watch.`);
    } catch (err: any) {
      Alert.alert('Garmin Push Failed', err.message || 'Check your Garmin credentials in Settings.');
    }
  };

  const handleAppleWatchSync = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const { deployWorkoutToAppleWatch } = require('../../services/appleHealthService');
      const res = await deployWorkoutToAppleWatch({
        id: initialWorkout?.id || '1',
        date: targetDateStr || new Date().toISOString().split('T')[0],
        sport: selectedSport,
        description: title || 'Workout',
        target_spark: calculatedSpark,
        steps_json: steps,
      });
      Alert.alert(res.success ? 'Apple Watch Sync' : 'Apple Watch Failed', res.message);
    } catch (err: any) {
      Alert.alert('Apple Watch Error', err.message || 'Failed to deploy to Apple Watch.');
    }
  };

  // Footer containing Device Sync and Primary Save / Cancel / Delete Actions
  const renderFooter = () => (
    <View style={{ paddingTop: 16, paddingBottom: Math.max(insets.bottom + 20, 40) }}>
      {/* Device Sync Row */}
      <View className="mb-4">
        <Text className="text-xs uppercase tracking-wider font-extrabold text-theme-muted mb-2">
          Sync to Device
        </Text>
        <View className="flex-row gap-2.5">
          <TouchableOpacity
            onPress={handleGarminSync}
            activeOpacity={0.7}
            className="flex-1 py-2.5 px-3 bg-blue-500/10 border border-blue-500/30 rounded-xl flex-row items-center justify-center gap-1.5"
          >
            <Ionicons name="watch-outline" size={15} color="#3B82F6" />
            <Text className="text-xs font-bold text-blue-500">Garmin</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleAppleWatchSync}
            activeOpacity={0.7}
            className="flex-1 py-2.5 px-3 bg-red-500/10 border border-red-500/30 rounded-xl flex-row items-center justify-center gap-1.5"
          >
            <Ionicons name="logo-apple" size={15} color="#FF2D55" />
            <Text className="text-xs font-bold text-red-500">Apple Watch</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Primary Action Buttons */}
      <View className="flex-row gap-3 mb-2">
        <View className="flex-1">
          <Button label="Cancel" variant="outline" onPress={onClose} />
        </View>
        <View className="flex-1">
          <Button
            label={initialWorkout ? 'Update Exercise' : 'Save Exercise'}
            variant="primary"
            onPress={handleSave}
          />
        </View>
      </View>

      {/* Delete button if editing */}
      {initialWorkout && (
        <TouchableOpacity
          onPress={handleDelete}
          className="py-2.5 items-center justify-center bg-rose-500/10 rounded-xl mt-1"
        >
          <Text className="text-xs font-extrabold text-rose-500">Delete Exercise</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <View className="flex-1 bg-theme-bg">
          <TouchableOpacity
            activeOpacity={1}
            onPress={onClose}
            className="absolute inset-0"
          />

          {/* Bottom Sheet Modal View */}
          <Animated.View
            style={{ transform: [{ translateY: slideAnim }] }}
            className="w-full bg-theme-card rounded-t-[32px] px-6 pt-6 flex-1 shadow-2xl"
          >
            {/* Header */}
            <View className="flex-row items-center justify-between pb-4 border-b border-theme-border/40 mb-2">
              <View>
                <Text className="text-lg font-extrabold text-theme-text">
                  {initialWorkout ? 'Edit Workout' : 'Add Workout'}
                </Text>
                <Text className="text-xs text-theme-muted">
                  {initialWorkout ? initialWorkout.title : `Scheduling for ${targetDayName} ${targetDateStr}`}
                </Text>
              </View>

              <TouchableOpacity
                onPress={onClose}
                className="w-8 h-8 rounded-full bg-theme-bg items-center justify-center border border-theme-border/60"
              >
                <Ionicons name="close" size={18} color="#6F6F79" />
              </TouchableOpacity>
            </View>

            {/* STRUCTURED ACTIVITY BUILDER */}
            <WorkoutStepBuilder
              steps={steps}
              sport={selectedSport}
              durationMinutes={durationMinutes}
              quickDurations={quickDurations}
              onDurationChange={handleDurationChange}
              onChangeSteps={(newSteps, computedSpark) => {
                setSteps(newSteps);
                setCustomSpark(computedSpark);
              }}
              ListHeaderComponent={
                <>
                  {/* Sport Selector */}
                  <Text className="text-xs uppercase tracking-wider font-extrabold text-theme-muted mb-2.5 mt-2">
                    Select Discipline
                  </Text>
                  <View className="flex-row flex-wrap gap-2 mb-4">
                    {sports.map((sport) => {
                      const isSelected = selectedSport === sport.type;
                      return (
                        <TouchableOpacity
                          key={sport.type}
                          onPress={() => {
                            Haptics.selectionAsync();
                            setSelectedSport(sport.type);
                            setSteps((prev) => scaleStepsForDuration(durationMinutes, prev, sport.type));
                          }}
                          activeOpacity={0.7}
                          className={`flex-row items-center gap-1.5 px-3.5 py-2 rounded-xl ${
                            isSelected
                              ? 'bg-theme-accent/15 border border-theme-accent/40'
                              : 'bg-theme-bg border border-theme-border/60'
                          }`}
                        >
                          <Ionicons name={sport.icon as any} size={16} color={isSelected ? '#FF5F3B' : '#6F6F79'} />
                          <Text className={`text-xs font-extrabold ${isSelected ? 'text-theme-accent' : 'text-theme-muted'}`}>
                            {sport.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* Exercise Title Input */}
                  <View className="mb-4">
                    <Text className="text-xs uppercase tracking-wider font-extrabold text-theme-muted mb-2">
                      Workout Title
                    </Text>
                    <TextInput
                      value={title}
                      onChangeText={setTitle}
                      placeholder="e.g. Interval Threshold Run"
                    />
                  </View>

                  {/* Duration Selector & Auto-Calculated Spark Points */}
                  <View className="flex-row gap-3 mb-2">
                    {/* Duration Input */}
                    <View className="flex-1">
                      <Text className="text-xs uppercase tracking-wider font-extrabold text-theme-muted mb-2">
                        Duration (mins)
                      </Text>
                      <TextInput
                        value={durationMinutes > 0 ? durationMinutes.toString() : ''}
                        onChangeText={(val) => {
                          const parsed = parseInt(val, 10);
                          handleDurationChange(isNaN(parsed) ? 0 : parsed);
                        }}
                        keyboardType="number-pad"
                        placeholder="45"
                      />
                    </View>

                    {/* Auto-Calculated Spark Points Badge Box */}
                    <View className="flex-1">
                      <Text className="text-xs uppercase tracking-wider font-extrabold text-theme-muted mb-2">
                        Calculated Spark
                      </Text>
                      <View className="h-[46px] bg-amber-500/15 border border-amber-500/30 rounded-xl px-3 flex-row items-center justify-between">
                        <View className="flex-row items-center gap-1.5">
                          <Ionicons name="sparkles" size={16} color="#F59E0B" />
                          <Text className="text-sm font-mono font-extrabold text-amber-500">
                            +{calculatedSpark} Spark
                          </Text>
                        </View>
                        <Text className="text-[10px] font-bold text-amber-600/80">Auto</Text>
                      </View>
                    </View>
                  </View>
                </>
              }
              ListFooterComponent={renderFooter()}
            />
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
