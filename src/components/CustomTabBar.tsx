import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, useColorScheme, TouchableWithoutFeedback, Pressable, StyleSheet, DeviceEventEmitter, Modal } from 'react-native';
import { MaterialTopTabBarProps } from '@react-navigation/material-top-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useTabBar } from '../context/TabBarContext';
import { useCoachChat } from '../context/CoachChatStore';
import { usePhysique } from '../context/PhysiqueStore';
import { usePlan } from '../context/PlanStore';
import { useKeyboardMotionContext } from '../context/KeyboardMotionContext';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming, useAnimatedReaction, runOnJS } from 'react-native-reanimated';

import { LogWeightModal } from './dashboard/LogWeightModal';
import { AddWorkoutModal } from './dashboard/AddWorkoutModal';
import { LogActivityModal } from './dashboard/LogActivityModal';
import { LogNiggleModal } from './dashboard/LogNiggleModal';

const TAB_ORDER = ['index', 'physique', 'coach', 'social', 'profile'];
const TAB_BAR_HEIGHT = 62;

export function CustomTabBar({ state, descriptors, navigation }: MaterialTopTabBarProps) {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { registerScrollListener, setTabBarOccupied } = useTabBar();
  const { unreadCount, sendMessage } = useCoachChat();
  const { logPhysique } = usePhysique();
  const { addWorkout } = usePlan();
  const { progress } = useKeyboardMotionContext();
  
  const [barInteractive, setBarInteractive] = useState(true);
  const [isQuickMenuOpen, setIsQuickMenuOpen] = useState(false);
  const [activeModal, setActiveModal] = useState<'none' | 'weight' | 'workout' | 'activity' | 'injury'>('none');

  // Quick Actions animated shared values
  const menuScale = useSharedValue(0);
  const menuOpacity = useSharedValue(0);
  const menuTranslateY = useSharedValue(20);

  const openQuickMenu = () => {
    setIsQuickMenuOpen(true);
    menuScale.value = withSpring(1, { damping: 22, stiffness: 320, mass: 0.7 });
    menuOpacity.value = withTiming(1, { duration: 150 });
    menuTranslateY.value = withSpring(0, { damping: 22, stiffness: 320, mass: 0.7 });
  };

  const closeQuickMenu = () => {
    menuScale.value = withSpring(0.7, { damping: 20, stiffness: 300 });
    menuOpacity.value = withTiming(0, { duration: 120 });
    menuTranslateY.value = withSpring(15, { damping: 20, stiffness: 300 });
    setTimeout(() => {
      setIsQuickMenuOpen(false);
    }, 120);
  };

  const handleQuickAction = (actionType: 'weight' | 'workout' | 'activity' | 'injury') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsQuickMenuOpen(false);
    setTimeout(() => {
      setActiveModal(actionType);
    }, 50);
  };

  useAnimatedReaction(
    () => progress.value < 0.5,
    (v, p) => {
      if (v !== p) {
        runOnJS(setBarInteractive)(v);
      }
    }
  );

  const scaleAnim = useSharedValue(1);
  const opacityAnim = useSharedValue(1);

  const expandBar = () => {
    scaleAnim.value = withSpring(1, { damping: 15, stiffness: 200 });
    opacityAnim.value = withTiming(1, { duration: 180 });
  };

  const shrinkBar = () => {
    scaleAnim.value = withSpring(0.9, { damping: 15, stiffness: 200 });
    opacityAnim.value = withTiming(0.88, { duration: 220 });
    if (isQuickMenuOpen) {
      closeQuickMenu();
    }
  };

  useEffect(() => {
    const unsubscribe = registerScrollListener(() => {
      shrinkBar();
    });
    return unsubscribe;
  }, [registerScrollListener]);

  const bgColor = isDark ? 'rgba(30, 41, 59, 0.92)' : 'rgba(255, 255, 255, 0.95)';
  const borderColor = isDark ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.08)';
  const activeBlobBg = isDark ? 'rgba(255, 107, 53, 0.20)' : 'rgba(255, 90, 31, 0.15)';

  const bubbleBg = isDark ? '#1E293B' : '#FFFFFF';
  const bubbleBorder = isDark ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.12)';
  const textCol = isDark ? '#F8FAFC' : '#0F172A';

  const visibleRoutes = state.routes.filter((route) => {
    const { options } = descriptors[route.key];
    if ((options as any).href === null) return false;
    return TAB_ORDER.includes(route.name);
  });

  const animatedStyle = useAnimatedStyle(() => {
    const totalOffset = TAB_BAR_HEIGHT + insets.bottom + 32;
    return {
      transform: [
        { scale: scaleAnim.value },
        { translateY: progress.value * totalOffset }
      ],
      opacity: opacityAnim.value * (1 - progress.value),
    };
  });

  const animatedQuickMenuStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { scale: menuScale.value },
        { translateY: menuTranslateY.value }
      ],
      opacity: menuOpacity.value,
    };
  });

  return (
    <>
      {/* Modal Overlay with Sibling Layering (Backdrop Pressable + Speech Bubbles Container) */}
      <Modal
        visible={isQuickMenuOpen}
        transparent
        animationType="none"
        onRequestClose={closeQuickMenu}
      >
        <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
          {/* Full Screen Backdrop Layer (Sibling 1) */}
          <Pressable
            style={StyleSheet.absoluteFillObject}
            onPress={closeQuickMenu}
          />

          {/* Floating Speech Action Bubbles Layer (Sibling 2 - Rendered on Top) */}
          <View
            style={{
              position: 'absolute',
              bottom: Math.max(insets.bottom, 16) + TAB_BAR_HEIGHT + 14,
              left: 0,
              right: 0,
              alignItems: 'center',
              justifyContent: 'center',
            }}
            pointerEvents="box-none"
          >
            <Animated.View
              style={[
                {
                  flexDirection: 'row',
                  alignItems: 'flex-end',
                  justifyContent: 'center',
                  paddingHorizontal: 8,
                },
                animatedQuickMenuStyle,
              ]}
              pointerEvents="auto"
            >
              {/* Bubble 1: Log Weight */}
              <TouchableOpacity
                onPress={() => handleQuickAction('weight')}
                activeOpacity={0.7}
                style={{
                  backgroundColor: bubbleBg,
                  borderColor: bubbleBorder,
                  borderWidth: 1,
                  borderRadius: 16,
                  paddingHorizontal: 9,
                  paddingVertical: 7,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  marginRight: 4,
                  marginBottom: 2,
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.16,
                  shadowRadius: 10,
                  elevation: 8,
                }}
              >
                <Ionicons name="scale-outline" size={14} color="#F59E0B" />
                <Text style={{ fontSize: 11, fontWeight: '700', color: textCol }}>Weight</Text>
              </TouchableOpacity>

              {/* Bubble 2: Add Workout */}
              <TouchableOpacity
                onPress={() => handleQuickAction('workout')}
                activeOpacity={0.7}
                style={{
                  backgroundColor: bubbleBg,
                  borderColor: bubbleBorder,
                  borderWidth: 1,
                  borderRadius: 16,
                  paddingHorizontal: 9,
                  paddingVertical: 7,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  marginRight: 4,
                  marginBottom: 16,
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.16,
                  shadowRadius: 10,
                  elevation: 8,
                }}
              >
                <Ionicons name="add-circle-outline" size={14} color={isDark ? '#FF6B35' : '#FF5A1F'} />
                <Text style={{ fontSize: 11, fontWeight: '700', color: textCol }}>Workout</Text>
              </TouchableOpacity>

              {/* Bubble 3: Log Activity */}
              <TouchableOpacity
                onPress={() => handleQuickAction('activity')}
                activeOpacity={0.7}
                style={{
                  backgroundColor: bubbleBg,
                  borderColor: bubbleBorder,
                  borderWidth: 1,
                  borderRadius: 16,
                  paddingHorizontal: 9,
                  paddingVertical: 7,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  marginLeft: 4,
                  marginBottom: 16,
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.16,
                  shadowRadius: 10,
                  elevation: 8,
                }}
              >
                <Ionicons name="fitness-outline" size={14} color="#10B981" />
                <Text style={{ fontSize: 11, fontWeight: '700', color: textCol }}>Activity</Text>
              </TouchableOpacity>

              {/* Bubble 4: Log Injury */}
              <TouchableOpacity
                onPress={() => handleQuickAction('injury')}
                activeOpacity={0.7}
                style={{
                  backgroundColor: bubbleBg,
                  borderColor: bubbleBorder,
                  borderWidth: 1,
                  borderRadius: 16,
                  paddingHorizontal: 9,
                  paddingVertical: 7,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  marginLeft: 4,
                  marginBottom: 2,
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.16,
                  shadowRadius: 10,
                  elevation: 8,
                }}
              >
                <Ionicons name="bandage-outline" size={14} color="#EF4444" />
                <Text style={{ fontSize: 11, fontWeight: '700', color: textCol }}>Injury</Text>
              </TouchableOpacity>
            </Animated.View>
          </View>
        </View>
      </Modal>

      {/* Main Bottom Navigation Bar */}
      <View 
        style={{
          position: 'absolute',
          bottom: Math.max(insets.bottom, 16),
          left: 0,
          right: 0,
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 999,
        }}
        pointerEvents={barInteractive ? 'box-none' : 'none'}
      >
        <TouchableWithoutFeedback onPress={expandBar}>
          <Animated.View 
            onLayout={(e) => {
              setTabBarOccupied(Math.max(insets.bottom, 16) + e.nativeEvent.layout.height);
            }}
            style={[{
              width: '85%',
              maxWidth: 380,
              height: TAB_BAR_HEIGHT,
              backgroundColor: bgColor,
              borderColor: borderColor,
              borderWidth: 1,
              borderRadius: 31,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-evenly',
              paddingHorizontal: 6,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.14,
              shadowRadius: 16,
              elevation: 6,
            }, animatedStyle]}
          >
            {visibleRoutes.map((route) => {
              const { options } = descriptors[route.key];
              const routeIndex = state.routes.findIndex((r) => r.key === route.key);
              const activeRouteName = state.routes[state.index]?.name;
              const isFocused = state.index === routeIndex || (route.name === 'index' && activeRouteName === 'planning');
              const isCenterButton = route.name === 'coach';

              const onPress = () => {
                if (isQuickMenuOpen) {
                  closeQuickMenu();
                  return;
                }
                expandBar();
                const event = navigation.emit({
                  type: 'tabPress',
                  target: route.key,
                  canPreventDefault: true,
                });

                if (!isFocused && !event.defaultPrevented) {
                  navigation.navigate(route.name);
                }
              };

              const onLongPress = () => {
                expandBar();
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                navigation.emit({
                  type: 'tabLongPress',
                  target: route.key,
                });

                if (isCenterButton) {
                  openQuickMenu();
                }
              };

              if (isCenterButton) {
                return (
                  <TouchableOpacity
                    key={route.key}
                    accessibilityRole="button"
                    accessibilityState={isFocused ? { selected: true } : {}}
                    accessibilityLabel={options.tabBarAccessibilityLabel}
                    testID={(options as any).tabBarTestID}
                    onPress={onPress}
                    onLongPress={onLongPress}
                    delayLongPress={280}
                    style={{
                      flex: 1,
                      height: '100%',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <View
                      style={{
                        width: 58,
                        height: 58,
                        borderRadius: 29,
                        backgroundColor: isDark ? '#FF6B35' : '#FF5A1F',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginTop: -22,
                        borderWidth: 4,
                        borderColor: bgColor,
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 6 },
                        shadowOpacity: 0.2,
                        shadowRadius: 8,
                        elevation: 8,
                      }}
                    >
                      {(options.tabBarIcon as any) && (options.tabBarIcon as any)({ focused: isFocused, color: '#FFFFFF', size: 26 })}
                      {unreadCount > 0 && !isFocused && (
                        <View
                          style={{
                            position: 'absolute',
                            top: -3,
                            right: -3,
                            minWidth: 20,
                            height: 20,
                            paddingHorizontal: 4,
                            borderRadius: 10,
                            backgroundColor: '#EF4444',
                            borderWidth: 2,
                            borderColor: bgColor,
                            alignItems: 'center',
                            justifyContent: 'center',
                            shadowColor: '#000',
                            shadowOffset: { width: 0, height: 2 },
                            shadowOpacity: 0.25,
                            shadowRadius: 3,
                            elevation: 6,
                          }}
                        >
                          <Text
                            style={{
                              color: '#FFFFFF',
                              fontSize: 10,
                              fontWeight: '900',
                              textAlign: 'center',
                            }}
                          >
                            {unreadCount > 9 ? '9+' : unreadCount}
                          </Text>
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              }

              return (
                <TouchableOpacity
                  key={route.key}
                  accessibilityRole="button"
                  accessibilityState={isFocused ? { selected: true } : {}}
                  accessibilityLabel={options.tabBarAccessibilityLabel}
                  testID={(options as any).tabBarTestID}
                  onPress={onPress}
                  onLongPress={onLongPress}
                  delayLongPress={280}
                  style={{
                    flex: 1,
                    height: '100%',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <View
                    style={{
                      backgroundColor: isFocused ? activeBlobBg : 'transparent',
                      paddingHorizontal: 16,
                      paddingVertical: 8,
                      borderRadius: 20,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {(options.tabBarIcon as any) && (options.tabBarIcon as any)({ 
                      focused: isFocused, 
                      color: isFocused ? (isDark ? '#FF6B35' : '#FF5A1F') : (isDark ? '#94A3B8' : '#64748B'), 
                      size: 22 
                    } as any)}
                  </View>
                </TouchableOpacity>
              );
            })}
          </Animated.View>
        </TouchableWithoutFeedback>
      </View>

      {/* Global Modals connected directly to app stores & AI Coach */}
      <LogWeightModal
        visible={activeModal === 'weight'}
        onClose={() => setActiveModal('none')}
        onSaveWeight={(weight) => {
          logPhysique({ weight_kg: weight, date: new Date().toISOString() });
          setActiveModal('none');
        }}
      />

      <AddWorkoutModal
        visible={activeModal === 'workout'}
        onClose={() => setActiveModal('none')}
        onSave={(workout) => {
          addWorkout({
            title: workout.title,
            type: workout.type as any,
            dateStr: workout.dateStr || new Date().toISOString().split('T')[0],
            duration: workout.duration,
            rookaPoints: workout.rookaPoints,
            steps: workout.steps as any,
          });
          setActiveModal('none');
        }}
      />

      <LogActivityModal
        visible={activeModal === 'activity'}
        onClose={() => setActiveModal('none')}
      />

      <LogNiggleModal
        visible={activeModal === 'injury'}
        onClose={() => setActiveModal('none')}
        onSendToCoach={(desc, sev, partId, partName) => {
          const areaPrefix = partName ? `[${partName}] ` : '';
          sendMessage(`I have a niggle / injury to report: ${areaPrefix}${desc} (Severity: ${sev}/10). Can you provide recovery advice?`);
          navigation.navigate('coach');
          setActiveModal('none');
        }}
      />
    </>
  );
}
