import React, { useEffect, useRef } from 'react';
import { View, Text, Modal, TouchableOpacity, Animated } from 'react-native';
import { Button } from '../ui/Button';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

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
  const scaleAnim = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    if (visible) {
      scaleAnim.setValue(0.9);
      Animated.spring(scaleAnim, {
        toValue: 1,
        useNativeDriver: true,
        friction: 8,
        tension: 80,
      }).start();
    }
  }, [visible, scaleAnim]);

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
        className="flex-1 justify-center items-center bg-black/70 px-4"
      >
        <TouchableOpacity activeOpacity={1} style={{ width: '100%', maxWidth: 360 }}>
          <Animated.View
            style={{ transform: [{ scale: scaleAnim }] }}
            className="bg-theme-card border border-theme-accent/40 rounded-[28px] p-6 w-full shadow-2xl"
          >
            {/* Top Icon */}
            <View className="w-12 h-12 rounded-full bg-theme-accent/15 items-center justify-center self-center mb-3 shadow-md">
              <Ionicons name="flash" size={24} color="#16ACBD" />
            </View>

            <Text className="text-xl font-extrabold text-theme-text text-center mb-1">
              Adaptive AI Plan
            </Text>

            <Text className="text-xs text-theme-muted text-center mb-5 leading-relaxed">
              Your recent fatigue score is <Text className="font-bold text-theme-accent">88 ATL</Text>. Would you like Rooka AI to optimize today's schedule for maximum adaptation?
            </Text>

            {/* Adaptation Suggestions */}
            <View className="space-y-2.5 mb-6">
              <TouchableOpacity
                onPress={() => handleOption('TIME_CRUNCH')}
                className="p-3.5 bg-theme-bg rounded-xl flex-row items-center gap-3"
              >
                <Ionicons name="time-outline" size={20} color="#16ACBD" />
                <View className="flex-1">
                  <Text className="text-xs font-bold text-theme-text">30-Min Time Crunch</Text>
                  <Text className="text-[10px] text-theme-muted">Shorten session without losing peak stimulus</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => handleOption('LOWER_INTENSITY')}
                className="p-3.5 bg-theme-bg rounded-xl flex-row items-center gap-3"
              >
                <Ionicons name="heart-outline" size={20} color="#10B981" />
                <View className="flex-1">
                  <Text className="text-xs font-bold text-theme-text">Zone 2 Aerobic Recovery</Text>
                  <Text className="text-[10px] text-theme-muted">Reduce target watts to promote muscle healing</Text>
                </View>
              </TouchableOpacity>
            </View>

            {/* Buttons */}
            <View className="flex-row gap-3">
              <View className="flex-1">
                <Button label="Keep Current" variant="outline" onPress={onClose} />
              </View>
              <View className="flex-1">
                <Button label="Apply Adapt" variant="primary" onPress={() => handleOption('AUTO_ADAPT')} />
              </View>
            </View>
          </Animated.View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}
