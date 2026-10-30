import { SheetSurface, SHEET_BACKDROP, useSheetShape } from '@/components/ui/SheetSurface';
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
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
import * as Haptics from 'expo-haptics';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Reanimated, { FadeInDown, FadeOut, LinearTransition, SlideInRight } from 'react-native-reanimated';

import { useTheme } from '@/hooks/use-theme';
import { useUser } from '../../context/UserStore';
import { useLanguage } from '../../context/LanguageContext';
import { useSheetPresentation } from '../../hooks/use-sheet-presentation';
import { WorkoutStepBuilder, calculateWbRooka } from './WorkoutStepBuilder';
import { calculateWorkoutDurationMinutes } from '../../utils/format';
import { WorkoutStructureBar } from './WorkoutStructureBar';
import { QuickBuildModal } from './QuickBuildModal';
import { DeviceSyncChip } from './DeviceSyncChip';
import { Button } from '../ui/Button';
import { SportMedallion } from '../ui/SportMedallion';
import { StatValue } from '../ui/StatValue';
import { SheetGrabber } from '@/components/ui/SheetGrabber';
import { ExerciseInfoContext, ExerciseInfoView } from '../workout/ExerciseInfoSheet';
import { getLocalizedDayName } from './DetailedDayCard';

import { WorkoutItem, SportType } from '../../types/dashboard';
import { WorkoutStep } from '../../types/plan';
import { makeStepId } from '../../utils/stepId';
import { garminTakesWorkouts } from '../../hooks/useConnectedDevices';

