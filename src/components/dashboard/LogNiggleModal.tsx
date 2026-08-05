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
} from 'react-native';
import { TextInput } from '../ui/TextInput';
import { Button } from '../ui/Button';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

interface LogNiggleModalProps {
  visible: boolean;
  onClose: () => void;
  onSendToCoach: (description: string, severity: number) => void;
}

export function LogNiggleModal({
  visible,
  onClose,
  onSendToCoach,
}: LogNiggleModalProps) {
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<number>(3); // 1-10

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

  const handleSend = () => {
    if (!description.trim()) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onSendToCoach(description.trim(), severity);
    setDescription('');
    onClose();
  };

  const getSeverityBadge = (level: number) => {
    if (level <= 3) return { label: 'Mild / Stiffness', color: 'text-emerald-500', bg: 'bg-emerald-500/15' };
    if (level <= 6) return { label: 'Moderate Discomfort', color: 'text-amber-500', bg: 'bg-amber-500/15' };
    return { label: 'Severe Pain / Injury', color: 'text-rose-500', bg: 'bg-rose-500/15' };
  };

  const badge = getSeverityBadge(severity);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
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
              className="bg-theme-card border-t border-theme-border rounded-t-[32px] p-6 shadow-2xl flex-col max-h-[92%]"
            >
              {/* Pinned Header */}
              <View className="flex-row items-center justify-between pb-3.5 border-b border-theme-border/60 mb-4">
                <View className="flex-row items-center gap-2.5">
                  <View className="w-9 h-9 rounded-xl bg-rose-500/15 border border-rose-500/30 items-center justify-center">
                    <Ionicons name="bandage-outline" size={18} color="#F43F5E" />
                  </View>
                  <View>
                    <Text className="text-lg font-bold text-theme-text">Report Injury</Text>
                    <Text className="text-xs text-theme-muted">Alert Spark AI Coach to adapt your plan</Text>
                  </View>
                </View>

                <TouchableOpacity
                  onPress={onClose}
                  className="w-8 h-8 rounded-full bg-theme-bg items-center justify-center border border-theme-border"
                >
                  <Ionicons name="close" size={18} color="#8E9BA4" />
                </TouchableOpacity>
              </View>

              {/* Scrollable Content */}
              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                className="flex-shrink"
              >
                {/* Description Text Input */}
                <View className="mb-4">
                  <Text className="text-xs uppercase tracking-wider font-bold text-theme-muted mb-2">
                    What hurts or feels tight?
                  </Text>
                  <TextInput
                    value={description}
                    onChangeText={setDescription}
                    placeholder="e.g. Left Achilles tightness during interval run..."
                    multiline
                    numberOfLines={3}
                    style={{ height: 75, textAlignVertical: 'top' }}
                  />
                </View>

                {/* 1-10 Severity Rating Row */}
                <View className="mb-4">
                  <View className="flex-row justify-between items-center mb-2.5">
                    <Text className="text-xs uppercase tracking-wider font-bold text-theme-muted">
                      Severity Rating ({severity}/10)
                    </Text>
                    <View className={`px-2.5 py-0.5 rounded-full ${badge.bg}`}>
                      <Text className={`text-[10px] font-extrabold ${badge.color}`}>{badge.label}</Text>
                    </View>
                  </View>

                  {/* 1-10 Rating Buttons Row */}
                  <View className="flex-row justify-between gap-1">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => {
                      const isSelected = severity === num;
                      return (
                        <TouchableOpacity
                          key={num}
                          onPress={() => {
                            Haptics.selectionAsync();
                            setSeverity(num);
                          }}
                          className={`flex-1 py-2.5 rounded-xl items-center justify-center border ${
                            isSelected
                              ? num <= 3
                                ? 'bg-emerald-500 border-emerald-500'
                                : num <= 6
                                ? 'bg-amber-500 border-amber-500'
                                : 'bg-rose-500 border-rose-500'
                              : 'bg-theme-bg border-theme-border'
                          }`}
                        >
                          <Text
                            className={`text-xs font-mono font-extrabold ${
                              isSelected ? 'text-white' : 'text-theme-text'
                            }`}
                          >
                            {num}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              </ScrollView>

              {/* Pinned Action Buttons */}
              <View className="flex-row gap-3 pt-3 border-t border-theme-border/40 mt-2">
                <View className="flex-1">
                  <Button label="Cancel" variant="outline" onPress={onClose} />
                </View>
                <View className="flex-1">
                  <Button
                    label="Send to AI Coach"
                    variant="primary"
                    onPress={handleSend}
                    disabled={!description.trim()}
                  />
                </View>
              </View>
            </Animated.View>
          </TouchableOpacity>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </Modal>
  );
}
