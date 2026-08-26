import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, LayoutAnimation } from 'react-native';
import { useColorScheme } from 'nativewind';
import { TouchableOpacity } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';

import { WorkoutStep, SportType } from '../../types/plan';
import { styles, CARD_COLORS } from './StepCard.styles';

export type StepCardProps = {
  step: WorkoutStep;
  isStrength: boolean;
  sport: SportType | string;
  isActive: boolean;
  drag: () => void;
  isSubStep?: boolean;
  onUpdate: (id: string | undefined, field: keyof WorkoutStep, val: any) => void;
  onRemove: (id: string | undefined) => void;
  onUpdateSub?: (parentId: string | undefined, subId: string | undefined, field: keyof WorkoutStep, val: any) => void;
  onRemoveSub?: (parentId: string | undefined, subId: string | undefined) => void;
  onAddSubStep?: (parentId: string | undefined, type: WorkoutStep['type']) => void;
};

const getPaceUnitLabel = (currentSport: SportType | string) => {
  const s = String(currentSport).toUpperCase();
  if (s.includes('BIKE') || s.includes('CYCL')) return 'km/u';
  if (s.includes('SWIM')) return 'min/100m';
  return 'min/km';
};

const getPacePlaceholder = (currentSport: SportType | string) => {
  const s = String(currentSport).toUpperCase();
  if (s.includes('BIKE') || s.includes('CYCL')) return '32.0';
  if (s.includes('SWIM')) return '1:45';
  return '4:30';
};

const stripTargetUnits = (value: string | undefined) =>
  (value || '').replace(/\s*(min\/km|min\/100m|km\/u|watts|w)\s*$/i, '').trim();

