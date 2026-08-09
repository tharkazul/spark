import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Modal, TouchableOpacity, Animated } from 'react-native';
import { Button } from '../ui/Button';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

interface LogWeightModalProps {
  visible: boolean;
  previousWeight?: number; // e.g. 74.5
  onClose: () => void;
  onSaveWeight: (weight: number) => void;
}

export function LogWeightModal({
  visible,
  previousWeight = 74.5,
  onClose,
  onSaveWeight,
}: LogWeightModalProps) {
  const [weight, setWeight] = useState<number>(previousWeight);
  const slideAnim = useRef(new Animated.Value(400)).current;

  useEffect(() => {
    if (visible) {
      slideAnim.setValue(400);
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        friction: 9,
        tension: 70,
      }).start();
    }
  }, [visible, slideAnim]);

  const adjustWeight = (amount: number) => {
    Haptics.selectionAsync();
    setWeight((prev) => parseFloat((Math.max(30, prev + amount)).toFixed(1)));
  };

  const handleSave = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onSaveWeight(weight);
    onClose();
  };

  const diff = parseFloat((weight - previousWeight).toFixed(1));

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
        className="flex-1 justify-end bg-black/60"
      >
        <TouchableOpacity activeOpacity={1} style={{ width: '100%' }}>
          <Animated.View
            style={{ transform: [{ translateY: slideAnim }] }}
            className="bg-theme-card rounded-t-[32px] p-6 shadow-2xl"
          >
            {/* Header */}
            <View className="flex-row items-center justify-between pb-4 mb-5">
              <View className="flex-row items-center gap-2.5">
                <View className="w-9 h-9 rounded-xl bg-theme-accent/15 items-center justify-center">
                  <Ionicons name="scale-outline" size={18} color="#16ACBD" />
                </View>
                <View>
                  <Text className="text-lg font-bold text-theme-text">Quick Weight Log</Text>
                  <Text className="text-xs text-theme-muted">Track body mass for AI recovery load</Text>
                </View>
              </View>

              <TouchableOpacity
                onPress={onClose}
                className="w-8 h-8 rounded-full bg-theme-bg items-center justify-center"
              >
                <Ionicons name="close" size={18} color="#8E9BA4" />
              </TouchableOpacity>
            </View>

            {/* Roller / Stepper Unit Display */}
            <View className="items-center py-6 bg-theme-bg/60 rounded-2xl mb-5">
              <Text className="text-5xl font-extrabold text-theme-text font-mono tracking-tight mb-2">
                {weight.toFixed(1)} <Text className="text-xl text-theme-muted font-normal">kg</Text>
              </Text>

              {diff !== 0 ? (
                <View className={`px-3 py-1 rounded-full ${diff > 0 ? 'bg-amber-500/15' : 'bg-emerald-500/15'}`}>
                  <Text className={`text-xs font-mono font-bold ${diff > 0 ? 'text-amber-500' : 'text-emerald-500'}`}>
                    {diff > 0 ? `+${diff} kg vs last log` : `${diff} kg vs last log`}
                  </Text>
                </View>
              ) : (
                <Text className="text-xs text-theme-muted font-medium">Unchanged from last log ({previousWeight} kg)</Text>
              )}

              {/* Stepper Buttons Row */}
              <View className="flex-row items-center gap-3 mt-6">
                <TouchableOpacity
                  onPress={() => adjustWeight(-1.0)}
                  className="px-3.5 py-2 rounded-xl bg-theme-card"
                >
                  <Text className="text-xs font-mono font-bold text-theme-text">-1.0 kg</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => adjustWeight(-0.1)}
                  className="w-12 h-12 rounded-xl bg-theme-accent-soft items-center justify-center"
                >
                  <Ionicons name="remove" size={22} color="#16ACBD" />
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => adjustWeight(0.1)}
                  className="w-12 h-12 rounded-xl bg-theme-accent-soft items-center justify-center"
                >
                  <Ionicons name="add" size={22} color="#16ACBD" />
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => adjustWeight(1.0)}
                  className="px-3.5 py-2 rounded-xl bg-theme-card"
                >
                  <Text className="text-xs font-mono font-bold text-theme-text">+1.0 kg</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Pinned Buttons */}
            <View className="flex-row gap-3 pt-3">
              <View className="flex-1">
                <Button label="Cancel" variant="outline" onPress={onClose} />
              </View>
              <View className="flex-1">
                <Button label="Log Weight" variant="primary" onPress={handleSave} />
              </View>
            </View>
          </Animated.View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}
