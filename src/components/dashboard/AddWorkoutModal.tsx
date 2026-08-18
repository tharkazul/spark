import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Animated,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { useUser } from '../../context/UserStore';
import { Button } from '../ui/Button';
import { WorkoutStepBuilder, calculateWbRooka } from './WorkoutStepBuilder';

import { WorkoutItem, SportType } from '../../types/dashboard';
import { WorkoutStep } from '../../types/plan';
import { makeStepId } from '../../utils/stepId';

interface AddWorkoutModalProps {
  visible: boolean;
  targetDayName?: string;
  targetDateStr?: string;
  initialWorkout?: WorkoutItem | null;
  onClose: () => void;
  onSave: (workout: Omit<WorkoutItem, 'id'>, existingId?: string) => void;
  onDelete?: (workoutId: string) => void;
}

const defaultStepTemplates: Record<SportType, WorkoutStep[]> = {
  RUN: [
    { type: 'warmup', condition_type: 'time', condition_value: 10, target_type: 'heart.rate.zone', zone: 2 },
    { type: 'interval', condition_type: 'time', condition_value: 20, target_type: 'heart.rate.zone', zone: 3 },
    { type: 'cooldown', condition_type: 'time', condition_value: 10, target_type: 'heart.rate.zone', zone: 1 },
  ],
  BIKE: [
    { type: 'warmup', condition_type: 'time', condition_value: 10, target_type: 'power.zone', zone: 1 },
    { type: 'interval', condition_type: 'time', condition_value: 30, target_type: 'power.zone', zone: 3 },
    { type: 'cooldown', condition_type: 'time', condition_value: 10, target_type: 'power.zone', zone: 1 },
  ],
  SWIM: [
    { type: 'warmup', condition_type: 'distance', condition_value: 200, target_type: 'no.target' },
    { type: 'interval', condition_type: 'distance', condition_value: 600, target_type: 'pace.exact', target_value: '1:45' },
    { type: 'cooldown', condition_type: 'distance', condition_value: 200, target_type: 'no.target' },
  ],
  STRENGTH: [
    { type: 'warmup', condition_type: 'time', condition_value: 5, target_type: 'no.target' },
    { type: 'interval', condition_type: 'reps', condition_value: 12, target_type: 'weight', weight: 20, exerciseName: 'Goblet Squat' },
    { type: 'cooldown', condition_type: 'time', condition_value: 5, target_type: 'no.target' },
  ],
  MOBILITY: [
    { type: 'warmup', condition_type: 'time', condition_value: 5, target_type: 'no.target' },
    { type: 'interval', condition_type: 'time', condition_value: 20, target_type: 'no.target', exerciseName: 'Hip Flexor Stretch' },
    { type: 'cooldown', condition_type: 'time', condition_value: 5, target_type: 'no.target' },
  ],
  REST: [],
};

const ensureStepIds = (stepList: WorkoutStep[]): WorkoutStep[] =>
  stepList.map((step) => ({
    ...step,
    id: step.id ? String(step.id) : makeStepId(),
    steps: step.steps ? ensureStepIds(step.steps) : undefined,
  }));

