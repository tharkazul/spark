import React, { useState, useEffect, useRef } from 'react';
import { useTheme } from '@/hooks/use-theme';
import { View, Text, Modal, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, Animated, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../ui/Button';

interface QuickBuildModalProps {
  visible: boolean;
  onClose: () => void;
  onBuild: (durationMins: number) => void;
}

export function QuickBuildModal({ visible, onClose, onBuild }: QuickBuildModalProps) {
  const theme = useTheme();
  const [mins, setMins] = useState('45');
  const [showModal, setShowModal] = useState(visible);
  const slideAnim = useRef(new Animated.Value(40)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setShowModal(true);
      slideAnim.setValue(40);
      backdropOpacity.setValue(0);

      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim, {
          toValue: 0,
          damping: 24,
          stiffness: 240,
          mass: 0.8,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 40,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setShowModal(false);
      });
    }
  }, [visible]);

  const handleBuild = () => {
    const val = parseInt(mins, 10);
    if (!isNaN(val) && val > 0) {
      onBuild(val);
    }
    onClose();
  };

  if (!showModal) return null;

  return (
    <Modal visible={showModal} transparent animationType="none" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'center', position: 'relative', padding: 24 }}>
        <Animated.View
          style={[
            StyleSheet.absoluteFillObject,
            { backgroundColor: 'rgba(0,0,0,0.6)', opacity: backdropOpacity },
          ]}
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={onClose}
            style={{ flex: 1 }}
          />
        </Animated.View>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Animated.View
            style={{
              transform: [{ translateY: slideAnim }],
            }}
            className="bg-theme-card rounded-card p-6 shadow-2xl"
          >
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-xl font-extrabold text-theme-text">Quick Build</Text>
              <TouchableOpacity onPress={onClose}>
                <Ionicons name="close" size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text className="text-sm text-theme-muted mb-4">
              Enter target duration (minutes) to auto-generate a structured workout block:
            </Text>

            <View className="bg-theme-bg border border-theme-border rounded-xl px-4 py-3 flex-row items-center mb-6">
              <TextInput
                value={mins}
                onChangeText={setMins}
                keyboardType="number-pad"
                autoFocus
                className="flex-1 text-lg font-bold text-theme-text"
              />
              <Text className="text-sm font-bold text-theme-muted">mins</Text>
            </View>

            <Button label="Auto-Build" variant="primary" onPress={handleBuild} />
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
