import { SheetSurface, SHEET_BACKDROP } from '@/components/ui/SheetSurface';
import { SheetGrabber } from '@/components/ui/SheetGrabber';
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Modal, TouchableOpacity, Animated, KeyboardAvoidingView, Platform, ScrollView, Dimensions, StyleSheet } from 'react-native';
import { Button } from '../ui/Button';
import { ScalePressable } from '../ui/ScalePressable';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSheetPresentation } from '../../hooks/use-sheet-presentation';

import { useUser } from '../../context/UserStore';
import { useActivities } from '../../context/ActivityStore';
import { usePhysique } from '../../context/PhysiqueStore';
import { calculatePMCMetrics } from '../../utils/pmcUtils';
import { useLanguage } from '../../context/LanguageContext';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

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
  const { t } = useLanguage();
  const { user } = useUser();
  const { activities } = useActivities();
  const { physiqueLogs } = usePhysique();

  const pmcMetrics = calculatePMCMetrics(
    activities,
    user?.athlete_metrics?.weight_kg || 0,
    physiqueLogs
  );
  
  const atl = pmcMetrics.atl.toFixed(1);

  const { showModal, slideAnim, backdropOpacity, panHandlers, onSheetLayout } = useSheetPresentation(visible, onClose);


  const handleOption = (type: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onConfirmAdapt(type);
    onClose();
  };

  if (!showModal) return null;

  return (
    <Modal
      visible={showModal}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <View style={{ flex: 1, justifyContent: 'flex-end', position: 'relative' }} onLayout={onSheetLayout}>
          {/* Static Fullscreen Backdrop: Fades In/Out Simultaneously */}
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: SHEET_BACKDROP, opacity: backdropOpacity },
            ]}
          >
            <TouchableOpacity
              activeOpacity={1}
              onPress={onClose}
              style={{ flex: 1 }}
            />
          </Animated.View>

          {/* Bottom Sheet Modal Container */}
          <SheetSurface
            style={{ transform: [{ translateY: slideAnim }] }}
            padBottom={24}
            className="px-6 pt-3 flex-col"
          >
            {/* Draggable Header Region */}
            <View {...panHandlers} className="self-stretch">
              <View className="items-center justify-center py-3 -mt-3 self-stretch">
                <SheetGrabber />
              </View>

              {/* Top Icon */}
              <View className="w-12 h-12 rounded-full bg-theme-accent/20 items-center justify-center self-center mb-3 shadow-md">
                <Ionicons name="flash" size={24} color="#16ACBD" />
              </View>

              <Text className="text-xl font-extrabold text-theme-text text-center mb-1">
                {t('dashboard.adaptModalTitle', 'Adaptive AI Plan')}
              </Text>

              <Text className="text-xs text-theme-muted text-center mb-5 leading-relaxed">
                {t('dashboard.adaptModalSubtitle', { atl: `${atl}` })}
              </Text>
            </View>

              {/* Adaptation Suggestions */}
              <ScrollView showsVerticalScrollIndicator={false} className="mb-6 max-h-[350px]">
                <View className="gap-y-2.5">
                  <ScalePressable
                    onPress={() => handleOption('TIME_CRUNCH')}
                    activeScale={0.97}
                    haptic="selection"
                    className="p-3.5 bg-theme-bg rounded-xl flex-row items-center gap-3 border border-theme-border/40"
                  >
                    <Ionicons name="time-outline" size={20} color="#16ACBD" />
                    <View className="flex-1">
                      <Text className="text-xs font-bold text-theme-text">{t('dashboard.adaptTimeCrunch', 'Time Crunch')}</Text>
                      <Text className="text-xs text-theme-muted">{t('dashboard.adaptTimeCrunchDesc', 'Shorten session without losing peak stimulus')}</Text>
                    </View>
                  </ScalePressable>

                  <ScalePressable
                    onPress={() => handleOption('MOVE_INDOORS')}
                    activeScale={0.97}
                    haptic="selection"
                    className="p-3.5 bg-theme-bg rounded-xl flex-row items-center gap-3 border border-theme-border/40"
                  >
                    <Ionicons name="home-outline" size={20} color="#10B981" />
                    <View className="flex-1">
                      <Text className="text-xs font-bold text-theme-text">{t('dashboard.adaptMoveIndoors', 'Move indoors')}</Text>
                      <Text className="text-xs text-theme-muted">{t('dashboard.adaptMoveIndoorsDesc', 'Adapt for trainer/treadmill environments')}</Text>
                    </View>
                  </ScalePressable>

                  <ScalePressable
                    onPress={() => handleOption('MOVE_ALL_ONE_DAY')}
                    activeScale={0.97}
                    haptic="selection"
                    className="p-3.5 bg-theme-bg rounded-xl flex-row items-center gap-3 border border-theme-border/40"
                  >
                    <Ionicons name="calendar-outline" size={20} color="#F59E0B" />
                    <View className="flex-1">
                      <Text className="text-xs font-bold text-theme-text">{t('dashboard.adaptMoveDay', 'Move all one day')}</Text>
                      <Text className="text-xs text-theme-muted">{t('dashboard.adaptMoveDayDesc', 'Push entire schedule ahead by 24 hours')}</Text>
                    </View>
                  </ScalePressable>

                  <ScalePressable
                    onPress={() => handleOption('CANCEL_COMPLETELY')}
                    activeScale={0.97}
                    haptic="warning"
                    className="p-3.5 bg-theme-bg rounded-xl flex-row items-center gap-3 border border-theme-border/40"
                  >
                    <Ionicons name="close-circle-outline" size={20} color="#EF4444" />
                    <View className="flex-1">
                      <Text className="text-xs font-bold text-theme-text">{t('dashboard.adaptCancel', 'Cancel completely')}</Text>
                      <Text className="text-xs text-theme-muted">{t('dashboard.adaptCancelDesc', "Rest up and skip today's workout entirely")}</Text>
                    </View>
                  </ScalePressable>
                </View>
              </ScrollView>

              {/* Buttons */}
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Button label={t('dashboard.keepCurrent', 'Keep Current')} variant="neutral" onPress={onClose} />
                </View>
              </View>
          </SheetSurface>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
