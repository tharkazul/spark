import { BrandColors, Fonts } from '@/constants/theme';
import React, { useMemo, useState } from 'react';
import { useTheme } from '@/hooks/use-theme';
import { View, Text, TextInput, KeyboardTypeOptions } from 'react-native';
import { useColorScheme } from 'nativewind';
import { TouchableOpacity } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  FadeOutUp,
  LinearTransition,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';

import { WorkoutStep, SportType } from '../../types/plan';
import { styles, CARD_COLORS, ZONE_COLORS } from './StepCard.styles';
import { ScalePressable } from '@/components/ui/ScalePressable';

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

interface StepInputPillProps {
  value: string;
  onChangeText: (text: string) => void;
  unit: string;
  onUnitPress?: () => void;
  isUnitInteractive?: boolean;
  keyboardType?: KeyboardTypeOptions;
  placeholder?: string;
  textColor?: string;
  inputWidth?: number;
  className?: string;
}

/**
 * Integrated unit input pill replacing bare text fields with embedded badges,
 * tabular monospace figures, subtle borders, and spring physics.
 */
const StepInputPill = ({
  value,
  onChangeText,
  unit,
  onUnitPress,
  isUnitInteractive = false,
  keyboardType = 'decimal-pad',
  placeholder = '',
  textColor,
  inputWidth,
  className = '',
}: StepInputPillProps) => {
  const [isFocused, setIsFocused] = useState(false);
  const theme = useTheme();

  return (
    <View
      className={`flex-row items-center bg-slate-50 dark:bg-slate-800/80 border rounded-xl h-9 px-2.5 ${
        isFocused
          ? 'border-theme-accent dark:border-theme-accent'
          : 'border-slate-200/80 dark:border-white/10'
      } ${className}`}
    >
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        style={{
          color: textColor,
          fontFamily: Fonts?.numeric,
          fontSize: 13,
          width: inputWidth,
        }}
        className={`font-bold p-0 ${inputWidth ? 'text-center' : 'flex-1 text-left'}`}
      />
      {isUnitInteractive ? (
        <ScalePressable
          onPress={onUnitPress}
          activeScale={0.92}
          haptic="selection"
          className="flex-row items-center ml-1.5 pl-1.5 py-0.5 border-l border-slate-200 dark:border-white/10"
        >
          <Text className="text-[10px] font-extrabold text-theme-muted dark:text-theme-muted tracking-wider uppercase">
            {unit}
          </Text>
          <Ionicons
            name="chevron-down"
            size={9}
            color={theme.textSecondary}
            style={{ marginLeft: 2 }}
          />
        </ScalePressable>
      ) : (
        <View className="ml-1.5 pl-1.5 py-0.5 border-l border-slate-200 dark:border-white/10">
          <Text className="text-[10px] font-extrabold text-theme-muted dark:text-theme-muted tracking-wider uppercase">
            {unit}
          </Text>
        </View>
      )}
    </View>
  );
};


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
    const theme = useTheme();
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

  // Auto-infer exact pace/power if rawTargetType is missing or mismatching but target_value is present
  if (step.target_value && (targetType === 'no.target' || (targetType as any) === 'open' || (targetType === 'heart.rate.zone' && !step.zone))) {
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

  const targetIcon = useMemo(() => {
    if (targetType === 'heart.rate.zone') {
      return <Ionicons name="heart" size={12} color="#EF4444" />;
    }
    if (targetType === 'power.zone' || targetType === 'power.exact') {
      return <Ionicons name="flash" size={12} color="#F59E0B" />;
    }
    if (targetType === 'pace.zone' || targetType === 'pace.exact' || targetType === 'speed.zone' || targetType === 'speed.exact') {
      return <Ionicons name="speedometer-outline" size={12} color="#3B82F6" />;
    }
    if (targetType === 'weight') {
      return <Ionicons name="barbell-outline" size={12} color="#8B5CF6" />;
    }
    return <Ionicons name="radio-button-off-outline" size={12} color={theme.textSecondary} />;
  }, [targetType, theme.textSecondary]);

  const hasActiveTarget = targetType !== 'no.target' && (targetType as any) !== 'open';

  return (
    <Animated.View
      layout={isActive ? undefined : LinearTransition.springify().damping(16).stiffness(160)}
      entering={FadeInDown.duration(220).springify().damping(15)}
      exiting={FadeOutUp.duration(180)}
      style={[
        styles.shadowHost,
        animatedStyles,
        { marginLeft: isSubStep ? 20 : 0, marginBottom: 8 },
      ]}
    >
      <View className="bg-white dark:bg-[#141923] rounded-2xl border border-slate-200/80 dark:border-white/10 overflow-hidden flex-row shadow-xs">
        {/* Left Vertical Accent Bar & Drag Handle */}
        <View className="flex-row items-center w-9 bg-slate-50/80 dark:bg-slate-900/40 border-r border-slate-100 dark:border-white/5 justify-center">
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
              <View
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: colorConfig.bar }}
              />
              <Text className="text-xs font-extrabold text-theme-text">
                {step.type ? step.type.charAt(0).toUpperCase() + step.type.slice(1) : ''}
              </Text>
            </View>

            <ScalePressable
              onPress={() => {
                if (isSubStep && onRemoveSub) {
                  onRemoveSub(step.id, step.id);
                } else {
                  onRemove(step.id);
                }
              }}
              activeScale={0.88}
              haptic="light"
              className="w-6 h-6 rounded-full items-center justify-center bg-slate-100 dark:bg-slate-800"
            >
              <Ionicons name="close" size={14} color={theme.textSecondary} />
            </ScalePressable>
          </View>

          {/* Step Config Row */}
          {step.type === 'repeat' ? (
            <View className="flex-row items-center gap-2">
              <StepInputPill
                value={step.iterations !== undefined ? String(step.iterations) : ''}
                onChangeText={(text) => {
                  const updateFn = isSubStep && onUpdateSub ? (f: any, v: any) => onUpdateSub(step.id, step.id, f, v) : (f: any, v: any) => onUpdate(step.id, f, v);
                  if (text === '') updateFn('iterations', undefined);
                  else {
                    const val = parseInt(text, 10);
                    if (!isNaN(val)) updateFn('iterations', val);
                  }
                }}
                unit="times"
                keyboardType="number-pad"
                placeholder="3"
                textColor={inputTextColor}
                inputWidth={36}
              />
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
                  placeholderTextColor={theme.textSecondary}
                  style={{ color: inputTextColor }}
                  className="w-full h-9 bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-white/10 rounded-xl px-3 text-xs font-bold"
                />
              )}

              <View className="flex-row flex-wrap items-center gap-2">
                {/* Condition Box with Integrated Unit Badge */}
                <StepInputPill
                  value={step.condition_value !== undefined ? String(step.condition_value) : ''}
                  onChangeText={handleValueChange}
                  unit={unitDisplay}
                  onUnitPress={handleUnitToggle}
                  isUnitInteractive={true}
                  keyboardType={isStrengthOrMobility && condType === 'reps' ? 'number-pad' : 'decimal-pad'}
                  placeholder="0"
                  textColor={inputTextColor}
                  inputWidth={40}
                />

                {/* Target Selector Button with Context Icon */}
                <ScalePressable
                  onPress={() => {
                    setIsExpanded(!isExpanded);
                  }}
                  activeScale={0.96}
                  haptic="selection"
                  className={`h-9 px-2.5 rounded-xl border flex-row items-center gap-1.5 ${
                    hasActiveTarget
                      ? 'bg-theme-accent/10 border-theme-accent/30 dark:bg-theme-accent/15 dark:border-theme-accent/40'
                      : 'bg-slate-50 dark:bg-slate-800/80 border-slate-200/80 dark:border-white/10'
                  }`}
                >
                  {targetIcon}
                  <Text className="text-xs font-bold text-theme-muted dark:text-theme-muted">
                    Target:{' '}
                    <Text
                      className={`font-extrabold ${
                        hasActiveTarget ? 'text-theme-accent' : 'text-theme-text'
                      }`}
                    >
                      {targetDisplay}
                    </Text>
                  </Text>
                  <Ionicons
                    name={isExpanded ? 'chevron-up' : 'chevron-down'}
                    size={11}
                    color={hasActiveTarget ? BrandColors.primary : theme.textSecondary}
                  />
                </ScalePressable>
              </View>

              {/* Clean, Spacious Collapsible Target Picker Panel */}
              {isExpanded && (
                <Animated.View
                  entering={FadeIn.duration(180)}
                  exiting={FadeOut.duration(140)}
                  layout={LinearTransition.springify().damping(16).stiffness(160)}
                  className="mt-1 p-3 bg-slate-50/80 dark:bg-slate-900/90 border border-slate-200/80 dark:border-white/10 rounded-xl flex-col gap-2.5"
                >
                  <Text className="text-xs font-extrabold text-theme-muted">
                    Target Type
                  </Text>

                  {/* Target Type Chips Row with ScalePressable */}
                  <View className="flex-row flex-wrap gap-1.5">
                    {targetOptions.map((t) => {
                      const isSelected = targetType === t.key;
                      return (
                        <ScalePressable
                          key={t.key}
                          onPress={() => handleTargetTypeSelect(t.key)}
                          activeScale={0.94}
                          haptic="selection"
                          style={{
                            backgroundColor: isSelected ? BrandColors.primary : undefined,
                            borderColor: isSelected ? BrandColors.primary : undefined,
                          }}
                          className={`px-3 py-1.5 rounded-xl border ${
                            isSelected
                              ? 'shadow-xs'
                              : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-white/10'
                          }`}
                        >
                          <Text
                            className={`text-xs font-extrabold ${
                              isSelected ? 'text-white' : 'text-slate-700 dark:text-slate-200'
                            }`}
                          >
                            {t.label}
                          </Text>
                        </ScalePressable>
                      );
                    })}
                  </View>

                  {/* Sub-Selection: Zone Pills with ZONE_COLORS */}
                  {isZoneTarget && (
                    <Animated.View
                      entering={FadeIn.duration(150)}
                      exiting={FadeOut.duration(120)}
                      layout={LinearTransition.springify().damping(16).stiffness(160)}
                      className="flex-col gap-1.5 pt-1.5 border-t border-slate-200/60 dark:border-white/5"
                    >
                      <Text className="text-xs font-extrabold text-theme-muted">
                        Select Zone
                      </Text>
                      <View className="flex-row flex-wrap items-center gap-1.5">
                        {Array.from({ length: maxZone }, (_, i) => i + 1).map((z) => {
                          const isZoneSelected = step.zone === z;
                          const zoneColor = ZONE_COLORS[z] || ZONE_COLORS[2];
                          return (
                            <ScalePressable
                              key={`z-${z}`}
                              onPress={() => {
                                const updateFn = isSubStep && onUpdateSub ? (f: any, v: any) => onUpdateSub(step.id, step.id, f, v) : (f: any, v: any) => onUpdate(step.id, f, v);
                                updateFn('zone', z);
                              }}
                              activeScale={0.92}
                              haptic="selection"
                              style={{
                                backgroundColor: isZoneSelected ? zoneColor.bg : undefined,
                                borderColor: isZoneSelected ? zoneColor.border : undefined,
                              }}
                              className={`w-9 h-9 rounded-xl items-center justify-center border ${
                                isZoneSelected
                                  ? 'shadow-xs'
                                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-white/10'
                              }`}
                            >
                              <Text
                                style={{ fontFamily: Fonts?.numeric }}
                                className={`text-xs font-extrabold ${
                                  isZoneSelected ? 'text-white' : 'text-slate-800 dark:text-slate-100'
                                }`}
                              >
                                Z{z}
                              </Text>
                            </ScalePressable>
                          );
                        })}
                      </View>
                    </Animated.View>
                  )}

                  {/* Exact Value Target Input using StepInputPill */}
                  {(isPaceExact || isExactPowerTarget || isWeightTarget) && (
                    <Animated.View
                      entering={FadeIn.duration(150)}
                      exiting={FadeOut.duration(120)}
                      layout={LinearTransition.springify().damping(16).stiffness(160)}
                      className="flex-col gap-1.5 pt-1.5 border-t border-slate-200/60 dark:border-white/5"
                    >
                      <Text className="text-xs font-extrabold text-theme-muted">
                        {isWeightTarget ? 'Target Weight' : isExactPowerTarget ? 'Target Power' : 'Target Pace'}
                      </Text>
                      <StepInputPill
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
                        unit={
                          isWeightTarget
                            ? 'kg'
                            : isExactPowerTarget
                            ? 'W'
                            : getPaceUnitLabel(sport)
                        }
                        keyboardType={isPaceExact ? 'numbers-and-punctuation' : 'decimal-pad'}
                        placeholder={
                          isWeightTarget
                            ? '20'
                            : isExactPowerTarget
                            ? '200'
                            : getPacePlaceholder(sport)
                        }
                        textColor={inputTextColor}
                        className="w-full"
                      />
                    </Animated.View>
                  )}
                </Animated.View>
              )}
            </View>
          )}

          {/* Repeat Block Child Steps */}
          {step.type === 'repeat' && step.steps && (
            <Animated.View
              layout={LinearTransition.springify().damping(16).stiffness(160)}
              className="mt-3 relative pl-2"
            >
              {/* Vertical nesting track indicator */}
              <View
                className="absolute left-0 top-1 bottom-3 w-0.5 rounded-full"
                style={{ backgroundColor: colorConfig.bar, opacity: 0.35 }}
              />
              <View className="flex-col gap-1.5">
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
                  <Animated.View layout={LinearTransition.springify().damping(16).stiffness(160)}>
                    <ScalePressable
                      onPress={() => onAddSubStep(step.id, 'interval')}
                      activeScale={0.96}
                      haptic="light"
                      className="py-1.5 px-3 bg-slate-100 dark:bg-slate-800/80 border border-dashed border-slate-300 dark:border-white/10 rounded-xl flex-row items-center justify-center gap-1 self-start mt-1"
                    >
                      <Ionicons name="add" size={14} color={theme.textSecondary} />
                      <Text className="text-xs font-bold text-slate-600 dark:text-theme-muted">
                        + Sub-step
                      </Text>
                    </ScalePressable>
                  </Animated.View>
                )}
              </View>
            </Animated.View>
          )}
        </View>
      </View>
    </Animated.View>
  );
};

export const StepCard = React.memo(StepCardComponent);
