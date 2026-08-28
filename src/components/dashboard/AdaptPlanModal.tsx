import React, { useEffect, useRef } from 'react';
import { View, Text, Modal, TouchableOpacity, Animated, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Button } from '../ui/Button';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSheetDismiss } from '../../hooks/use-sheet-dismiss';

import { useUser } from '../../context/UserStore';
import { useActivities } from '../../context/ActivityStore';
import { usePhysique } from '../../context/PhysiqueStore';
import { calculatePMCMetrics } from '../../utils/pmcUtils';

interface AdaptPlanModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirmAdapt: (adaptationType: string) => void;
}

export function AdaptPlanModal({
  visible,
  onClose,
  onConfirmAdapt,
}: AdaptPlanModalProps) {
  const insets = useSafeAreaInsets();
  const { user } = useUser();
  const { activities } = useActivities();
  const { physiqueLogs } = usePhysique();

  const pmcMetrics = calculatePMCMetrics(
    activities,
    user?.athlete_metrics?.weight_kg || 0,
    physiqueLogs
  );
  
  const atl = pmcMetrics.atl.toFixed(1);

  const slideAnim = useRef(new Animated.Value(600)).current;
  const { dragY, panHandlers } = useSheetDismiss(onClose);

  useEffect(() => {
    if (visible) {
      slideAnim.setValue(600);
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        friction: 9,
        tension: 80,
      }).start();
    }
  }, [visible, slideAnim]);

  const handleOption = (type: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onConfirmAdapt(type);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
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
              {...panHandlers}
            >
              {/* TOP PULL HANDLE INDICATOR */}
              <View className="items-center pb-4">
                <View className="w-11 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full" />
              </View>

              {/* Top Icon */}
              <View className="w-12 h-12 rounded-full bg-theme-accent/15 items-center justify-center self-center mb-3 shadow-md">
                <Ionicons name="flash" size={24} color="#16ACBD" />
              </View>

              <Text className="text-xl font-extrabold text-theme-text text-center mb-1">
                Adaptive AI Plan
              </Text>

              <Text className="text-xs text-theme-muted text-center mb-5 leading-relaxed">
                Your recent fatigue score is <Text className="font-bold text-theme-accent">{atl} ATL</Text>. Would you like Rooka AI to optimize today's schedule for maximum adaptation?
              </Text>

              {/* Adaptation Suggestions */}
              <ScrollView showsVerticalScrollIndicator={false} className="mb-6 max-h-[350px]">
                <View className="space-y-2.5">
                  <TouchableOpacity
                    onPress={() => handleOption('TIME_CRUNCH')}
                    className="p-3.5 bg-theme-bg rounded-xl flex-row items-center gap-3 border border-theme-border/40"
                  >
                    <Ionicons name="time-outline" size={20} color="#16ACBD" />
                    <View className="flex-1">
                      <Text className="text-xs font-bold text-theme-text">Time Crunch</Text>
                      <Text className="text-xs text-theme-muted">Shorten session without losing peak stimulus</Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => handleOption('MOVE_INDOORS')}
                    className="p-3.5 bg-theme-bg rounded-xl flex-row items-center gap-3 border border-theme-border/40"
                  >
                    <Ionicons name="home-outline" size={20} color="#10B981" />
                    <View className="flex-1">
                      <Text className="text-xs font-bold text-theme-text">Move indoors</Text>
                      <Text className="text-xs text-theme-muted">Adapt for trainer/treadmill environments</Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => handleOption('MOVE_ALL_ONE_DAY')}
                    className="p-3.5 bg-theme-bg rounded-xl flex-row items-center gap-3 border border-theme-border/40"
                  >
                    <Ionicons name="calendar-outline" size={20} color="#F59E0B" />
                    <View className="flex-1">
                      <Text className="text-xs font-bold text-theme-text">Move all one day</Text>
                      <Text className="text-xs text-theme-muted">Push entire schedule ahead by 24 hours</Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => handleOption('CANCEL_COMPLETELY')}
                    className="p-3.5 bg-theme-bg rounded-xl flex-row items-center gap-3 border border-theme-border/40"
                  >
                    <Ionicons name="close-circle-outline" size={20} color="#EF4444" />
                    <View className="flex-1">
                      <Text className="text-xs font-bold text-theme-text">Cancel completely</Text>
                      <Text className="text-xs text-theme-muted">Rest up and skip today's workout entirely</Text>
                    </View>
                  </TouchableOpacity>
                </View>
              </ScrollView>

              {/* Buttons */}
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Button label="Keep Current" variant="outline" onPress={onClose} />
                </View>
              </View>
            </Animated.View>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </TouchableOpacity>
    </Modal>
  );
}