interface AddWorkoutModalProps {
  visible: boolean;
  targetDayName?: string;
  targetDateStr?: string;
  targetFullDate?: string;
  initialWorkout?: WorkoutItem | null;
  isReadOnly?: boolean;
  /** Open an existing workout straight in edit mode (the day card's Edit button). Otherwise it opens to read. */
  startInEditMode?: boolean;
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
  startInEditMode = false,
  onUpgradePress,
  onClose,
  onSave,
  onDelete,
}: AddWorkoutModalProps) {
  const theme = useTheme();
  const { t } = useLanguage();
  const { user } = useUser();
  const { safeBottom } = useSheetShape();

  const { showModal, slideAnim, backdropOpacity, panHandlers, onSheetLayout } = useSheetPresentation(visible, onClose);

  const [selectedSport, setSelectedSport] = useState<SportType>('RUN');
  const [title, setTitle] = useState('');
  const [durationMinutes, setDurationMinutes] = useState<number>(45);
  const [steps, setSteps] = useState<WorkoutStep[]>([]);
  const [customRooka, setCustomRooka] = useState<number | null>(null);
  const [isQuickBuildOpen, setIsQuickBuildOpen] = useState(false);
  // An existing workout opens to read (athletes keep it open mid-session to see the next
  // step); the editing controls only appear after tapping edit. A new workout starts editable.
  const [isEditing, setIsEditing] = useState(false);
  const canEditHere = isEditing && !isReadOnly;
  // An exercise's info page replaces the workout inside this sheet instead of stacking a second one.
  const [infoExercise, setInfoExercise] = useState<string | null>(null);
  const showExerciseInfo = useCallback((name: string) => setInfoExercise(name), []);

  // Garmin only gets a send button when it will take the workout (import allowed).
  const isGarminConnected = garminTakesWorkouts(user);
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

  const loadWorkout = () => {
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
      } else if (sp === 'STRENGTH' || sp === 'MOBILITY') {
        // The template (one goblet squat set between warm-up and cool-down) would pass
        // for the coach's session. Start empty and say so instead.
        setSteps([]);
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
  };

  useEffect(() => {
    loadWorkout();
    setIsEditing(!initialWorkout || startInEditMode);
    setInfoExercise(null);
    setIsGarminSynced(false);
    setIsAppleWatchSynced(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialWorkout, visible]);

  const handleEditPress = () => {
    if (isReadOnly) {
      onClose();
      onUpgradePress?.();
      return;
    }
    Haptics.selectionAsync();
    // Leaving edit mode without saving puts the workout back the way it was.
    if (isEditing) loadWorkout();
    setIsEditing(!isEditing);
  };

  const handleDurationChange = (mins: number) => {
    setDurationMinutes(mins);
    const scaled = scaleStepsForDuration(mins, steps, selectedSport);
    setSteps(ensureStepIds(scaled));
    setCustomRooka(calculateWbRooka(scaled, selectedSport === 'STRENGTH' || selectedSport === 'MOBILITY', selectedSport));
  };

  // What the steps add up to, as everywhere else in the app (reps and sets don't stretch
  // with the duration chips). Without steps, the chosen duration stands.
  const stepsMinutes = steps.length > 0 ? calculateWorkoutDurationMinutes({ sport: selectedSport, steps_json: steps }) : 0;
  const shownDuration = stepsMinutes > 0 ? stepsMinutes : durationMinutes;

  const computedRooka = calculateRookaPoints(selectedSport, shownDuration, steps);
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
    const finalTitle = title.trim() || t('addWorkoutExtra.defaultTitle', { sport: t(`sports.${selectedSport.toLowerCase()}`, selectedSport.charAt(0) + selectedSport.slice(1).toLowerCase()) });
    onSave(
      {
        day: initialWorkout?.day || targetDayName,
        dateStr: initialWorkout?.dateStr || targetDateStr,
        type: selectedSport,
        title: finalTitle,
        duration: `${shownDuration} mins`,
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

  const sportLabel = t(`sports.${selectedSport.toLowerCase()}`, selectedSport.charAt(0) + selectedSport.slice(1).toLowerCase());
  const dayName = initialWorkout?.day || targetDayName;
  const dateStr = initialWorkout?.dateStr || targetDateStr;

  const listHeaderComponent = useMemo(
    () => (
      <View className="pt-3 gap-y-4">
        {/* The coach's note on the session: worth having at hand while doing it */}
        {!canEditHere && initialWorkout?.coachNote ? (
          <View className="bg-theme-inset rounded-inset p-3 flex-row items-start gap-2">
            <Ionicons name="chatbubble-ellipses-outline" size={14} color="#0EA5E9" style={{ marginTop: 2 }} />
            <Text className="flex-1 text-sm text-theme-text leading-relaxed font-jakarta">{initialWorkout.coachNote}</Text>
          </View>
        ) : null}

        {canEditHere && (
          <>
            {/* Sport Tiles Strip (64pt wide, 76pt high, 8pt gap) */}
            <Reanimated.View entering={FadeInDown.duration(220)} exiting={FadeOut.duration(140)}>
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
                      activeOpacity={0.8}
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
            </Reanimated.View>

            {/* Quick Duration Chips (R2-28: 20, 30, 45, 60, 90 min) */}
            <Reanimated.View entering={FadeInDown.duration(220).delay(50)} exiting={FadeOut.duration(140)} className="flex-row items-center gap-2">
              {quickDurations.map((mins) => {
                const isSelected = durationMinutes === mins;
                return (
                  <TouchableOpacity
                    key={`dur-${mins}`}
                    onPress={() => handleDurationChange(mins)}
                    activeOpacity={0.8}
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
            </Reanimated.View>

            {/* Build with rooka (Renamed from Quick Build) */}
            <Reanimated.View entering={FadeInDown.duration(220).delay(100)} exiting={FadeOut.duration(140)}>
              <Button
                variant="secondary"
                size="md"
                label={t('dashboard.buildWithRooka', 'Build with rooka')}
                leftIcon={<Ionicons name="flash" size={16} color="#0EA5E9" />}
                onPress={() => setIsQuickBuildOpen(true)}
                className="w-full"
              />
            </Reanimated.View>
          </>
        )}

        {/* Structure Preview Bar (proportional, rounded-full matching dashboard view) */}
        {steps && steps.length > 0 && (
          <Reanimated.View layout={LinearTransition.duration(220)} className="gap-y-1.5">
            <View className="flex-row justify-between items-center">
              <Text className="text-[10px] font-semibold text-theme-muted uppercase tracking-wider">
                {t('dashboard.structurePreview', 'STRUCTURE PREVIEW')}
              </Text>
              <Text className="text-xs font-semibold text-theme-muted font-rajdhani tabular-nums">
                {shownDuration} min
              </Text>
            </View>
            <WorkoutStructureBar steps={steps} className="my-0" />
          </Reanimated.View>
        )}

        {steps.length === 0 && canEditHere && (selectedSport === 'STRENGTH' || selectedSport === 'MOBILITY') && (
          <Text className="text-xs text-theme-muted">{t('addWorkoutExtra.noExercisesYet')}</Text>
        )}
      </View>
    ),
    [selectedSport, durationMinutes, shownDuration, steps, canEditHere, initialWorkout, t]
  );

  if (!showModal) return null;

  return (
    <Modal
      visible={showModal}
      transparent
      animationType="none"
      onRequestClose={() => (infoExercise ? setInfoExercise(null) : onClose())}
      statusBarTranslucent
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          <View style={{ flex: 1, justifyContent: 'flex-end', position: 'relative' }} onLayout={onSheetLayout}>
            {/* Backdrop: Fades In/Out Simultaneously */}
            <Animated.View
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: SHEET_BACKDROP, opacity: backdropOpacity },
              ]}
            >
              <TouchableOpacity
                activeOpacity={1}
                onPress={onClose}
                style={{ flex: 1 }}
              />
            </Animated.View>

            {/* Bottom Sheet Modal Container */}
            <SheetSurface
              style={{ transform: [{ translateY: slideAnim }], height: '92%' }}
              className="flex-col"
            >
              {/* Draggable Header Region: grabber and the workout's name, like the other sheets (no close button) */}
              <View {...panHandlers} className="self-stretch">
                <View className="items-center justify-center py-3 self-stretch">
                  <SheetGrabber />
                </View>

                {infoExercise ? (
                  <TouchableOpacity
                    onPress={() => setInfoExercise(null)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="button"
                    className="flex-row items-center gap-1 px-4 pb-3 self-start"
                  >
                    <Ionicons name="chevron-back" size={20} color="#0EA5E9" />
                    <Text numberOfLines={1} className="text-sm font-bold text-theme-accent font-jakarta max-w-[280px]">
                      {title.trim() || sportLabel}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <View className="flex-row items-start gap-3 px-5 pb-3 border-b border-theme-border/60">
                    <View className="flex-1">
                      {canEditHere ? (
                        <TextInput
                          value={title}
                          onChangeText={setTitle}
                          placeholder={t('dashboard.workoutNamePlaceholder', 'Workout name (optional)')}
                          placeholderTextColor={theme.textSecondary}
                          className="bg-theme-inset px-3.5 py-2.5 rounded-control text-sm font-semibold text-theme-text border border-theme-border"
                        />
                      ) : (
                        <>
                          <Text numberOfLines={2} className="text-xl font-bold text-theme-text font-jakarta">
                            {title.trim() || sportLabel}
                          </Text>
                          <View className="flex-row items-center gap-1.5 mt-1">
                            <SportMedallion sport={selectedSport} size={18} />
                            <Text className="text-xs font-semibold text-theme-muted">
                              {sportLabel}
                              {dateStr ? ` · ${getLocalizedDayName(dayName, t)} ${dateStr}` : ''}
                            </Text>
                          </View>
                        </>
                      )}
                    </View>
                    {initialWorkout && (
                      <TouchableOpacity
                        onPress={handleEditPress}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        accessibilityRole="button"
                        accessibilityLabel={t('common.edit', 'Edit')}
                        accessibilityState={{ selected: canEditHere }}
                        className={`w-10 h-10 rounded-full items-center justify-center ${
                          canEditHere ? 'bg-theme-accent' : 'bg-theme-accent/10'
                        }`}
                      >
                        <Ionicons
                          name={isReadOnly ? 'lock-closed-outline' : 'create-outline'}
                          size={19}
                          color={canEditHere ? '#FFFFFF' : '#0EA5E9'}
                        />
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>

          <View style={{ flex: 1, display: infoExercise ? 'none' : 'flex' }}>
          {/* SCROLLABLE FORM AREA */}
          <View className="flex-1 px-5">
            <ExerciseInfoContext.Provider value={showExerciseInfo}>
            <WorkoutStepBuilder
              steps={steps}
              sport={selectedSport}
              readOnly={!canEditHere}
              durationMinutes={durationMinutes}
              quickDurations={quickDurations}
              onDurationChange={handleDurationChange}
              onChangeSteps={(newSteps, rooka) => {
                setSteps(newSteps);
                setCustomRooka(rooka);
              }}
              ListHeaderComponent={listHeaderComponent}
            />
            </ExerciseInfoContext.Provider>
          </View>

          {/* STICKY FOOTER PINNED OUTSIDE SCROLL VIEW (P0 Defect #6) */}
          <View
            style={{ paddingBottom: Math.max(safeBottom, 16), paddingTop: 12 }}
            className="px-5 border-t border-theme-border"
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
                        const finalTitle = title.trim() || t('addWorkoutExtra.defaultTitle', { sport: t(`sports.${selectedSport.toLowerCase()}`, selectedSport) });
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
                        Alert.alert(t('healthConnect.garminSyncFailedTitle'), err?.message || t('addWorkoutExtra.syncFailed'));
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
                          id: initialWorkout?.id || `${workoutDate}:${selectedSport}:${title || 'workout'}`,
                          date: workoutDate,
                          sport: selectedSport,
                          description: title || t('addWorkoutExtra.defaultTitle', { sport: t(`sports.${selectedSport.toLowerCase()}`, selectedSport) }),
                          target_rooka: calculatedRooka,
                          steps_json: steps,
                        });
                        setIsAppleWatchSynced(result.success);
                        if (result.success) {
                          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        } else {
                          Alert.alert(t('addWorkoutExtra.watchSyncFailedTitle'), result.message);
                        }
                      } catch (err: any) {
                        Alert.alert(t('addWorkoutExtra.watchSyncFailedTitle'), err?.message || t('addWorkoutExtra.syncFailed'));
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
                  value={shownDuration}
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

              {canEditHere && (
                <Reanimated.View entering={FadeInDown.duration(200)} exiting={FadeOut.duration(140)} className="flex-1">
                  <Button
                    variant="primary"
                    size="md"
                    label={t('common.save', 'Save')}
                    disabled={steps.length === 0}
                    onPress={handleSave}
                    className="w-full"
                  />
                </Reanimated.View>
              )}
            </View>

            {/* Optional Delete action if editing existing workout */}
            {initialWorkout && canEditHere && (
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
          </View>

          {infoExercise && (
            <Reanimated.View entering={SlideInRight.duration(240)} className="flex-1 px-5" style={{ paddingBottom: safeBottom }}>
              <ExerciseInfoView exerciseName={infoExercise} />
            </Reanimated.View>
          )}
            </SheetSurface>
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
