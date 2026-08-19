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
}: StepCardProps) => {
  const [isExpanded, setIsExpanded] = React.useState(false);

  const condType = step.condition_type || 'time';
  const isTime = condType === 'time' || condType === 'time_sec';
  const isDistance = condType === 'distance' || condType === 'distance_km';
  const rawTargetType = step.target_type || 'no.target';
  let targetType = rawTargetType;
  if (step.target_value && (targetType === 'no.target' || (targetType as any) === 'open')) {
    if (String(step.target_value).includes(':') || String(step.target_value).toLowerCase().includes('min')) {
      targetType = 'pace.exact';
    } else if (String(step.target_value).toLowerCase().includes('w')) {
      targetType = 'power.exact';
    }
  }
  const isZoneTarget = targetType === 'heart.rate.zone' || targetType === 'power.zone';
  const isPaceTarget = targetType === 'pace.exact' || targetType === 'pace.zone';
  const isExactPowerTarget = targetType === 'power.exact';
  const isStrengthOrMobility = sport === 'STRENGTH' || sport === 'MOBILITY';

  const colorConfig = CARD_COLORS[step.type as keyof typeof CARD_COLORS] || CARD_COLORS.default;

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
      elevation: isActive ? 16 : 0,
      shadowColor: isActive ? '#000' : 'transparent',
      shadowOffset: { width: 0, height: isActive ? 8 : 0 },
      shadowOpacity: isActive ? 0.2 : 0,
      shadowRadius: isActive ? 12 : 0,
      zIndex: isActive ? 99 : 1,
    };
  }, [isActive]);

  const targetDisplay = useMemo(() => {
    if (isStrengthOrMobility) {
      if (targetType === 'weight') return `Weight: ${step.weight || 0} kg`;
      return 'Open';
    }
    if (targetType === 'heart.rate.zone') return `HR Zone ${step.zone || 2}`;
    if (targetType === 'power.zone') return `Pwr Zone ${step.zone || 2}`;
    if (targetType === 'pace.exact') return `Pace: ${step.target_value || '-'}`;
    if (targetType === 'power.exact') return `Pwr: ${step.target_value || '-'}W`;
    return 'Open';
  }, [isStrengthOrMobility, targetType, step]);

  const unitDisplay = condType === 'time' ? 'min' : condType === 'time_sec' ? 'sec' : condType === 'distance' ? 'm' : condType === 'distance_km' ? 'km' : 'reps';

  return (
    <Animated.View
      style={[
        styles.shadowHost,
        animatedStyles,
        { marginLeft: isSubStep ? 32 : 0, marginBottom: 8 },
      ]}
    >
      <View className="bg-white rounded-xl border border-slate-200 overflow-hidden flex-row">
        {/* Left Border Accent & Drag Handle */}
        <View className="flex-row items-center w-8 bg-slate-50 border-r border-slate-100 justify-center">
          <View className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: colorConfig.border }} />
          {!isSubStep && (
            <TouchableOpacity activeOpacity={0.7} onLongPress={drag} delayLongPress={200} className="w-full h-full items-center justify-center py-4">
              <Ionicons name="reorder-three-outline" size={20} color={isActive ? colorConfig.border : '#94A3B8'} />
            </TouchableOpacity>
          )}
        </View>

        {/* Content */}
        <View className="flex-1 p-3">
          {/* Header */}
          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-[11px] font-extrabold uppercase tracking-widest text-slate-800">
              {step.type}
            </Text>
            <TouchableOpacity onPress={() => (isSubStep && onRemoveSub ? onRemoveSub(step.id, step.id) : onRemove(step.id))}>
              <Ionicons name="close" size={16} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          {/* Config Row */}
          {step.type === 'repeat' ? (
             <View className="flex-row items-center gap-2">
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
                 className="w-14 h-9 bg-slate-50 border border-slate-200 rounded-lg text-sm text-center font-bold text-slate-800"
               />
               <Text className="text-sm font-medium text-slate-500">times</Text>
             </View>
          ) : (
             <View className="flex-col gap-2">
               {isStrengthOrMobility && (
                 <TextInput
                   value={step.exerciseName || ''}
                   onChangeText={(text) => onUpdate(step.id, 'exerciseName', text)}
                   placeholder="Exercise name (e.g. Bench Press)"
                   className="w-full h-9 bg-slate-50 border border-slate-200 rounded-lg px-3 text-sm font-bold text-slate-800"
                 />
               )}
               
               <View className="flex-row flex-wrap items-center gap-2">
                 {/* Duration/Distance Box */}
                 <View className="flex-row items-center bg-slate-50 border border-slate-200 rounded-lg h-9 overflow-hidden">
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
                     className="w-12 h-full text-sm text-center font-bold text-slate-800"
                   />
                   <TouchableOpacity
                     onPress={() => {
                       Haptics.selectionAsync();
                       if (isStrengthOrMobility) {
                         onUpdate(step.id, 'condition_type', condType === 'reps' ? 'time' : 'reps');
                       } else {
                         // simple toggle for now between min/km
                         if (condType === 'time') onUpdate(step.id, 'condition_type', 'distance_km');
                         else if (condType === 'distance_km') onUpdate(step.id, 'condition_type', 'time_sec');
                         else onUpdate(step.id, 'condition_type', 'time');
                       }
                     }}
                     className="h-full px-2 items-center justify-center bg-slate-100 border-l border-slate-200"
                   >
                     <Text className="text-[11px] font-bold text-slate-600 uppercase">{unitDisplay}</Text>
                   </TouchableOpacity>
                 </View>

                 {/* Target Dropdown Button */}
                 <TouchableOpacity
                   onPress={() => { Haptics.selectionAsync(); setIsExpanded(!isExpanded); }}
                   className="h-9 px-3 bg-slate-50 border border-slate-200 rounded-lg flex-row items-center gap-1.5"
                 >
                   <Text className="text-xs font-bold text-slate-600">
                     Target: <Text className="text-slate-800">{targetDisplay}</Text>
                   </Text>
                   <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={12} color="#64748B" />
                 </TouchableOpacity>
               </View>

               {/* Expanded Target Picker */}
               {isExpanded && (
                 <View className="mt-2 p-2 bg-slate-50 border border-slate-200 rounded-lg">
                   <View className="flex-row flex-wrap gap-1.5 mb-2">
                     {(isStrengthOrMobility
                       ? [{ key: 'no.target', label: 'Open' }, { key: 'weight', label: 'Weight' }]
                       : [
                           { key: 'no.target', label: 'Open' },
                           { key: 'heart.rate.zone', label: 'HR Z' },
                           { key: 'power.zone', label: 'Pwr Z' },
                           { key: 'power.exact', label: 'Pwr W' },
                           { key: 'pace.exact', label: 'Pace' },
                         ]
                     ).map((t) => (
                       <TouchableOpacity
                         key={t.key}
                         onPress={() => onUpdate(step.id, 'target_type', t.key)}
                         className={`px-2 py-1 rounded-md border ${targetType === t.key ? 'bg-slate-800 border-slate-800' : 'bg-white border-slate-300'}`}
                       >
                         <Text className={`text-[10px] font-bold ${targetType === t.key ? 'text-white' : 'text-slate-600'}`}>{t.label}</Text>
                       </TouchableOpacity>
                     ))}
                   </View>

                   {isZoneTarget && !isStrengthOrMobility && (
                     <View className="flex-row gap-1.5">
                       {Array.from({ length: targetType === 'power.zone' ? 7 : 5 }, (_, i) => i + 1).map((z) => (
                         <TouchableOpacity
                           key={z}
                           onPress={() => onUpdate(step.id, 'zone', z)}
                           className={`w-7 h-7 rounded-md items-center justify-center border ${step.zone === z ? 'bg-orange-500 border-orange-500' : 'bg-white border-slate-300'}`}
                         >
                           <Text className={`text-[10px] font-bold ${step.zone === z ? 'text-white' : 'text-slate-600'}`}>Z{z}</Text>
                         </TouchableOpacity>
                       ))}
                     </View>
                   )}

                   {(isPaceTarget || isExactPowerTarget || (isStrengthOrMobility && targetType === 'weight')) && (
                     <View className="flex-row items-center gap-2">
                       <TextInput
                         value={isStrengthOrMobility ? String(step.weight || '') : stripTargetUnits(step.target_value)}
                         onChangeText={(text) => isStrengthOrMobility ? onUpdate(step.id, 'weight', parseFloat(text)) : onUpdate(step.id, 'target_value', text)}
                         keyboardType={isPaceTarget ? 'numbers-and-punctuation' : 'decimal-pad'}
                         placeholder={isPaceTarget ? getPacePlaceholder(sport) : 'Value'}
                         className="flex-1 bg-white border border-slate-300 rounded-md px-2 py-1 text-xs font-bold text-slate-800"
                       />
                       <Text className="text-xs font-bold text-slate-500">
                         {isStrengthOrMobility ? 'kg' : isExactPowerTarget ? 'W' : getPaceUnitLabel(sport)}
                       </Text>
                     </View>
                   )}
                 </View>
               )}
             </View>
          )}

          {/* Repeat Substeps */}
          {step.type === 'repeat' && step.steps && (
            <View className="mt-3">
              {step.steps.map((subStep) => (
                <StepCardComponent
                  key={subStep.id}
                  step={subStep}
                  isStrength={isStrength}
                  sport={sport}
                  isActive={false}
                  drag={() => {}}
                  isSubStep={true}
                  onUpdate={(id, field, val) => { if (onUpdateSub) onUpdateSub(step.id, id, field, val); }}
                  onRemove={(id) => { if (onRemoveSub) onRemoveSub(step.id, id); }}
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
