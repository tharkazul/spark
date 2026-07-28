import React, { useState, useEffect } from 'react';
import { View, Text, Modal, TouchableOpacity, ScrollView } from 'react-native';
import { TextInput } from '../ui/TextInput';
import { Button } from '../ui/Button';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { SportType, WorkoutItem } from '../../types/dashboard';
import { WorkoutStep } from '../../types/plan';
import { WorkoutStepBuilder } from './WorkoutStepBuilder';

interface AddWorkoutModalProps {
  visible: boolean;
  targetDayName?: string;
  targetDateStr?: string;
  initialWorkout?: WorkoutItem | null;
  onClose: () => void;
  onSave: (workout: Omit<WorkoutItem, 'id'> & { steps_json?: string }, existingId?: string) => void;
  onDelete?: (workoutId: string) => void;
}

export function AddWorkoutModal({
  visible,
  targetDayName = 'FRI',
  targetDateStr = 'Jul 24',
  initialWorkout = null,
  onClose,
  onSave,
  onDelete,
}: AddWorkoutModalProps) {
  const [selectedSport, setSelectedSport] = useState<SportType>('RUN');
  const [title, setTitle] = useState('');
  const [duration, setDuration] = useState('45 mins');
  const [sparkPoints, setSparkPoints] = useState('30');
  const [steps, setSteps] = useState<WorkoutStep[]>([]);

  useEffect(() => {
    if (initialWorkout) {
      setSelectedSport(initialWorkout.type);
      setTitle(initialWorkout.title);
      setDuration(initialWorkout.duration || '45 mins');
      setSparkPoints(initialWorkout.sparkPoints.toString());
      setSteps([]);
    } else {
      setSelectedSport('RUN');
      setTitle('');
      setDuration('45 mins');
      setSparkPoints('30');
      setSteps([]);
    }
  }, [initialWorkout, visible]);

  const sports: { type: SportType; label: string; icon: string }[] = [
    { type: 'RUN', label: 'Run', icon: 'walk-outline' },
    { type: 'BIKE', label: 'Bike', icon: 'bicycle-outline' },
    { type: 'SWIM', label: 'Swim', icon: 'water-outline' },
    { type: 'STRENGTH', label: 'Strength', icon: 'barbell-outline' },
    { type: 'MOBILITY', label: 'Mobility', icon: 'body-outline' },
  ];

  const handleStepChange = (newSteps: WorkoutStep[], computedSpark: number) => {
    setSteps(newSteps);
    if (computedSpark > 0) {
      setSparkPoints(computedSpark.toString());
    }
  };

  const handleSave = () => {
    if (!title.trim()) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onSave(
      {
        day: initialWorkout ? initialWorkout.day : targetDayName,
        dateStr: initialWorkout ? initialWorkout.dateStr : targetDateStr,
        type: selectedSport,
        title: title.trim(),
        duration: duration || '30 mins',
        sparkPoints: parseInt(sparkPoints, 10) || 25,
        isStructured: true,
        isCompleted: initialWorkout ? initialWorkout.isCompleted : false,
        actualMetrics: initialWorkout?.actualMetrics,
        executionScore: initialWorkout?.executionScore,
        steps_json: JSON.stringify(steps),
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

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-end bg-black/60">
        <View className="bg-theme-card border-t border-theme-border rounded-t-[32px] p-6 max-h-[88%] shadow-2xl">
          {/* Header */}
          <View className="flex-row items-center justify-between pb-4 border-b border-theme-border/60 mb-4">
            <View>
              <Text className="text-lg font-bold text-theme-text">
                {initialWorkout ? 'Edit Exercise' : 'Add Exercise'}
              </Text>
              <Text className="text-xs text-theme-muted">
                {initialWorkout ? initialWorkout.title : `Scheduling for ${targetDayName} ${targetDateStr}`}
              </Text>
            </View>

            <TouchableOpacity
              onPress={onClose}
              className="w-8 h-8 rounded-full bg-theme-bg items-center justify-center border border-theme-border"
            >
              <Ionicons name="close" size={18} color="#8E9BA4" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Sport Selector */}
            <Text className="text-xs uppercase tracking-wider font-bold text-theme-muted mb-2">
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
                    }}
                    activeOpacity={0.7}
                    className={`flex-row items-center gap-1.5 px-3.5 py-2 rounded-xl border ${
                      isSelected
                        ? 'bg-theme-accent/15 border-theme-accent'
                        : 'bg-theme-bg border-theme-border'
                    }`}
                  >
                    <Ionicons name={sport.icon as any} size={16} color={isSelected ? '#16ACBD' : '#8E9BA4'} />
                    <Text className={`text-xs font-bold ${isSelected ? 'text-theme-accent' : 'text-theme-muted'}`}>
                      {sport.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Exercise Title Input */}
            <View className="mb-4">
              <Text className="text-xs uppercase tracking-wider font-bold text-theme-muted mb-1.5">
                Workout Title
              </Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="e.g. Interval Threshold Run"
              />
            </View>

            {/* Duration & Points */}
            <View className="flex-row gap-3 mb-5">
              <View className="flex-1">
                <Text className="text-xs uppercase tracking-wider font-bold text-theme-muted mb-1.5">
                  Duration
                </Text>
                <TextInput
                  value={duration}
                  onChangeText={setDuration}
                  placeholder="45 mins"
                />
              </View>

              <View className="flex-1">
                <Text className="text-xs uppercase tracking-wider font-bold text-theme-muted mb-1.5">
                  Spark Points Target
                </Text>
                <TextInput
                  value={sparkPoints}
                  onChangeText={setSparkPoints}
                  keyboardType="numeric"
                  placeholder="30"
                />
              </View>
            </View>

            {/* Interactive Structured Step Builder */}
            <WorkoutStepBuilder
              steps={steps}
              sport={selectedSport}
              onChangeSteps={handleStepChange}
            />

            {/* Save / Cancel Buttons */}
            <View className="flex-row gap-3 mb-3 mt-2">
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
                className="py-3 items-center justify-center border border-rose-500/30 bg-rose-500/10 rounded-xl mt-1 mb-4"
              >
                <Text className="text-xs font-bold text-rose-500">Delete Exercise</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