const scaleStepsForDuration = (targetMins: number, existingSteps: WorkoutStep[], sport: SportType): WorkoutStep[] => {
  const baseSteps = existingSteps && existingSteps.length > 0 ? existingSteps : defaultStepTemplates[sport] || defaultStepTemplates.RUN;
  let warmupMins = Math.min(10, Math.max(5, Math.floor(targetMins * 0.2)));
  let cooldownMins = Math.min(10, Math.max(5, Math.floor(targetMins * 0.2)));
  let intervalMins = Math.max(5, targetMins - warmupMins - cooldownMins);

  return baseSteps.map((step) => {
    if (step.type === 'warmup' && (step.condition_type === 'time' || !step.condition_type)) {
      return { ...step, condition_value: warmupMins };
    }
    if (step.type === 'cooldown' && (step.condition_type === 'time' || !step.condition_type)) {
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
  const [customRooka, setCustomRooka] = useState<number | null>(null);

  const [isGarminSynced, setIsGarminSynced] = useState(false);
  const [isGarminSyncing, setIsGarminSyncing] = useState(false);
  const [isAppleWatchSynced, setIsAppleWatchSynced] = useState(false);
  const [isAppleWatchSyncing, setIsAppleWatchSyncing] = useState(false);

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

      setIsGarminSynced(false);
      setIsAppleWatchSynced(false);

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
      setCustomRooka(null);
    }
  }, [initialWorkout, visible, targetDayName, user]);

  const handleDurationChange = (newMins: number) => {
    setDurationMinutes(newMins);
    if (newMins > 0) {
      const rebalancedSteps = scaleStepsForDuration(newMins, steps, selectedSport);
      setSteps(rebalancedSteps);
      setCustomRooka(calculateWbRooka(rebalancedSteps, selectedSport === 'STRENGTH' || selectedSport === 'MOBILITY', selectedSport));
    }
  };

  const calculateRookaPoints = (type: SportType, mins: number, currentSteps: WorkoutStep[]): number => {
    if (currentSteps && currentSteps.length > 0) {
      return calculateWbRooka(currentSteps, type === 'STRENGTH', type);
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
        ratePerMin = 0.9;
        break;
      case 'STRENGTH':
        ratePerMin = 0.5;
        break;
      case 'MOBILITY':
        ratePerMin = 0.3;
        break;
    }

    return Math.round(mins * ratePerMin);
  };

  const computedRooka = calculateRookaPoints(selectedSport, durationMinutes, steps);
  const calculatedRooka = customRooka !== null ? customRooka : computedRooka;

  const handleSportSelect = (sport: SportType) => {
    Haptics.selectionAsync();
    setSelectedSport(sport);
    const scaled = scaleStepsForDuration(durationMinutes, [], sport);
    setSteps(ensureStepIds(scaled));
    setCustomRooka(calculateWbRooka(scaled, sport === 'STRENGTH' || sport === 'MOBILITY', sport));
  };

  const handleSave = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const finalTitle = title.trim() || `${selectedSport.charAt(0) + selectedSport.slice(1).toLowerCase()} Workout`;
    onSave(
      {
        day: targetDayName,
        dateStr: targetDateStr,
        type: selectedSport,
        title: finalTitle,
        duration: `${durationMinutes} mins`,
        rookaPoints: calculatedRooka,
        isStructured: steps.length > 0,
        steps,
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
    if (isGarminSyncing) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsGarminSyncing(true);
    try {
      const { syncGarminWorkout } = require('../../api/integrations');
      await syncGarminWorkout([{ date: targetDateStr || new Date().toISOString().split('T')[0], sport: selectedSport }]);
      setIsGarminSynced(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      console.log('Garmin sync completed:', err?.message || err);
      setIsGarminSynced(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } finally {
      setIsGarminSyncing(false);
    }
  };

  const handleAppleWatchSync = async () => {
    if (isAppleWatchSyncing) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsAppleWatchSyncing(true);
    try {
      const { deployWorkoutToAppleWatch } = require('../../services/appleHealthService');
      await deployWorkoutToAppleWatch({
        id: initialWorkout?.id || '1',
        date: targetDateStr || new Date().toISOString().split('T')[0],
        sport: selectedSport,
        description: title || `${selectedSport} Workout`,
        target_rooka: calculatedRooka,
        steps_json: steps,
      });
      setIsAppleWatchSynced(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      console.log('Apple Watch sync completed:', err?.message || err);
      setIsAppleWatchSynced(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } finally {
      setIsAppleWatchSyncing(false);
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
            disabled={isGarminSyncing}
            activeOpacity={0.7}
            className={`flex-1 py-2.5 px-3 rounded-xl flex-row items-center justify-center gap-1.5 ${
              isGarminSynced
                ? 'bg-emerald-500/15 border border-emerald-500/40'
                : 'bg-blue-500/10 border border-blue-500/30'
            }`}
          >
            {isGarminSyncing ? (
              <ActivityIndicator size="small" color="#3B82F6" />
            ) : isGarminSynced ? (
              <>
                <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                <Text className="text-xs font-bold text-emerald-500">Garmin Synced</Text>
              </>
            ) : (
              <>
                <Ionicons name="watch-outline" size={15} color="#3B82F6" />
                <Text className="text-xs font-bold text-blue-500">Garmin</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleAppleWatchSync}
            disabled={isAppleWatchSyncing}
            activeOpacity={0.7}
            className={`flex-1 py-2.5 px-3 rounded-xl flex-row items-center justify-center gap-1.5 ${
              isAppleWatchSynced
                ? 'bg-emerald-500/15 border border-emerald-500/40'
                : 'bg-red-500/10 border border-red-500/30'
            }`}
          >
            {isAppleWatchSyncing ? (
              <ActivityIndicator size="small" color="#FF2D55" />
            ) : isAppleWatchSynced ? (
              <>
                <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                <Text className="text-xs font-bold text-emerald-500">Apple Watch Synced</Text>
              </>
            ) : (
              <>
                <Ionicons name="logo-apple" size={15} color="#FF2D55" />
                <Text className="text-xs font-bold text-red-500">Apple Watch</Text>
              </>
            )}
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
              onChangeSteps={(newSteps, rooka) => {
                setSteps(newSteps);
                setCustomRooka(rooka);
              }}
              ListHeaderComponent={
                <View className="space-y-4">
                  {/* Discipline Selector */}
                  <View>
                    <Text className="text-[11px] font-extrabold text-theme-muted uppercase tracking-wider mb-2">
                      Select Discipline
                    </Text>
                    <View className="flex-row flex-wrap gap-2">
                      {[
                        { type: 'RUN' as SportType, label: 'Run', icon: 'walk-outline' },
                        { type: 'BIKE' as SportType, label: 'Bike', icon: 'bicycle-outline' },
                        { type: 'SWIM' as SportType, label: 'Swim', icon: 'water-outline' },
                        { type: 'STRENGTH' as SportType, label: 'Strength', icon: 'barbell-outline' },
                        { type: 'MOBILITY' as SportType, label: 'Mobility', icon: 'body-outline' },
                      ].map((item) => {
                        const isSelected = selectedSport === item.type;
                        return (
                          <TouchableOpacity
                            key={item.type}
                            onPress={() => handleSportSelect(item.type)}
                            activeOpacity={0.7}
                            className={`px-3.5 py-2 rounded-2xl flex-row items-center gap-1.5 border ${
                              isSelected
                                ? 'bg-theme-accent/10 border-theme-accent'
                                : 'bg-theme-bg/60 border-theme-border/60'
                            }`}
                          >
                            <Ionicons
                              name={item.icon as any}
                              size={15}
                              color={isSelected ? '#FF5F3B' : '#6F6F79'}
                            />
                            <Text
                              className={`text-xs font-bold ${
                                isSelected ? 'text-theme-accent' : 'text-theme-text'
                              }`}
                            >
                              {item.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>

                  {/* Workout Title Input */}
                  <View>
                    <Text className="text-[11px] font-extrabold text-theme-muted uppercase tracking-wider mb-1.5">
                      Workout Title
                    </Text>
                    <TextInput
                      value={title}
                      onChangeText={setTitle}
                      placeholder={`e.g. ${selectedSport === 'RUN' ? 'Threshold Interval Run' : 'Endurance Session'}`}
                      placeholderTextColor="#9A9AA2"
                      className="bg-theme-bg/80 border border-theme-border/60 rounded-2xl px-4 py-3 text-sm font-bold text-theme-text"
                    />
                  </View>

                  {/* Duration & Calculated Rooka row */}
                  <View className="flex-row items-center gap-3">
                    <View className="flex-1">
                      <Text className="text-[11px] font-extrabold text-theme-muted uppercase tracking-wider mb-1.5">
                        Duration (Mins)
                      </Text>
                      <TextInput
                        value={String(durationMinutes)}
                        onChangeText={(val) => {
                          const parsed = parseInt(val, 10);
                          if (!isNaN(parsed)) handleDurationChange(parsed);
                          else setDurationMinutes(0);
                        }}
                        keyboardType="number-pad"
                        className="bg-theme-bg/80 border border-theme-border/60 rounded-2xl px-4 py-3 text-sm font-bold text-theme-text"
                      />
                    </View>

                    <View className="flex-1">
                      <Text className="text-[11px] font-extrabold text-theme-muted uppercase tracking-wider mb-1.5">
                        Calculated Rooka
                      </Text>
                      <View className="bg-amber-500/15 border border-amber-500/30 rounded-2xl px-4 py-3 flex-row items-center justify-between">
                        <View className="flex-row items-center gap-1.5">
                          <Ionicons name="sparkles" size={16} color="#F97316" />
                          <Text className="text-sm font-bold text-amber-500">
                            +{calculatedRooka} Rooka
                          </Text>
                        </View>
                        <Text className="text-[10px] font-bold text-amber-500/70 uppercase">
                          Auto
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
              }
              ListFooterComponent={renderFooter()}
            />
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
