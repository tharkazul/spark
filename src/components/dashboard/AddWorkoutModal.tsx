import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ScrollView,
  TouchableOpacity,
  Animated,
  Dimensions,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useTheme } from '@/hooks/use-theme';
import { useUser } from '../../context/UserStore';
import { useLanguage } from '../../context/LanguageContext';
import { useSheetDismiss } from '../../hooks/use-sheet-dismiss';
import { WorkoutStepBuilder, calculateWbRooka } from './WorkoutStepBuilder';
import { WorkoutStructureBar } from './WorkoutStructureBar';
import { QuickBuildModal } from './QuickBuildModal';
import { DeviceSyncChip } from './DeviceSyncChip';
import { Button } from '../ui/Button';
import { SportMedallion } from '../ui/SportMedallion';
import { StatValue } from '../ui/StatValue';
import { SheetGrabber } from '@/components/ui/SheetGrabber';

import { WorkoutItem, SportType } from '../../types/dashboard';
import { WorkoutStep } from '../../types/plan';
import { makeStepId } from '../../utils/stepId';

interface AddWorkoutModalProps {
  visible: boolean;
  targetDayName?: string;
  targetDateStr?: string;
  targetFullDate?: string;
  initialWorkout?: WorkoutItem | null;
  isReadOnly?: boolean;
  onUpgradePress?: () => void;
  onClose: () => void;
  onSave: (workout: Omit<WorkoutItem, 'id'>, existingId?: string) => void;
  onDelete?: (workoutId: string) => void;
}


function normalizeDateToYYYYMMDD(dateStr?: string): string {
  if (!dateStr) return new Date().toISOString().split('T')[0];
  const trimmed = dateStr.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) return trimmed.split('T')[0];
  const currentYear = new Date().getFullYear();
  let parsed = new Date(`${trimmed}, ${currentYear}`);
  if (isNaN(parsed.getTime())) {
    parsed = new Date(`${trimmed} ${currentYear}`);
  }
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return new Date().toISOString().split('T')[0];
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

const calculateRookaPoints = (sport: SportType, durationMins: number, stepList: WorkoutStep[]): number => {
  if (stepList && stepList.length > 0) {
    const isStrength = sport === 'STRENGTH' || sport === 'MOBILITY';
    return calculateWbRooka(stepList, isStrength, sport);
  }
  const multipliers: Record<SportType, number> = {
    RUN: 1.6,
    BIKE: 1.2,
    SWIM: 1.9,
    STRENGTH: 1.3,
    MOBILITY: 0.9,
    REST: 0,
  };
  return Math.round(durationMins * (multipliers[sport] || 1.3));
};

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const quickDurations = [20, 30, 45, 60, 90];

