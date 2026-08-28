import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  Animated,
  KeyboardAvoidingView,
  Platform,
  useColorScheme,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSheetDismiss } from '../../hooks/use-sheet-dismiss';
import { TextInput } from '../ui/TextInput';
import { Button } from '../ui/Button';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useActivities } from '../../context/ActivityStore';

interface LogActivityModalProps {
  visible: boolean;
  onClose: () => void;
  onSaveActivity?: (activity: { title: string; sport: string; durationMin: number; distanceKm?: number }) => void;
}

const SPORTS = [
  { id: 'RUN', label: 'Run', icon: 'footsteps-outline' },
  { id: 'BIKE', label: 'Bike', icon: 'bicycle-outline' },
  { id: 'SWIM', label: 'Swim', icon: 'water-outline' },
  { id: 'WEIGHTS', label: 'Strength', icon: 'barbell-outline' },
  { id: 'WALK', label: 'Walk', icon: 'walk-outline' },
];

export function LogActivityModal({
  visible,
  onClose,
  onSaveActivity,
}: LogActivityModalProps) {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { addManualActivity } = useActivities();

  const [title, setTitle] = useState('');
  const [sport, setSport] = useState('RUN');
  const [duration, setDuration] = useState('30');
  const [distance, setDistance] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const slideAnim = useRef(new Animated.Value(400)).current;
  const { dragY, panHandlers } = useSheetDismiss(onClose);

  useEffect(() => {
    if (visible) {
      slideAnim.setValue(400);
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        friction: 9,
        tension: 80,
      }).start();
    }
  }, [visible, slideAnim]);

  const handleSave = async () => {
    const defaultSportLabel = SPORTS.find(s => s.id === sport)?.label || 'Activity';
    const finalTitle = title.trim() || `Manual ${defaultSportLabel}`;
    
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const durNum = parseInt(duration, 10) || 30;
    const distNum = distance ? parseFloat(distance) : undefined;
    
    setIsSaving(true);
    try {
      await addManualActivity({
        name: finalTitle,
        type: sport,
        sport_type: sport,
        moving_time: durNum * 60,
        moving_time_min: durNum,
        distance: distNum ? distNum * 1000 : 0,
        distance_km: distNum || 0,
      });

      if (onSaveActivity) {
        onSaveActivity({
          title: finalTitle,
          sport,
          durationMin: durNum,
          distanceKm: distNum,
        });
      }
      
      setTitle('');
      setDuration('30');
      setDistance('');
      onClose();
    } catch (err) {
      console.error('Error saving manual activity:', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      {/* Full-screen Dark Backdrop */}
      <TouchableOpacity
        activeOpacity={1}
        onPress={onClose}
        style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ width: '100%' }}
        >
          <TouchableOpacity activeOpacity={1} style={{ width: '100%' }}>
            <Animated.View
              style={{
                transform: [{ translateY: Animated.add(slideAnim, dragY) }],
                paddingBottom: Math.max(insets.bottom, 24),
              }}
              className="bg-theme-card rounded-t-card px-6 pt-3 shadow-2xl flex-col"
            >
              {/* TOP PULL HANDLE INDICATOR */}
              <View {...panHandlers} className="items-center pb-4 pt-1">
                <View className="w-11 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full" />
              </View>

              {/* Header */}
              <View className="flex-row items-center justify-between pb-3.5 mb-2 border-b border-theme-border/50">
                <View className="flex-row items-center gap-2.5">
                  <View className="w-9 h-9 rounded-xl bg-emerald-500/15 items-center justify-center">
                    <Ionicons name="fitness-outline" size={18} color="#10B981" />
                  </View>
                  <View>
                    <Text className="text-lg font-bold text-theme-text">Log Manual Activity</Text>
                    <Text className="text-xs text-theme-muted">Record an un-synced workout session</Text>
                  </View>
                </View>
              </View>

              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {/* Sport Type Selector */}
                <View className="mb-4 mt-2">
                  <Text className="text-xs font-bold text-theme-muted mb-2">
                    Sport Type
                  </Text>
                  <View className="flex-row gap-2">
                    {SPORTS.map((s) => {
                      const isSelected = sport === s.id;
                      return (
                        <TouchableOpacity
                          key={s.id}
                          onPress={() => {
                            Haptics.selectionAsync();
                            setSport(s.id);
                          }}
                          className={`flex-1 py-2.5 rounded-xl items-center justify-center border ${
                            isSelected
                              ? 'bg-emerald-500/15 border-emerald-500'
                              : 'bg-theme-bg border-theme-border/60'
                          }`}
                        >
                          <Ionicons
                            name={s.icon as any}
                            size={18}
                            color={isSelected ? '#10B981' : isDark ? '#94A3B8' : '#64748B'}
                          />
                          <Text
                            className={`text-xs font-bold mt-1 ${
                              isSelected ? 'text-emerald-500' : 'text-theme-muted'
                            }`}
                          >
                            {s.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* Activity Name */}
                <View className="mb-4">
                  <Text className="text-xs font-bold text-theme-muted mb-1.5">
                    Activity Title
                  </Text>
                  <TextInput
                    value={title}
                    onChangeText={setTitle}
                    placeholder="e.g. Morning Trail Run, Gym Workout"
                  />
                </View>

                {/* Duration & Distance Row */}
                <View className="flex-row gap-3 mb-5">
                  <View className="flex-1">
                    <Text className="text-xs font-bold text-theme-muted mb-1.5">
                      Duration (Mins)
                    </Text>
                    <TextInput
                      value={duration}
                      onChangeText={setDuration}
                      keyboardType="numeric"
                      placeholder="30"
                    />
                  </View>
                  <View className="flex-1">
                    <Text className="text-xs font-bold text-theme-muted mb-1.5">
                      Distance (Km)
                    </Text>
                    <TextInput
                      value={distance}
                      onChangeText={setDistance}
                      keyboardType="decimal-pad"
                      placeholder="e.g. 5.2"
                    />
                  </View>
                </View>

                {/* Action Buttons */}
                <View className="flex-row gap-3 pt-2">
                  <View className="flex-1">
                    <Button label="Cancel" variant="outline" onPress={onClose} />
                  </View>
                  <View className="flex-1">
                    <Button label="Save Activity" variant="primary" isLoading={isSaving} onPress={handleSave} />
                  </View>
                </View>
              </ScrollView>
            </Animated.View>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </TouchableOpacity>
    </Modal>
  );
}