const StepCardComponent = ({
  step,
  isStrength,
  sport,
  isActive,
  drag,
  isSubStep = false,
  onUpdate,
  onRemove,
  onUpdateSub,
  onRemoveSub,
  onAddSubStep,
}: StepCardProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const { colorScheme } = useColorScheme();

  // These numeric fields (reps / minutes / metres) are typed into, so their
  // colour must be set explicitly rather than left to a utility class on a
  // TextInput — an unresolved text colour renders as white on the light input
  // background in dark mode, making the value invisible while editing.
  const inputTextColor = colorScheme === 'dark' ? '#F8FAFC' : '#1E293B';

  const condType = step.condition_type || (isStrength ? 'reps' : 'time');
  const rawTargetType = step.target_type || 'no.target';
  let targetType = rawTargetType;

  // Auto-infer exact pace/power if rawTargetType is missing but target_value is present
  if (step.target_value && (targetType === 'no.target' || (targetType as any) === 'open')) {
    if (String(step.target_value).includes(':') || String(step.target_value).toLowerCase().includes('min')) {
      targetType = 'pace.exact';
    } else if (String(step.target_value).toLowerCase().includes('w')) {
      targetType = 'power.exact';
    }
  }

  const isZoneTarget =
    targetType === 'heart.rate.zone' ||
    targetType === 'power.zone' ||
    targetType === 'pace.zone' ||
    targetType === 'speed.zone';

  const isPaceExact = targetType === 'pace.exact';
  const isExactPowerTarget = targetType === 'power.exact';
  const isWeightTarget = targetType === 'weight';
  const isStrengthOrMobility = sport === 'STRENGTH' || sport === 'MOBILITY' || isStrength;

  const colorConfig = CARD_COLORS[step.type as keyof typeof CARD_COLORS] || CARD_COLORS.default;

  const animatedStyles = useAnimatedStyle(() => {
    return {
      transform: [
        {
          scale: withSpring(isActive ? 1.02 : 1, {
            mass: 0.5,
            damping: 14,
            stiffness: 160,
          }),
        },
      ],
      elevation: isActive ? 12 : 0,
      shadowColor: isActive ? '#000' : 'transparent',
      shadowOffset: { width: 0, height: isActive ? 6 : 0 },
      shadowOpacity: isActive ? 0.2 : 0,
      shadowRadius: isActive ? 10 : 0,
      zIndex: isActive ? 99 : 1,
    };
  }, [isActive]);

  const targetDisplay = useMemo(() => {
    if (isStrengthOrMobility) {
      if (targetType === 'weight') return `${step.weight || 0} kg`;
      return 'Open';
    }
    if (targetType === 'heart.rate.zone') return `HR Zone ${step.zone || 2}`;
    if (targetType === 'power.zone') return `Pwr Zone ${step.zone || 2}`;
    if (targetType === 'pace.zone') return `Pace Zone ${step.zone || 2}`;
    if (targetType === 'speed.zone') return `Speed Zone ${step.zone || 2}`;
    if (targetType === 'pace.exact') return `Pace: ${step.target_value || getPacePlaceholder(sport)}`;
    if (targetType === 'power.exact') return `Pwr: ${step.target_value || '200'}W`;
    return 'Open';
  }, [isStrengthOrMobility, targetType, step, sport]);

  const unitDisplay =
    condType === 'time'
      ? 'MIN'
      : condType === 'time_sec'
      ? 'SEC'
      : condType === 'distance'
      ? 'M'
      : condType === 'distance_km'
      ? 'KM'
      : 'REPS';

  const handleUnitToggle = () => {
    Haptics.selectionAsync();
    const updateFn = isSubStep && onUpdateSub ? (f: any, v: any) => onUpdateSub(step.id, step.id, f, v) : (f: any, v: any) => onUpdate(step.id, f, v);

    if (isStrengthOrMobility) {
      if (condType === 'reps') updateFn('condition_type', 'time');
      else if (condType === 'time') updateFn('condition_type', 'time_sec');
      else updateFn('condition_type', 'reps');
    } else {
      if (condType === 'time') updateFn('condition_type', 'time_sec');
      else if (condType === 'time_sec') updateFn('condition_type', 'distance_km');
      else if (condType === 'distance_km') updateFn('condition_type', 'distance');
      else updateFn('condition_type', 'time');
    }
  };

  const handleValueChange = (text: string) => {
    const updateFn = isSubStep && onUpdateSub ? (f: any, v: any) => onUpdateSub(step.id, step.id, f, v) : (f: any, v: any) => onUpdate(step.id, f, v);

    if (text === '') {
      updateFn('condition_value', undefined);
      return;
    }
    const cleanText = text.replace(',', '.');
    if (cleanText.endsWith('.')) {
      updateFn('condition_value', cleanText as any);
      return;
    }
    const val = parseFloat(cleanText);
    if (!isNaN(val)) {
      updateFn('condition_value', val);
    }
  };

  const handleTargetTypeSelect = (newType: string) => {
    Haptics.selectionAsync();
    try {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    } catch (_) {}

    const updateFn = isSubStep && onUpdateSub ? (f: any, v: any) => onUpdateSub(step.id, step.id, f, v) : (f: any, v: any) => onUpdate(step.id, f, v);

    updateFn('target_type', newType);

    // Set sensible defaults when switching target type
    if (newType.endsWith('.zone') && !step.zone) {
      updateFn('zone', 2);
    }
    if (newType === 'pace.exact' && !step.target_value) {
      updateFn('target_value', getPacePlaceholder(sport));
    }
    if (newType === 'power.exact' && !step.target_value) {
      updateFn('target_value', '200');
    }
    if (newType === 'weight' && step.weight === undefined) {
      updateFn('weight', 20);
    }
  };

  const targetOptions = useMemo(() => {
    if (isStrengthOrMobility) {
      return [
        { key: 'no.target', label: 'Open' },
        { key: 'weight', label: 'Weight' },
      ];
    }
    return [
      { key: 'no.target', label: 'Open' },
      { key: 'heart.rate.zone', label: 'HR Z' },
      { key: 'power.zone', label: 'Pwr Z' },
      { key: 'power.exact', label: 'Pwr W' },
      { key: 'pace.exact', label: 'Pace' },
      { key: 'pace.zone', label: 'Pace Z' },
    ];
  }, [isStrengthOrMobility]);

  const maxZone = targetType === 'power.zone' ? 7 : 5;

  return (
    <Animated.View
      style={[
        styles.shadowHost,
        animatedStyles,
        { marginLeft: isSubStep ? 24 : 0, marginBottom: 8 },
      ]}
    >
      <View className="bg-white dark:bg-theme-card rounded-2xl border border-slate-200 dark:border-theme-border/70 overflow-hidden flex-row shadow-xs">
        {/* Left Vertical Accent Bar & Drag Handle */}
        <View className="flex-row items-center w-9 bg-slate-50 dark:bg-theme-bg/60 border-r border-slate-100 dark:border-theme-border/50 justify-center">
          <View
            className="absolute left-0 top-0 bottom-0 w-1.5"
            style={{ backgroundColor: colorConfig.bar }}
          />
          {!isSubStep && (
            <TouchableOpacity
              activeOpacity={0.7}
              onPressIn={() => Haptics.selectionAsync()}
              onLongPress={drag}
              delayLongPress={120}
              className="flex-1 items-center justify-center w-full h-full"
            >
              <Ionicons
                name="reorder-three-outline"
                size={22}
                color={isActive ? colorConfig.bar : '#94A3B8'}
              />
            </TouchableOpacity>
          )}
        </View>

        {/* Card Body Content */}
        <View className="flex-1 p-3.5">
          {/* Step Header */}
          <View className="flex-row items-center justify-between mb-2">
            <View className="flex-row items-center gap-1.5">
              <Text className="text-xs font-extrabold text-slate-800 dark:text-theme-text">
                {/* Was rendered via `uppercase`; the raw value is lowercase
                    ("warmup", "interval"), so capitalise it at the source. */}
                {step.type ? step.type.charAt(0).toUpperCase() + step.type.slice(1) : ''}
              </Text>
            </View>

            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                if (isSubStep && onRemoveSub) {
                  onRemoveSub(step.id, step.id);
                } else {
                  onRemove(step.id);
                }
              }}
              className="p-1 rounded-full hover:bg-slate-100 dark:hover:bg-theme-bg"
            >
              <Ionicons name="close" size={16} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          {/* Step Config Row */}
          {step.type === 'repeat' ? (
            <View className="flex-row items-center gap-2">
              <View className="flex-row items-center bg-slate-50 dark:bg-theme-bg/80 border border-slate-200 dark:border-theme-border/60 rounded-xl px-3 py-1.5">
                <TextInput
                  value={step.iterations !== undefined ? String(step.iterations) : ''}
                  onChangeText={(text) => {
                    const updateFn = isSubStep && onUpdateSub ? (f: any, v: any) => onUpdateSub(step.id, step.id, f, v) : (f: any, v: any) => onUpdate(step.id, f, v);
                    if (text === '') updateFn('iterations', undefined);
                    else {
                      const val = parseInt(text, 10);
                      if (!isNaN(val)) updateFn('iterations', val);
                    }
                  }}
                  keyboardType="number-pad"
                  style={{ color: inputTextColor }}
                  className="w-10 text-sm font-extrabold text-center p-0"
                />
                <Text className="text-xs font-bold text-slate-500 dark:text-theme-muted ml-1">times</Text>
              </View>
            </View>
          ) : (
            <View className="flex-col gap-2.5">
              {isStrengthOrMobility && (
                <TextInput
                  value={step.exerciseName || ''}
                  onChangeText={(text) => {
                    const updateFn = isSubStep && onUpdateSub ? (f: any, v: any) => onUpdateSub(step.id, step.id, f, v) : (f: any, v: any) => onUpdate(step.id, f, v);
                    updateFn('exerciseName', text);
                  }}
                  placeholder="Exercise name (e.g. Core Plank / Squats)"
                  placeholderTextColor="#94A3B8"
                  style={{ color: inputTextColor }}
                  className="w-full h-9 bg-slate-50 dark:bg-theme-bg/70 border border-slate-200 dark:border-theme-border/60 rounded-xl px-3 text-xs font-bold"
                />
              )}

              <View className="flex-row flex-wrap items-center gap-2">
                {/* Condition Box (Duration/Distance/Reps) matching Image 1 & 2 */}
                <View className="flex-row items-center bg-slate-50 dark:bg-theme-bg/80 border border-slate-200 dark:border-theme-border/60 rounded-xl h-9 px-2.5">
                  <TextInput
                    value={step.condition_value !== undefined ? String(step.condition_value) : ''}
                    onChangeText={handleValueChange}
                    keyboardType={isStrengthOrMobility && condType === 'reps' ? 'number-pad' : 'decimal-pad'}
                    style={{ color: inputTextColor }}
                    className="w-10 text-xs text-center font-extrabold p-0"
                  />
                  <TouchableOpacity
                    onPress={handleUnitToggle}
                    className="flex-row items-center ml-1 pl-1.5 border-l border-slate-200 dark:border-theme-border/60"
                  >
                    <Text className="text-xs font-extrabold text-slate-500 dark:text-theme-muted uppercase">
                      {unitDisplay}
                    </Text>
                    <Ionicons name="chevron-down" size={10} color="#64748B" style={{ marginLeft: 2 }} />
                  </TouchableOpacity>
                </View>

                {/* Target Selector Dropdown Button matching Image 1 & 2 */}
                <TouchableOpacity
                  onPress={() => {
                    Haptics.selectionAsync();
                    try {
                      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                    } catch (_) {}
                    setIsExpanded(!isExpanded);
                  }}
                  activeOpacity={0.75}
                  className="h-9 px-3 bg-slate-50 dark:bg-theme-bg/80 border border-slate-200 dark:border-theme-border/60 rounded-xl flex-row items-center gap-1.5"
                >
                  <Text className="text-xs font-bold text-slate-500 dark:text-theme-muted">
                    Target:{' '}
                    <Text className="text-slate-900 dark:text-theme-text font-extrabold">
                      {targetDisplay}
                    </Text>
                  </Text>
                  <Ionicons
                    name={isExpanded ? 'chevron-up' : 'chevron-down'}
                    size={13}
                    color="#64748B"
                  />
                </TouchableOpacity>
              </View>

              {/* Clean, Spacious Collapsible Target Picker Panel */}
              {isExpanded && (
                <View className="mt-1 p-3 bg-slate-50 dark:bg-theme-bg/90 border border-slate-200/80 dark:border-theme-border/60 rounded-xl flex-col gap-2.5">
                  <Text className="text-xs font-extrabold text-slate-500 dark:text-slate-400">
                    Target Type
                  </Text>

                  {/* Target Type Chips Row with High-Contrast Explicit Colors */}
                  <View className="flex-row flex-wrap gap-1.5">
                    {targetOptions.map((t) => {
                      const isSelected = targetType === t.key;
                      return (
                        <TouchableOpacity
                          key={t.key}
                          onPress={() => handleTargetTypeSelect(t.key)}
                          activeOpacity={0.75}
                          style={{
                            backgroundColor: isSelected ? '#FF5F3B' : undefined,
                            borderColor: isSelected ? '#FF5F3B' : undefined,
                          }}
                          className={`px-3 py-1.5 rounded-xl border ${
                            isSelected
                              ? 'shadow-xs'
                              : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                          }`}
                        >
                          <Text
                            className={`text-xs font-extrabold ${
                              isSelected ? 'text-white' : 'text-slate-700 dark:text-slate-200'
                            }`}
                          >
                            {t.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* Sub-Selection: Zone Pills or Exact Values */}
                  {isZoneTarget && (
                    <View className="flex-col gap-1.5 pt-1.5 border-t border-slate-200/60 dark:border-theme-border/40">
                      <Text className="text-xs font-extrabold text-slate-500 dark:text-slate-400">
                        Select Zone
                      </Text>
                      <View className="flex-row flex-wrap items-center gap-1.5">
                        {Array.from({ length: maxZone }, (_, i) => i + 1).map((z) => {
                          const isZoneSelected = step.zone === z;
                          return (
                            <TouchableOpacity
                              key={`z-${z}`}
                              onPress={() => {
                                Haptics.selectionAsync();
                                const updateFn = isSubStep && onUpdateSub ? (f: any, v: any) => onUpdateSub(step.id, step.id, f, v) : (f: any, v: any) => onUpdate(step.id, f, v);
                                updateFn('zone', z);
                              }}
                              style={{
                                backgroundColor: isZoneSelected ? '#FF5F3B' : undefined,
                                borderColor: isZoneSelected ? '#FF5F3B' : undefined,
                              }}
                              className={`w-9 h-9 rounded-xl items-center justify-center border ${
                                isZoneSelected
                                  ? 'shadow-xs'
                                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                              }`}
                            >
                              <Text
                                className={`text-xs font-extrabold ${
                                  isZoneSelected ? 'text-white' : 'text-slate-800 dark:text-slate-100'
                                }`}
                              >
                                Z{z}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  )}

                  {(isPaceExact || isExactPowerTarget || isWeightTarget) && (
                    <View className="flex-col gap-1.5 pt-1.5 border-t border-slate-200/60 dark:border-theme-border/40">
                      <Text className="text-xs font-extrabold text-slate-500 dark:text-slate-400">
                        {isWeightTarget ? 'Target Weight' : isExactPowerTarget ? 'Target Power' : 'Target Pace'}
                      </Text>
                      <View className="flex-row items-center gap-2">
                        <TextInput
                          value={
                            isWeightTarget
                              ? String(step.weight !== undefined ? step.weight : '')
                              : stripTargetUnits(step.target_value)
                          }
                          onChangeText={(text) => {
                            const updateFn = isSubStep && onUpdateSub ? (f: any, v: any) => onUpdateSub(step.id, step.id, f, v) : (f: any, v: any) => onUpdate(step.id, f, v);
                            if (isWeightTarget) {
                              updateFn('weight', text === '' ? undefined : parseFloat(text));
                            } else {
                              updateFn('target_value', text);
                            }
                          }}
                          keyboardType={isPaceExact ? 'numbers-and-punctuation' : 'decimal-pad'}
                          placeholder={
                            isWeightTarget
                              ? '20'
                              : isExactPowerTarget
                              ? '200'
                              : getPacePlaceholder(sport)
                          }
                          placeholderTextColor="#94A3B8"
                          style={{ color: inputTextColor }}
                          className="flex-1 h-9 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 text-xs font-extrabold"
                        />
                        <Text className="text-xs font-extrabold text-slate-700 dark:text-slate-300">
                          {isWeightTarget
                            ? 'kg'
                            : isExactPowerTarget
                            ? 'W'
                            : getPaceUnitLabel(sport)}
                        </Text>
                      </View>
                    </View>
                  )}
                </View>
              )}
            </View>
          )}

          {/* Repeat Block Child Steps */}
          {step.type === 'repeat' && step.steps && (
            <View className="mt-3 flex-col gap-1.5">
              {step.steps.map((subStep) => (
                <StepCardComponent
                  key={subStep.id}
                  step={subStep}
                  isStrength={isStrength}
                  sport={sport}
                  isActive={false}
                  drag={() => {}}
                  isSubStep={true}
                  onUpdate={(id, field, val) => {
                    if (onUpdateSub) onUpdateSub(step.id, id, field, val);
                  }}
                  onRemove={(id) => {
                    if (onRemoveSub) onRemoveSub(step.id, id);
                  }}
                />
              ))}

              {onAddSubStep && (
                <TouchableOpacity
                  onPress={() => onAddSubStep(step.id, 'interval')}
                  className="py-1.5 px-3 bg-slate-100 dark:bg-theme-bg/60 border border-dashed border-slate-300 dark:border-theme-border rounded-xl flex-row items-center justify-center gap-1 self-start mt-1"
                >
                  <Ionicons name="add" size={14} color="#64748B" />
                  <Text className="text-xs font-bold text-slate-600 dark:text-theme-muted">
                    + Sub-step
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      </View>
    </Animated.View>
  );
};

export const StepCard = React.memo(StepCardComponent);
