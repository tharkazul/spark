import React, { useState } from 'react';
import { useTheme } from '@/hooks/use-theme';
import { View, Text, Modal, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
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

  const handleBuild = () => {
    const val = parseInt(mins, 10);
    if (!isNaN(val) && val > 0) {
      onBuild(val);
    }
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity activeOpacity={1} onPress={onClose} style={{ flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.6)', padding: 24 }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <TouchableOpacity activeOpacity={1} className="bg-theme-card rounded-card p-6">
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
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </TouchableOpacity>
    </Modal>
  );
}
