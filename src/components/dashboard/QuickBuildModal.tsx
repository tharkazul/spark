import React, { useState } from 'react';
import { useSheetPresentation } from '../../hooks/use-sheet-presentation';
import { useTheme } from '@/hooks/use-theme';
import { View, Text, Modal, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, Animated, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../ui/Button';
import { useLanguage } from '../../context/LanguageContext';

interface QuickBuildModalProps {
  visible: boolean;
  onClose: () => void;
  onBuild: (durationMins: number) => void;
}

export function QuickBuildModal({ visible, onClose, onBuild }: QuickBuildModalProps) {
  const theme = useTheme();
  const { t } = useLanguage();
  const [mins, setMins] = useState('45');
  const { showModal, slideAnim, backdropOpacity, onSheetLayout } = useSheetPresentation(visible, onClose, { offset: 40 });

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
      <View style={{ flex: 1, justifyContent: 'center', position: 'relative', padding: 24 }} onLayout={onSheetLayout}>
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
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
              <Text className="text-xl font-extrabold text-theme-text">{t('quickBuild.title')}</Text>
              <TouchableOpacity onPress={onClose}>
                <Ionicons name="close" size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text className="text-sm text-theme-muted mb-4">
              {t('quickBuild.desc')}
            </Text>

            <View className="bg-theme-bg border border-theme-border rounded-xl px-4 py-3 flex-row items-center mb-6">
              <TextInput
                value={mins}
                onChangeText={setMins}
                keyboardType="number-pad"
                autoFocus
                className="flex-1 text-lg font-bold text-theme-text"
              />
              <Text className="text-sm font-bold text-theme-muted">{t('quickBuild.mins')}</Text>
            </View>

            <Button label={t('quickBuild.autoBuild')} variant="primary" onPress={handleBuild} />
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
