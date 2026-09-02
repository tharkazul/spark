import { SheetGrabber } from '@/components/ui/SheetGrabber';
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Modal, TouchableOpacity, Animated, KeyboardAvoidingView, Platform, ScrollView, Dimensions, StyleSheet } from 'react-native';
import { Button } from '../ui/Button';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSheetDismiss } from '../../hooks/use-sheet-dismiss';

import { useUser } from '../../context/UserStore';
import { useActivities } from '../../context/ActivityStore';
import { usePhysique } from '../../context/PhysiqueStore';
import { calculatePMCMetrics } from '../../utils/pmcUtils';

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

  const [showModal, setShowModal] = useState(visible);
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const { dragY, panHandlers } = useSheetDismiss(onClose);

  useEffect(() => {
    if (visible) {
      setShowModal(true);
      slideAnim.setValue(SCREEN_HEIGHT);
      backdropOpacity.setValue(0);

      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim, {
          toValue: 0,
          damping: 24,
          stiffness: 220,
          mass: 0.8,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 160,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: SCREEN_HEIGHT,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setShowModal(false);
      });
    }
  }, [visible]);

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
        <View style={{ flex: 1, justifyContent: 'flex-end', position: 'relative' }}>
          {/* Static Fullscreen Backdrop: Fades In/Out Simultaneously */}
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

          {/* Bottom Sheet Modal Container */}
          <Animated.View
            style={[
              {
                transform: [{ translateY: Animated.add(slideAnim, dragY) }],
                paddingBottom: Math.max(insets.bottom, 24),
              },
            ]}
            className="w-full bg-theme-card rounded-t-card px-6 pt-3 shadow-2xl flex-col"
          >
            {/* TOP PULL HANDLE INDICATOR */}
            <View {...panHandlers} className="items-center pb-4 pt-1">
              <SheetGrabber />
            </View>

              {/* Top Icon */}
              <View className="w-12 h-12 rounded-full bg-theme-accent/20 items-center justify-center self-center mb-3 shadow-md">
                <Ionicons name="flash" size={24} color="#16ACBD" />
              </View>

              <Text className="text-xl font-extrabold text-theme-text text-center mb-1">
                Adaptive AI Plan
              </Text>

              <Text className="text-xs text-theme-muted text-center mb-5 leading-relaxed">
                Your recent fatigue score is <Text className="font-bold text-theme-accent">{atl} ATL</Text>. Would you like rooka AI to optimize today's schedule for maximum adaptation?
              </Text>

              {/* Adaptation Suggestions */}
              <ScrollView showsVerticalScrollIndicator={false} className="mb-6 max-h-[350px]">
                <View className="gap-y-2.5">
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
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
