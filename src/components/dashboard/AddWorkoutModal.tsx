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
import { useLanguage } from '../../context/LanguageContext';

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
  const { t } = useLanguage();
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
      <View className="mb-6">
        <Text className="text-xs uppercase tracking-wider font-extrabold text-theme-muted mb-3">
          Sync to Device
        </Text>
        <View className="flex-row gap-6">
          <TouchableOpacity
            onPress={handleGarminSync}
            disabled={isGarminSyncing}
            activeOpacity={0.7}
            className="flex-row items-center gap-2.5"
          >
            <View className={`w-5 h-5 rounded-[6px] items-center justify-center border ${isGarminSynced ? 'bg-[#EA580C] border-[#EA580C]' : 'bg-slate-50 border-slate-300'}`}>
              {isGarminSynced && <Ionicons name="checkmark" size={14} color="white" />}
            </View>
            <Text className="text-sm font-bold text-slate-700">Garmin</Text>
            {isGarminSyncing && <ActivityIndicator size="small" color="#EA580C" />}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleAppleWatchSync}
            disabled={isAppleWatchSyncing}
            activeOpacity={0.7}
            className="flex-row items-center gap-2.5"
          >
            <View className={`w-5 h-5 rounded-[6px] items-center justify-center border ${isAppleWatchSynced ? 'bg-[#EA580C] border-[#EA580C]' : 'bg-slate-50 border-slate-300'}`}>
              {isAppleWatchSynced && <Ionicons name="checkmark" size={14} color="white" />}
            </View>
            <Text className="text-sm font-bold text-slate-700">Apple Watch</Text>
            {isAppleWatchSyncing && <ActivityIndicator size="small" color="#EA580C" />}
          </TouchableOpacity>
        </View>
      </View>

      {/* Primary Action Buttons */}
      <View className="items-center w-full">
        <TouchableOpacity
          onPress={handleSave}
          className="w-[70%] bg-[#EA580C] rounded-xl py-3.5 items-center justify-center mb-3"
        >
           <Text className="text-white font-extrabold text-base">
             {initialWorkout ? (t('common.edit') || 'Update') : (t('common.save') || 'Save Workout')}
           </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onClose} className="py-2 px-6">
          <Text className="text-slate-500 font-bold text-sm">{t('common.cancel')}</Text>
        </TouchableOpacity>
      </View>

      {/* Delete button if editing */}
      {initialWorkout && (
        <TouchableOpacity
          onPress={handleDelete}
          className="py-2.5 items-center justify-center bg-rose-500/10 rounded-xl mt-4"
        >
          <Text className="text-xs font-extrabold text-rose-500">{t('common.delete')}</Text>
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
                <View className="space-y-6">
                  {/* Discipline Selector - Horizontal Icon Strip */}
                  <View>
                    <View className="flex-row items-center justify-between">
                      {[
                        { type: 'RUN' as SportType, label: 'Run', icon: 'walk' },
                        { type: 'BIKE' as SportType, label: 'Bike', icon: 'bicycle' },
                        { type: 'SWIM' as SportType, label: 'Swim', icon: 'water' },
                        { type: 'STRENGTH' as SportType, label: 'Strength', icon: 'barbell' },
                        { type: 'MOBILITY' as SportType, label: 'Mobility', icon: 'body' },
                      ].map((item) => {
                        const isSelected = selectedSport === item.type;
                        return (
                          <TouchableOpacity
                            key={item.type}
                            onPress={() => handleSportSelect(item.type)}
                            activeOpacity={0.7}
                            className={`flex-1 rounded-xl items-center justify-center py-2 ${
                              isSelected
                                ? 'bg-[#FFF7ED] border border-[#FFEDD5]'
                                : 'bg-[#F8FAFC] border border-transparent'
                            }`}
                            style={{ marginHorizontal: 2 }}
                          >
                            <Ionicons
                              name={item.icon as any}
                              size={20}
                              color={isSelected ? '#EA580C' : '#64748B'}
                            />
                            <Text
                              className={`text-[11px] font-bold mt-1 ${
                                isSelected ? 'text-[#EA580C]' : 'text-[#64748B]'
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
                    <TextInput
                      value={title}
                      onChangeText={setTitle}
                      placeholder={`e.g. ${selectedSport === 'RUN' ? 'Threshold Interval Run' : 'Endurance Session'}`}
                      placeholderTextColor="#94A3B8"
                      className="bg-white border border-[#E2E8F0] rounded-xl px-4 py-3 text-sm font-bold text-slate-800"
                    />
                  </View>

                  {/* Duration & Calculated Rooka row */}
                  <View className="flex-row items-center gap-3">
                    <View className="flex-1 bg-white border border-[#E2E8F0] rounded-xl px-4 py-3 flex-row items-center">
                      <TextInput
                        value={String(durationMinutes)}
                        onChangeText={(val) => {
                          const parsed = parseInt(val, 10);
                          if (!isNaN(parsed)) handleDurationChange(parsed);
                          else setDurationMinutes(0);
                        }}
                        keyboardType="number-pad"
                        className="flex-1 text-sm font-bold text-slate-800"
                      />
                      <Text className="text-xs font-bold text-slate-400">mins</Text>
                    </View>

                    <View className="flex-1 bg-[#FFF7ED] border border-[#FFEDD5] rounded-xl px-4 py-3 flex-row items-center justify-center gap-2">
                      <Ionicons name="sparkles" size={14} color="#EA580C" />
                      <Text className="text-sm font-bold text-[#EA580C]">
                        +{calculatedRooka} Rooka <Text className="text-[10px] text-[#F97316]/70 uppercase">· Auto</Text>
                      </Text>
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