export function AddWorkoutModal({
  visible,
  targetDayName = 'FRI',
  targetDateStr = 'Aug 7',
  targetFullDate,
  initialWorkout = null,
  isReadOnly = false,
  onUpgradePress,
  onClose,
  onSave,
  onDelete,
}: AddWorkoutModalProps) {
  const theme = useTheme();
  const { t } = useLanguage();
  const { user } = useUser();
  const insets = useSafeAreaInsets();

  const [showModal, setShowModal] = useState(visible);
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const isClosingRef = useRef(false);

  const { panHandlers } = useSheetDismiss(onClose, {
    animY: slideAnim,
    backdropOpacity,
    onWillClose: () => {
      isClosingRef.current = true;
    },
  });

  useEffect(() => {
    if (visible) {
      isClosingRef.current = false;
      setShowModal(true);
      slideAnim.setValue(SCREEN_HEIGHT);
      backdropOpacity.setValue(0);

      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim, {
          toValue: 0,
          damping: 24,
          stiffness: 220,
          mass: 0.8,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      if (isClosingRef.current) {
        setShowModal(false);
        isClosingRef.current = false;
        return;
      }

      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: SCREEN_HEIGHT,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setShowModal(false);
      });
    }
  }, [visible, slideAnim, backdropOpacity]);

  const [selectedSport, setSelectedSport] = useState<SportType>('RUN');
  const [title, setTitle] = useState('');
  const [durationMinutes, setDurationMinutes] = useState<number>(45);
  const [steps, setSteps] = useState<WorkoutStep[]>([]);
  const [customRooka, setCustomRooka] = useState<number | null>(null);
  const [isQuickBuildOpen, setIsQuickBuildOpen] = useState(false);

  const isGarminConnected = Boolean(
    user?.garmin_connected || (user as any)?.garmin_username || (user as any)?.garminUsername
  );
  const [isAppleConnected, setIsAppleConnected] = useState(false);
  const [isGarminSynced, setIsGarminSynced] = useState(false);
  const [isAppleWatchSynced, setIsAppleWatchSynced] = useState(false);
  const [isGarminSyncing, setIsGarminSyncing] = useState(false);
  const [isAppleWatchSyncing, setIsAppleWatchSyncing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    try {
      const { isWorkoutKitSupported, isWorkoutKitAuthorized } = require('../../services/appleHealthService');
      if (isWorkoutKitSupported && isWorkoutKitSupported()) {
        isWorkoutKitAuthorized().then((authorized: boolean) => {
          if (!cancelled && authorized) {
            setIsAppleConnected(true);
          }
        });
      }
    } catch (_) {}
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (initialWorkout) {
      const sp = (initialWorkout.type || 'RUN').toUpperCase() as SportType;
      setSelectedSport(sp);
      setTitle(initialWorkout.title || '');

      const durMatch = (initialWorkout.duration || '').match(/\d+/);
      const parsedDur = durMatch ? parseInt(durMatch[0], 10) : 45;
      setDurationMinutes(parsedDur);

      if (initialWorkout.steps && initialWorkout.steps.length > 0) {
        setSteps(ensureStepIds(initialWorkout.steps));
        setCustomRooka(initialWorkout.rookaPoints || null);
      } else {
        const scaled = scaleStepsForDuration(parsedDur, [], sp);
        setSteps(ensureStepIds(scaled));
        setCustomRooka(initialWorkout.rookaPoints || null);
      }
    } else {
      setSelectedSport('RUN');
      setTitle('');
      setDurationMinutes(45);
      const scaled = scaleStepsForDuration(45, [], 'RUN');
      setSteps(ensureStepIds(scaled));
      setCustomRooka(null);
    }
    setIsGarminSynced(false);
    setIsAppleWatchSynced(false);
  }, [initialWorkout, visible]);

  const handleDurationChange = (mins: number) => {
    setDurationMinutes(mins);
    const scaled = scaleStepsForDuration(mins, steps, selectedSport);
    setSteps(ensureStepIds(scaled));
    setCustomRooka(calculateWbRooka(scaled, selectedSport === 'STRENGTH' || selectedSport === 'MOBILITY', selectedSport));
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
        day: initialWorkout?.day || targetDayName,
        dateStr: initialWorkout?.dateStr || targetDateStr,
        type: selectedSport,
        title: finalTitle,
        duration: `${durationMinutes} mins`,
        rookaPoints: calculatedRooka,
        isStructured: steps.length > 0,
        steps,
        isCompleted: initialWorkout ? initialWorkout.isCompleted : false,
        actualMetrics: initialWorkout?.actualMetrics,
        executionScore: initialWorkout?.executionScore,
        isCoachCreated: initialWorkout?.isCoachCreated,
        coachNote: initialWorkout?.coachNote,
        notes: initialWorkout?.notes,
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

  const listHeaderComponent = useMemo(
    () => (
      <View className="pt-3 gap-y-4">
        {/* Workout Name Input */}
        <View>
          <TextInput
            value={title}
            onChangeText={setTitle}
            editable={!isReadOnly}
            placeholder={t('dashboard.workoutNamePlaceholder', 'Workout name (optional)')}
            placeholderTextColor={theme.textSecondary}
            className="bg-theme-inset px-3.5 py-2.5 rounded-control text-sm font-semibold text-theme-text border border-theme-border"
          />
        </View>

        {/* Sport Tiles Strip (64pt wide, 76pt high, 8pt gap) */}
        <View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8 }}
          >
            {[
              { type: 'RUN' as SportType, label: t('sports.run', 'Run') },
              { type: 'BIKE' as SportType, label: t('sports.bike', 'Bike') },
              { type: 'SWIM' as SportType, label: t('sports.swim', 'Swim') },
              { type: 'STRENGTH' as SportType, label: t('sports.strength', 'Strength') },
              { type: 'MOBILITY' as SportType, label: t('sports.mobility', 'Mobility') },
            ].map((item) => {
              const isSelected = selectedSport === item.type;
              return (
                <TouchableOpacity
                  key={item.type}
                  disabled={isReadOnly}
                  activeOpacity={isReadOnly ? 1 : 0.8}
                  onPress={() => handleSportSelect(item.type)}
                  style={{ width: 64, height: 76 }}
                  className={`rounded-inset items-center justify-center ${
                    isSelected
                      ? 'bg-theme-accent-soft border-[1.5px] border-theme-accent'
                      : 'bg-transparent border border-transparent opacity-70'
                  }`}
                >
                  <SportMedallion sport={item.type} size={40} />
                  <Text
                    className={`text-xs font-semibold mt-1.5 ${
                      isSelected ? 'text-theme-accent font-bold' : 'text-theme-muted'
                    }`}
                  >
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Quick Duration Chips (R2-28: 20, 30, 45, 60, 90 min) */}
        <View className="flex-row items-center gap-2">
          {quickDurations.map((mins) => {
            const isSelected = durationMinutes === mins;
            return (
              <TouchableOpacity
                key={`dur-${mins}`}
                disabled={isReadOnly}
                onPress={() => handleDurationChange(mins)}
                activeOpacity={isReadOnly ? 1 : 0.8}
                className={`flex-1 py-2 items-center justify-center rounded-button-md border ${
                  isSelected
                    ? 'bg-theme-accent-strong border-theme-accent-strong'
                    : 'bg-theme-inset border-theme-border/60'
                }`}
              >
                <Text
                  className={`text-xs font-bold font-rajdhani tabular-nums ${
                    isSelected ? 'text-white' : 'text-theme-text'
                  }`}
                >
                  {mins}m
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Build with rooka (Renamed from Quick Build) */}
        {!isReadOnly && (
          <Button
            variant="secondary"
            size="md"
            label={t('dashboard.buildWithRooka', 'Build with rooka')}
            leftIcon={<Ionicons name="flash" size={16} color="#0EA5E9" />}
            onPress={() => setIsQuickBuildOpen(true)}
            className="w-full"
          />
        )}

        {/* Structure Preview Bar (proportional, rounded-full matching dashboard view) */}
        {steps && steps.length > 0 && (
          <View className="gap-y-1.5">
            <View className="flex-row justify-between items-center">
              <Text className="text-[10px] font-semibold text-theme-muted uppercase tracking-wider">
                {t('dashboard.structurePreview', 'STRUCTURE PREVIEW')}
              </Text>
              <Text className="text-xs font-semibold text-theme-muted font-rajdhani tabular-nums">
                {durationMinutes} min
              </Text>
            </View>
            <WorkoutStructureBar steps={steps} className="my-0" />
          </View>
        )}
      </View>
    ),
    [selectedSport, title, durationMinutes, calculatedRooka, steps, isReadOnly, t, theme]
  );

  if (!showModal) return null;

  return (
    <Modal
      visible={showModal}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          <View style={{ flex: 1, justifyContent: 'flex-end', position: 'relative' }}>
            {/* Backdrop: Fades In/Out Simultaneously */}
            <Animated.View
              style={[
                StyleSheet.absoluteFillObject,
                { backgroundColor: 'rgba(0,0,0,0.6)', opacity: backdropOpacity },
              ]}
            >
              <TouchableOpacity
                activeOpacity={1}
                onPress={onClose}
                style={{ flex: 1 }}
              />
            </Animated.View>

            {/* Bottom Sheet Modal Container */}
            <Animated.View
              style={[
                {
                  transform: [{ translateY: slideAnim }],
                  height: '92%',
                },
              ]}
              className="bg-theme-card rounded-t-[32px] rounded-b-none border-t border-theme-border/50 shadow-2xl flex-col overflow-hidden"
            >
              {/* TOP PULL HANDLE INDICATOR — tap-to-dismiss & drag-to-dismiss */}
              <View
                {...panHandlers}
                className="items-center justify-center py-3 self-stretch"
              >
                <SheetGrabber />
              </View>

              {/* Top Title Bar with Close Action */}
              <View className="flex-row items-center justify-between px-5 pt-0 pb-3 border-b border-theme-border/60">
                <View className="flex-row items-center gap-2">
                  <Text className="text-xl font-bold text-theme-text font-jakarta">
                    {initialWorkout
                      ? isReadOnly
                        ? t('dashboard.workoutDetails', 'Workout Details')
                        : t('dashboard.editWorkout', 'Edit Workout')
                      : t('dashboard.addWorkoutTitle', 'Add Workout')}
                  </Text>
                  {isReadOnly && (
                    <View className="flex-row items-center gap-1 bg-theme-accent/15 px-2 py-0.5 rounded-full">
                      <Ionicons name="lock-closed" size={10} color="#0EA5E9" />
                      <Text className="text-[10px] font-bold text-theme-accent">ROOKA+</Text>
                    </View>
                  )}
                </View>
                <TouchableOpacity
                  onPress={onClose}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  className="w-8 h-8 rounded-full bg-theme-inset items-center justify-center"
                >
                  <Ionicons name="close" size={18} color={theme.text} />
                </TouchableOpacity>
              </View>

          {isReadOnly && (
            <View className="mx-5 my-2.5 p-3 bg-theme-accent/10 border border-theme-accent/30 rounded-xl flex-row items-center justify-between">
              <View className="flex-row items-center gap-2 flex-1 mr-2">
                <Ionicons name="lock-closed" size={16} color="#0EA5E9" />
                <Text className="text-xs text-theme-text font-medium flex-1">
                  {t('dashboard.freeTierViewCoach', 'Free tier can view coach workouts. Upgrade to Rooka+ to edit steps, targets, and create custom workouts.')}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  onClose();
                  onUpgradePress?.();
                }}
                className="px-2.5 py-1.5 bg-theme-accent rounded-lg"
              >
                <Text className="text-xs font-bold text-white">{t('dashboard.upgradeToEdit', 'Upgrade')}</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* SCROLLABLE FORM AREA */}
          <View className="flex-1 px-5">
            <WorkoutStepBuilder
              steps={steps}
              sport={selectedSport}
              readOnly={isReadOnly}
              durationMinutes={durationMinutes}
              quickDurations={quickDurations}
              onDurationChange={handleDurationChange}
              onChangeSteps={(newSteps, rooka) => {
                setSteps(newSteps);
                setCustomRooka(rooka);
              }}
              ListHeaderComponent={listHeaderComponent}
            />
          </View>

          {/* STICKY FOOTER PINNED OUTSIDE SCROLL VIEW (P0 Defect #6) */}
          <View
            style={{ paddingBottom: Math.max(insets.bottom, 16), paddingTop: 12 }}
            className="px-5 border-t border-theme-border bg-theme-card"
          >
            {/* Device Sync Row (Garmin / Apple Watch) */}
            {(isGarminConnected || isAppleConnected) && (
              <View className="flex-row gap-2 mb-3">
                {isGarminConnected && (
                  <DeviceSyncChip
                    device="garmin"
                    isSynced={isGarminSynced}
                    isSyncing={isGarminSyncing}
                    onPress={async () => {
                      if (isGarminSyncing) return;
                      setIsGarminSyncing(true);
                      try {
                        const { syncGarminWorkout } = require('../../api/integrations');
                        const finalTitle = title.trim() || `${selectedSport} Workout`;
                        const workoutDate = targetFullDate || normalizeDateToYYYYMMDD(targetDateStr);
                        await syncGarminWorkout([{
                          date: workoutDate,
                          sport: selectedSport,
                          title: finalTitle,
                          description: finalTitle,
                          rookaPoints: calculatedRooka,
                          steps,
                        }]);
                        setIsGarminSynced(true);
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                      } catch (err: any) {
                        Alert.alert('Garmin Sync Failed', err?.message || 'Sync failed');
                      } finally {
                        setIsGarminSyncing(false);
                      }
                    }}
                  />
                )}

                {isAppleConnected && (
                  <DeviceSyncChip
                    device="apple"
                    isSynced={isAppleWatchSynced}
                    isSyncing={isAppleWatchSyncing}
                    onPress={async () => {
                      if (isAppleWatchSyncing) return;
                      setIsAppleWatchSyncing(true);
                      try {
                        const { deployWorkoutToAppleWatch } = require('../../services/appleHealthService');
                        const workoutDate = targetFullDate || normalizeDateToYYYYMMDD(targetDateStr);
                        const result = await deployWorkoutToAppleWatch({
                          id: initialWorkout?.id || '1',
                          date: workoutDate,
                          sport: selectedSport,
                          description: title || `${selectedSport} Workout`,
                          target_rooka: calculatedRooka,
                          steps_json: steps,
                        });
                        setIsAppleWatchSynced(result.success);
                        if (result.success) {
                          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        } else {
                          Alert.alert('Apple Watch Sync Failed', result.message);
                        }
                      } catch (err: any) {
                        Alert.alert('Apple Watch Sync Failed', err?.message || 'Sync failed');
                      } finally {
                        setIsAppleWatchSyncing(false);
                      }
                    }}
                  />
                )}
              </View>
            )}

            {/* Live Total & Save Action (R2-29: StatValue integration) */}
            <View className="flex-row items-center justify-between gap-x-4">
              <View className="flex-row items-center gap-4">
                <StatValue
                  label={t('dashboard.durationLabel', 'DURATION')}
                  value={durationMinutes}
                  unit="min"
                  size="sm"
                />
                <StatValue
                  label={t('dashboard.rookaLabel', 'ROOKA')}
                  value={`+${calculatedRooka}`}
                  unit="pts"
                  size="sm"
                />
              </View>

              {isReadOnly ? (
                <View className="flex-row items-center gap-2 flex-1">
                  <Button
                    variant="secondary"
                    size="md"
                    label={t('common.close', 'Close')}
                    onPress={onClose}
                  />
                  <Button
                    variant="primary"
                    size="md"
                    label={t('dashboard.upgradeToEdit', 'Upgrade to Edit')}
                    leftIcon={<Ionicons name="lock-closed" size={13} color="#FFFFFF" />}
                    onPress={() => {
                      onClose();
                      onUpgradePress?.();
                    }}
                    className="flex-1"
                  />
                </View>
              ) : (
                <Button
                  variant="primary"
                  size="md"
                  label={t('common.save', 'Save')}
                  disabled={steps.length === 0}
                  onPress={handleSave}
                  className="flex-1"
                />
              )}
            </View>

            {/* Optional Delete action if editing existing workout */}
            {initialWorkout && !isReadOnly && (
              <TouchableOpacity
                onPress={handleDelete}
                className="mt-2.5 items-center justify-center py-1.5"
              >
                <Text className="text-xs font-semibold text-rose-500">
                  {t('dashboard.deleteWorkout', 'Delete Workout')}
                </Text>
              </TouchableOpacity>
            )}
          </View>
            </Animated.View>
          </View>
        </KeyboardAvoidingView>
      </GestureHandlerRootView>

      <QuickBuildModal
        visible={isQuickBuildOpen}
        onClose={() => setIsQuickBuildOpen(false)}
        onBuild={(mins) => handleDurationChange(mins)}
      />
    </Modal>
  );
}
