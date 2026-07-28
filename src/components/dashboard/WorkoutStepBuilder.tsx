import React from 'react';
import { View, Text, TouchableOpacity, TextInput, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { WorkoutStep } from '../../types/plan';
import { SportType } from '../../types/dashboard';

interface WorkoutStepBuilderProps {
  steps: WorkoutStep[];
  sport: SportType;
  onChangeSteps: (newSteps: WorkoutStep[], computedSpark: number) => void;
}

export function calculateWbSpark(steps: WorkoutStep[], isStrength: boolean): number {
  let totalSpark = 0;

  steps.forEach((step) => {
    if (step.type === 'repeat') {
      let repeatMins = 0;
      let iterations = step.iterations || 1;
      (step.steps || []).forEach((sub) => {
        let val = Number(sub.condition_value) || 0;
        if (isStrength && sub.condition_type === 'reps') {
          repeatMins += 0.5;
        } else {
          let multiplier = 1.2;
          if (sub.target_type && sub.target_type.endsWith('.zone')) {
            let z = Number(sub.zone) || 2;
            if (z >= 4) multiplier = 1.4;
            else if (z === 3) multiplier = 1.3;
            else if (z <= 1) multiplier = 1.0;
          }
          if (sub.condition_type === 'time') repeatMins += val * multiplier;
          else if (sub.condition_type === 'distance') repeatMins += (val / 1000) * 5 * multiplier;
          else repeatMins += val * multiplier;
        }
      });
      totalSpark += repeatMins * iterations;
    } else {
      let val = Number(step.condition_value) || 0;
      if (isStrength && step.condition_type === 'reps') {
        totalSpark += 0.5;
      } else {
        let multiplier = 1.2;
        if (step.target_type && step.target_type.endsWith('.zone')) {
          let z = Number(step.zone) || 2;
          if (z >= 4) multiplier = 1.4;
          else if (z === 3) multiplier = 1.3;
          else if (z <= 1) multiplier = 1.0;
        }
        if (step.condition_type === 'time') totalSpark += val * multiplier;
        else if (step.condition_type === 'distance') totalSpark += (val / 1000) * 5 * multiplier;
        else totalSpark += val * multiplier;
      }
    }
  });

  return Math.ceil(totalSpark);
}

export function WorkoutStepBuilder({ steps, sport, onChangeSteps }: WorkoutStepBuilderProps) {
  const isStrength = sport === 'STRENGTH';

  const updateStepsAndNotify = (newSteps: WorkoutStep[]) => {
    const computedSpark = calculateWbSpark(newSteps, isStrength);
    onChangeSteps(newSteps, computedSpark);
  };

  const handleAddStep = (type: WorkoutStep['type']) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newStep: WorkoutStep = isStrength
      ? { type, condition_type: 'reps', condition_value: 10, target_type: 'no.target', weight: 0, exerciseName: '' }
      : { type, condition_type: 'time', condition_value: 5, target_type: 'no.target' };
    updateStepsAndNotify([...steps, newStep]);
  };

  const handleAddRepeat = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const repeatStep: WorkoutStep = {
      type: 'repeat',
      iterations: 3,
      steps: [
        isStrength
          ? { type: 'interval', condition_type: 'reps', condition_value: 10, target_type: 'no.target', weight: 0, exerciseName: '' }
          : { type: 'interval', condition_type: 'time', condition_value: 5, target_type: 'no.target' },
        { type: 'recovery', condition_type: 'time', condition_value: 2, target_type: 'no.target' },
      ],
    };
    updateStepsAndNotify([...steps, repeatStep]);
  };

  const handleRemoveStep = (idx: number, subIdx: number | null = null) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const copy = [...steps];
    if (subIdx === null) {
      copy.splice(idx, 1);
    } else if (copy[idx].steps) {
      copy[idx].steps!.splice(subIdx, 1);
    }
    updateStepsAndNotify(copy);
  };

  const handleMoveStep = (idx: number, dir: number, subIdx: number | null = null) => {
    const copy = [...steps];
    const targetArr = subIdx === null ? copy : copy[idx].steps;
    const targetIdx = subIdx === null ? idx : subIdx;
    if (!targetArr || targetIdx + dir < 0 || targetIdx + dir >= targetArr.length) return;

    const temp = targetArr[targetIdx];
    targetArr[targetIdx] = targetArr[targetIdx + dir];
    targetArr[targetIdx + dir] = temp;
    updateStepsAndNotify(copy);
  };

  const handleUpdateStep = (idx: number, subIdx: number | null, field: keyof WorkoutStep, val: any) => {
    const copy = JSON.parse(JSON.stringify(steps));
    const step = subIdx === null ? copy[idx] : copy[idx].steps[subIdx];
    step[field] = val;
    updateStepsAndNotify(copy);
  };

  const getStepBg = (type: WorkoutStep['type']) => {
    switch (type) {
      case 'warmup':
        return 'bg-emerald-500/10 border-emerald-500/30';
      case 'interval':
        return 'bg-blue-500/10 border-blue-500/30';
      case 'recovery':
        return 'bg-amber-500/10 border-amber-500/30';
      case 'cooldown':
        return 'bg-purple-500/10 border-purple-500/30';
      case 'repeat':
        return 'bg-theme-accent/10 border-theme-accent/30';
      default:
        return 'bg-theme-bg border-theme-border';
    }
  };

  const renderSingleStep = (s: WorkoutStep, idx: number, subIdx: number | null = null) => {
    const isSub = subIdx !== null;
    const parentIdx = isSub ? idx : null;

    return (
      <View
        key={isSub ? `sub-${idx}-${subIdx}` : `step-${idx}`}
        className={`p-3 rounded-xl border ${getStepBg(s.type)} ${isSub ? 'mt-2 ml-3' : 'my-1.5'}`}
      >
        <View className="flex-row items-center justify-between mb-2">
          {/* Badge & Drag Controls */}
          <View className="flex-row items-center gap-2">
            <View className="flex-row items-center gap-0.5">
              <TouchableOpacity onPress={() => handleMoveStep(isSub ? parentIdx! : idx, -1, isSub ? subIdx : null)}>
                <Ionicons name="chevron-up" size={14} color="#8E9BA4" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleMoveStep(isSub ? parentIdx! : idx, 1, isSub ? subIdx : null)}>
                <Ionicons name="chevron-down" size={14} color="#8E9BA4" />
              </TouchableOpacity>
            </View>

            <Text className="text-[10px] font-extrabold uppercase tracking-wider text-theme-text">
              {s.type}
            </Text>
          </View>

          {/* Remove Step Button */}
          <TouchableOpacity onPress={() => handleRemoveStep(isSub ? parentIdx! : idx, isSub ? subIdx : null)}>
            <Ionicons name="close-circle-outline" size={16} color="#EF4444" />
          </TouchableOpacity>
        </View>

        {/* Inputs Row */}
        <View className="flex-row flex-wrap items-center gap-2">
          {s.type === 'repeat' ? (
            <View className="flex-row items-center gap-1.5">
              <Text className="text-xs font-bold text-theme-text">Repeat Block:</Text>
              <TextInput
                value={String(s.iterations || 3)}
                onChangeText={(text) => handleUpdateStep(idx, null, 'iterations', parseInt(text, 10) || 1)}
                keyboardType="numeric"
                className="w-12 bg-theme-card border border-theme-border rounded-lg px-2 py-1 text-xs text-center font-bold text-theme-text"
              />
              <Text className="text-xs text-theme-muted">times</Text>
            </View>
          ) : (
            <>
              {/* Duration / Distance / Reps Value */}
              <TextInput
                value={String(s.condition_value || 0)}
                onChangeText={(text) => handleUpdateStep(isSub ? parentIdx! : idx, isSub ? subIdx : null, 'condition_value', parseFloat(text) || 0)}
                keyboardType="numeric"
                className="w-14 bg-theme-card border border-theme-border rounded-lg px-2 py-1 text-xs text-center font-bold text-theme-text"
              />

              {/* Unit Selector */}
              <View className="flex-row bg-theme-card border border-theme-border rounded-lg p-0.5">
                {(isStrength ? ['reps', 'time'] : ['time', 'distance']).map((unit) => (
                  <TouchableOpacity
                    key={unit}
                    onPress={() => handleUpdateStep(isSub ? parentIdx! : idx, isSub ? subIdx : null, 'condition_type', unit)}
                    className={`px-2 py-0.5 rounded ${s.condition_type === unit ? 'bg-theme-accent' : ''}`}
                  >
                    <Text className={`text-[10px] font-bold ${s.condition_type === unit ? 'text-white' : 'text-theme-muted'}`}>
                      {unit === 'time' ? 'min' : unit}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Strength Specific: Exercise Name & Weight */}
              {isStrength ? (
                <View className="flex-row items-center gap-2 flex-1 min-w-[120px]">
                  <TextInput
                    value={s.exerciseName || ''}
                    onChangeText={(text) => handleUpdateStep(isSub ? parentIdx! : idx, isSub ? subIdx : null, 'exerciseName', text)}
                    placeholder="Exercise name"
                    className="flex-1 bg-theme-card border border-theme-border rounded-lg px-2.5 py-1 text-xs text-theme-text"
                  />
                  <TextInput
                    value={String(s.weight || '')}
                    onChangeText={(text) => handleUpdateStep(isSub ? parentIdx! : idx, isSub ? subIdx : null, 'weight', parseFloat(text) || 0)}
                    placeholder="kg"
                    keyboardType="numeric"
                    className="w-12 bg-theme-card border border-theme-border rounded-lg px-2 py-1 text-xs text-center font-bold text-theme-text"
                  />
                </View>
              ) : (
                /* Endurance Target Zone Type Selector */
                <View className="flex-row items-center gap-1.5 ml-auto">
                  <Text className="text-xs text-theme-muted font-bold">@</Text>
                  <View className="flex-row bg-theme-card border border-theme-border rounded-lg p-0.5">
                    {[
                      { key: 'no.target', label: 'Open' },
                      { key: 'heart.rate.zone', label: 'HR Z' },
                      { key: 'power.zone', label: 'Pwr Z' },
                    ].map((target) => (
                      <TouchableOpacity
                        key={target.key}
                        onPress={() => handleUpdateStep(isSub ? parentIdx! : idx, isSub ? subIdx : null, 'target_type', target.key)}
                        className={`px-1.5 py-0.5 rounded ${s.target_type === target.key ? 'bg-theme-accent' : ''}`}
                      >
                        <Text className={`text-[9px] font-bold ${s.target_type === target.key ? 'text-white' : 'text-theme-muted'}`}>
                          {target.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
            </>
          )}
        </View>

        {/* Zone Pill Scroller Wheel */}
        {s.type !== 'repeat' && s.target_type && s.target_type.endsWith('.zone') && (
          <View className="mt-2.5 pt-2 border-t border-theme-border/40 flex-row items-center gap-2">
            <Text className="text-[10px] font-bold text-theme-muted uppercase tracking-wider">
              {s.target_type === 'power.zone' ? 'Power Zone:' : 'HR Zone:'}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-1">
              <View className="flex-row items-center gap-1.5 py-0.5">
                {Array.from(
                  { length: s.target_type === 'power.zone' ? 7 : 5 },
                  (_, zIdx) => zIdx + 1
                ).map((zoneNum) => {
                  const isSelected = (s.zone || 2) === zoneNum;
                  return (
                    <TouchableOpacity
                      key={zoneNum}
                      onPress={() => {
                        Haptics.selectionAsync();
                        handleUpdateStep(isSub ? parentIdx! : idx, isSub ? subIdx : null, 'zone', zoneNum);
                      }}
                      activeOpacity={0.7}
                      className={`px-3 py-1 rounded-xl border shadow-sm ${
                        isSelected
                          ? 'bg-theme-accent border-theme-accent'
                          : 'bg-theme-card border-theme-border'
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

        {/* Nested steps if Repeat block */}
        {s.type === 'repeat' && s.steps && (
          <View className="mt-2">
            {s.steps.map((subStep, subIndex) => renderSingleStep(subStep, idx, subIndex))}
          </View>
        )}
      </View>
    );
  };

  return (
    <View className="mb-5">
      {/* Top Header & Add Block Buttons */}
      <Text className="text-xs uppercase tracking-wider font-extrabold text-theme-muted mb-2">
        Structured Interval Blocks
      </Text>

      <View className="flex-row flex-wrap gap-1.5 mb-3">
        <TouchableOpacity
          onPress={() => handleAddStep('warmup')}
          className="px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/30 rounded-lg flex-row items-center gap-1"
        >
          <Ionicons name="add" size={12} color="#10B981" />
          <Text className="text-[11px] font-bold text-emerald-500">+ Warmup</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => handleAddStep('interval')}
          className="px-2.5 py-1 bg-blue-500/10 border border-blue-500/30 rounded-lg flex-row items-center gap-1"
        >
          <Ionicons name="add" size={12} color="#208AEF" />
          <Text className="text-[11px] font-bold text-blue-500">+ Interval</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => handleAddStep('recovery')}
          className="px-2.5 py-1 bg-amber-500/10 border border-amber-500/30 rounded-lg flex-row items-center gap-1"
        >
          <Ionicons name="add" size={12} color="#F97316" />
          <Text className="text-[11px] font-bold text-amber-500">+ Recovery</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => handleAddStep('cooldown')}
          className="px-2.5 py-1 bg-purple-500/10 border border-purple-500/30 rounded-lg flex-row items-center gap-1"
        >
          <Ionicons name="add" size={12} color="#A855F7" />
          <Text className="text-[11px] font-bold text-purple-500">+ Cooldown</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleAddRepeat}
          className="px-2.5 py-1 bg-theme-accent/15 border border-theme-accent/40 rounded-lg flex-row items-center gap-1"
        >
          <Ionicons name="repeat" size={12} color="#16ACBD" />
          <Text className="text-[11px] font-bold text-theme-accent">+ Repeat Block</Text>
        </TouchableOpacity>
      </View>

      {/* Render Steps Container */}
      {steps.length === 0 ? (
        <View className="py-4 items-center justify-center border border-dashed border-theme-border rounded-xl bg-theme-bg/40">
          <Text className="text-xs text-theme-muted/70 italic">
            No structured interval steps. Tap above to add blocks.
          </Text>
        </View>
      ) : (
        steps.map((step, index) => renderSingleStep(step, index))
      )}
    </View>
  );
}
