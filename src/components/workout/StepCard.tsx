import React, { useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView } from 'react-native';
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
};

const getPaceUnitLabel = (currentSport: SportType | string) => {
  switch (currentSport) {
    case 'BIKE':
      return 'km/u';
    case 'SWIM':
      return 'min/100m';
    case 'RUN':
    default:
      return 'min/km';
  }
};

const getPacePlaceholder = (currentSport: SportType | string) => {
  switch (currentSport) {
    case 'BIKE':
      return '32.0';
    case 'SWIM':
      return '1:45';
    case 'RUN':
    default:
      return '4:30';
  }
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
}: StepCardProps) => {
  const condType = step.condition_type || 'time';
  const isTime = condType === 'time' || condType === 'time_sec';
  const isDistance = condType === 'distance' || condType === 'distance_km';
  const targetType = step.target_type || 'no.target';
  const isZoneTarget = targetType === 'heart.rate.zone' || targetType === 'power.zone';
  const isPaceTarget = targetType === 'pace.exact' || targetType === 'pace.zone';
  const isStrengthOrMobility = sport === 'STRENGTH' || sport === 'MOBILITY';

  const colorConfig = CARD_COLORS[step.type as keyof typeof CARD_COLORS] || CARD_COLORS.default;

  // React Native Reanimated hook to elevate active card
  const animatedStyles = useAnimatedStyle(() => {
    return {
      transform: [
        {
          scale: withSpring(isActive ? 1.02 : 1, {
            mass: 0.5,
            damping: 12,
            stiffness: 150,
          }),
        },
      ],
      elevation: isActive ? 16 : 1,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: isActive ? 8 : 1 },
      shadowOpacity: isActive ? 0.2 : 0.05,
      shadowRadius: isActive ? 12 : 3,
      zIndex: isActive ? 99 : 1,
    };
  }, [isActive]);

  return (
    <Animated.View
      style={[
        styles.shadowHost,
        animatedStyles,
        {
          marginLeft: isSubStep ? 32 : 0,
        },
      ]}
    >
      <View
        style={[
          styles.clip,
          {
            backgroundColor: colorConfig.bg,
            borderColor: colorConfig.border,
            borderLeftWidth: isSubStep ? 2 : 1,
            borderLeftColor: isSubStep ? '#CBD5E1' : colorConfig.border,
          },
        ]}
      >
        {/* Drag Handle Column - Only on Root Steps */}
        {!isSubStep && (
          <TouchableOpacity
            activeOpacity={0.7}
            onLongPress={drag}
            delayLongPress={200}
            style={styles.handleColumn}
          >
            <Ionicons name="reorder-three-outline" size={20} color={isActive ? '#FF5F3B' : '#94A3B8'} />
          </TouchableOpacity>
        )}

        {/* Card Content Column */}
        <View style={styles.content} className="space-y-2.5">
          {/* Header Row: Type and Delete Button */}
          <View className="flex-row items-center justify-between mb-1">
            <Text className="text-[11px] font-extrabold uppercase tracking-widest text-theme-text">
              {step.type}
            </Text>

            <TouchableOpacity onPress={() => (isSubStep && onRemoveSub ? onRemoveSub(step.id, step.id) : onRemove(step.id))}>
              <View
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  backgroundColor: '#F1F5F9',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="close" size={14} color="#64748B" />
              </View>
            </TouchableOpacity>
          </View>

          {/* Repeat Block Controls */}
          {step.type === 'repeat' ? (
            <View className="flex-row items-center gap-2">
              <Text className="text-xs font-bold text-theme-text">Repeat Block:</Text>
              <TextInput
                value={step.iterations !== undefined ? String(step.iterations) : ''}
                onChangeText={(text) => {
                  if (text === '') onUpdate(step.id, 'iterations', undefined);
                  else {
                    const val = parseInt(text, 10);
                    if (!isNaN(val)) onUpdate(step.id, 'iterations', val);
                  }
                }}
                keyboardType="number-pad"
                className="w-12 bg-theme-card border border-slate-200 rounded-xl px-2 py-1 text-xs text-center font-bold text-theme-text"
              />
              <Text className="text-xs text-theme-muted font-bold">times</Text>
            </View>
          ) : (
            <>
              <View className="flex-row flex-wrap items-center gap-2">
                <TextInput
                  value={step.condition_value !== undefined ? String(step.condition_value) : ''}
                  onChangeText={(text) => {
                    if (text === '') onUpdate(step.id, 'condition_value', undefined);
                    else if (text.endsWith('.') || text.endsWith(',')) {
                      onUpdate(step.id, 'condition_value', text.replace(',', '.') as any);
                    } else {
                      const val = parseFloat(text.replace(',', '.'));
                      if (!isNaN(val)) onUpdate(step.id, 'condition_value', val);
                    }
                  }}
                  keyboardType={isStrengthOrMobility && condType === 'reps' ? 'number-pad' : 'decimal-pad'}
                  className="w-14 bg-theme-card border border-slate-200 rounded-xl px-2 py-1 text-xs text-center font-bold text-theme-text"
                />

                <View className="flex-row bg-theme-card border border-slate-200 rounded-xl p-0.5">
                  {isStrengthOrMobility ? (
                    ['reps', 'min'].map((unit) => {
                      const isSelected =
                        (unit === 'reps' && step.condition_type === 'reps') ||
                        (unit === 'min' && step.condition_type === 'time');
                      return (
                        <TouchableOpacity
                          key={unit}
                          onPress={() => {
                            Haptics.selectionAsync();
                            onUpdate(step.id, 'condition_type', unit === 'reps' ? 'reps' : 'time');
                          }}
                          className={`px-2 py-0.5 rounded-lg ${isSelected ? 'bg-theme-accent' : ''}`}
                        >
                          <Text
                            className={`text-[10px] font-bold ${
                              isSelected ? 'text-white' : 'text-theme-muted'
                            }`}
                          >
                            {unit}
                          </Text>
                        </TouchableOpacity>
                      );
                    })
                  ) : isTime ? (
                    ['min', 'sec'].map((unit) => {
                      const isSelected =
                        (unit === 'min' && step.condition_type === 'time') ||
                        (unit === 'sec' && step.condition_type === 'time_sec');
                      return (
                        <TouchableOpacity
                          key={unit}
                          onPress={() => {
                            Haptics.selectionAsync();
                            onUpdate(step.id, 'condition_type', unit === 'min' ? 'time' : 'time_sec');
                          }}
                          className={`px-2 py-0.5 rounded-lg ${isSelected ? 'bg-theme-accent' : ''}`}
                        >
                          <Text
                            className={`text-[10px] font-bold ${
                              isSelected ? 'text-white' : 'text-theme-muted'
                            }`}
                          >
                            {unit}
                          </Text>
                        </TouchableOpacity>
                      );
                    })
                  ) : (
                    ['m', 'km'].map((unit) => {
                      const isSelected =
                        (unit === 'm' && step.condition_type === 'distance') ||
                        (unit === 'km' && step.condition_type === 'distance_km');
                      return (
                        <TouchableOpacity
                          key={unit}
                          onPress={() => {
                            Haptics.selectionAsync();
                            onUpdate(
                              step.id,
                              'condition_type',
                              unit === 'm' ? 'distance' : 'distance_km'
                            );
                          }}
                          className={`px-2 py-0.5 rounded-lg ${isSelected ? 'bg-theme-accent' : ''}`}
                        >
                          <Text
                            className={`text-[10px] font-bold ${
                              isSelected ? 'text-white' : 'text-theme-muted'
                            }`}
                          >
                            {unit}
                          </Text>
                        </TouchableOpacity>
                      );
                    })
                  )}
                </View>

                {!isStrengthOrMobility && (
                  <View className="flex-row bg-theme-card border border-slate-200 rounded-xl p-0.5">
                    {['time', 'distance'].map((category) => {
                      const isSelected = (category === 'time' && isTime) || (category === 'distance' && isDistance);

                      return (
                        <TouchableOpacity
                          key={category}
                          onPress={() => {
                            Haptics.selectionAsync();
                            let newType = 'time';
                            if (category === 'time') newType = 'time';
                            else if (category === 'distance')
                              newType = sport === 'SWIM' ? 'distance' : 'distance_km';

                            onUpdate(step.id, 'condition_type', newType);
                          }}
                          className={`px-2.5 py-0.5 rounded-lg ${isSelected ? 'bg-theme-accent' : ''}`}
                        >
                          <Text
                            className={`text-[10px] font-extrabold capitalize ${
                              isSelected ? 'text-white' : 'text-theme-muted'
                            }`}
                          >
                            {category}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>

              <View className="flex-row items-center gap-2 pt-1 border-t border-slate-200/60 mt-1">
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-1">
                  <View className="flex-row bg-theme-card border border-slate-200 rounded-xl p-0.5 gap-0.5">
                    {(isStrengthOrMobility
                      ? [
                          { key: 'no.target', label: 'Open' },
                          { key: 'weight', label: 'Weight' },
                        ]
                      : [
                          { key: 'no.target', label: 'Open' },
                          { key: 'heart.rate.zone', label: 'HR Z' },
                          { key: 'power.zone', label: 'Pwr Z' },
                          { key: 'pace.exact', label: 'Pace' },
                        ]
                    ).map((target) => {
                      const isSelected = targetType === target.key;
                      return (
                        <TouchableOpacity
                          key={target.key}
                          onPress={() => {
                            Haptics.selectionAsync();
                            onUpdate(step.id, 'target_type', target.key);
                          }}
                          className={`px-3 py-1 rounded-lg ${isSelected ? 'bg-theme-accent' : ''}`}
                        >
                          <Text
                            className={`text-[10px] font-extrabold ${
                              isSelected ? 'text-white' : 'text-theme-muted'
                            }`}
                          >
                            {target.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </ScrollView>
              </View>

              {isZoneTarget && !isStrengthOrMobility && (
                <View className="pt-0.5">
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} className="w-full">
                    <View className="flex-row items-center gap-1.5 py-0.5">
                      {Array.from(
                        { length: step.target_type === 'power.zone' ? 7 : 5 },
                        (_, zIdx) => zIdx + 1
                      ).map((zoneNum) => {
                        const isSelected = (step.zone || 2) === zoneNum;
                        return (
                          <TouchableOpacity
                            key={zoneNum}
                            onPress={() => {
                              Haptics.selectionAsync();
                              onUpdate(step.id, 'zone', zoneNum);
                            }}
                            activeOpacity={0.7}
                            className={`px-3 py-1 rounded-xl border shadow-sm ${
                              isSelected
                                ? 'bg-theme-accent border-theme-accent'
                                : 'bg-theme-card border-slate-200'
                            }`}
                          >
                            <Text
                              className={`text-xs font-mono font-extrabold ${
                                isSelected ? 'text-white' : 'text-theme-muted'
                              }`}
                            >
                              Z{zoneNum}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </ScrollView>
                </View>
              )}

              {isPaceTarget && !isStrengthOrMobility && (
                <View className="flex-row items-center gap-2 pt-0.5">
                  <TextInput
                    value={step.target_value || ''}
                    onChangeText={(text) => onUpdate(step.id, 'target_value', text)}
                    keyboardType={sport === 'BIKE' ? 'decimal-pad' : 'numbers-and-punctuation'}
                    placeholder={getPacePlaceholder(sport)}
                    className="w-24 bg-theme-card border border-slate-200 rounded-xl px-3 py-1 text-xs font-mono font-bold text-theme-text text-center"
                  />
                  <Text className="text-xs font-extrabold text-theme-accent">
                    {getPaceUnitLabel(sport)}
                  </Text>
                </View>
              )}

              {step.target_type === 'weight' && isStrengthOrMobility && (
                <View className="flex-row items-center gap-2 pt-0.5 mt-1">
                  <View className="flex-row items-center gap-2 bg-theme-card border border-slate-200 rounded-xl px-2 py-1">
                    <TextInput
                      value={step.weight !== undefined ? String(step.weight) : ''}
                      onChangeText={(text) => {
                        if (text === '') onUpdate(step.id, 'weight', undefined);
                        else if (text.endsWith('.') || text.endsWith(',')) {
                          onUpdate(step.id, 'weight', text.replace(',', '.') as any);
                        } else {
                          const val = parseFloat(text.replace(',', '.'));
                          if (!isNaN(val)) onUpdate(step.id, 'weight', val);
                        }
                      }}
                      placeholder="—"
                      keyboardType="decimal-pad"
                      className="w-14 text-xs text-center font-bold text-theme-text"
                    />
                    <Text className="text-[10px] font-bold text-theme-muted uppercase tracking-wider pr-1">KG</Text>
                  </View>
                </View>
              )}

              {isStrengthOrMobility && (
                <View className="pt-2">
                  <TextInput
                    value={step.exerciseName || ''}
                    onChangeText={(text) => onUpdate(step.id, 'exerciseName', text)}
                    placeholder="Exercise name (e.g. Bench Press)"
                    className="w-full bg-theme-card border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-theme-text"
                  />
                </View>
              )}
            </>
          )}

          {/* Render SubSteps for repeat blocks recursively */}
          {step.type === 'repeat' && step.steps && (
            <View className="mt-2">
              {step.steps.map((subStep) => (
                <StepCardComponent
                  key={subStep.id}
                  step={subStep}
                  isStrength={isStrength}
                  sport={sport}
                  isActive={false} // substeps aren't dragged independently
                  drag={() => {}}
                  isSubStep={true}
                  onUpdate={(id, field, val) => {
                    if (onUpdateSub) {
                      onUpdateSub(step.id, id, field, val);
                    }
                  }}
                  onRemove={(id) => {
                    if (onRemoveSub) {
                      onRemoveSub(step.id, id);
                    }
                  }}
                />
              ))}
            </View>
          )}
        </View>
      </View>
    </Animated.View>
  );
};

export const StepCard = React.memo(StepCardComponent);
