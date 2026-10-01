import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  useColorScheme,
  Pressable,
  StyleSheet,
  Modal,
} from 'react-native';
import { MaterialTopTabBarProps } from '@react-navigation/material-top-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BrandColors, Elevation } from '../constants/theme';
import { GlassView } from 'expo-glass-effect';
import { useTabBar } from '../context/TabBarContext';
import { useCoachChat } from '../context/CoachChatStore';
import { usePhysique } from '../context/PhysiqueStore';
import { usePlan } from '../context/PlanStore';
import { useKeyboardMotionContext } from '../context/KeyboardMotionContext';
import { useLanguage } from '../context/LanguageContext';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  useAnimatedReaction,
  runOnJS,
  useReducedMotion,
} from 'react-native-reanimated';
import { ScalePressable } from './ui/ScalePressable';
import { DynamicDateIcon } from './ui/DynamicDateIcon';
import { RookaMark } from './ui/RookaPoints';

import { LogWeightModal } from './dashboard/LogWeightModal';
import { AddWorkoutModal } from './dashboard/AddWorkoutModal';
import { LogActivityModal } from './dashboard/LogActivityModal';
import { LogNiggleModal } from './dashboard/LogNiggleModal';

const TAB_ORDER = ['index', 'physique', 'coach', 'social', 'profile'];
const TAB_BAR_HEIGHT = 64;

export function CustomTabBar({ state, descriptors, navigation }: MaterialTopTabBarProps) {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { setTabBarOccupied } = useTabBar();
  const { unreadCount, sendMessage } = useCoachChat();
  const { logPhysique } = usePhysique();
  const { addWorkout } = usePlan();
  const { progress } = useKeyboardMotionContext();
  const { t } = useLanguage();

  const lastTapTimeRef = useRef(0);
  const isTransitioningRef = useRef(false);

  const [barInteractive, setBarInteractive] = useState(true);
  const [isQuickMenuOpen, setIsQuickMenuOpen] = useState(false);
  const [activeModal, setActiveModal] = useState<'none' | 'weight' | 'workout' | 'activity' | 'injury'>('none');

  const reducedMotion = useReducedMotion();

  // Quick Actions animated shared values
  const menuScale = useSharedValue(0);
  const menuOpacity = useSharedValue(0);
  const menuTranslateY = useSharedValue(20);

  const openQuickMenu = () => {
    setIsQuickMenuOpen(true);
    if (reducedMotion) {
      menuScale.value = 1;
      menuOpacity.value = 1;
      menuTranslateY.value = 0;
    } else {
      menuScale.value = withSpring(1, { damping: 22, stiffness: 320, mass: 0.7 });
      menuOpacity.value = withTiming(1, { duration: 150 });
      menuTranslateY.value = withSpring(0, { damping: 22, stiffness: 320, mass: 0.7 });
    }
  };

  const closeQuickMenu = useCallback(() => {
    if (reducedMotion) {
      menuScale.value = 0.7;
      menuOpacity.value = 0;
      menuTranslateY.value = 15;
      setIsQuickMenuOpen(false);
    } else {
      menuScale.value = withSpring(0.7, { damping: 20, stiffness: 300 });
      menuOpacity.value = withTiming(0, { duration: 120 });
      menuTranslateY.value = withSpring(15, { damping: 20, stiffness: 300 });
      setTimeout(() => {
        setIsQuickMenuOpen(false);
      }, 120);
    }
  }, [reducedMotion, menuScale, menuOpacity, menuTranslateY]);

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

  // Colors per spec
  const activeColor = isDark ? '#60A5FA' : '#0369A1'; // --accent-text
  const inactiveColor = isDark ? '#94A3B8' : '#64748B'; // text-theme-muted
  const boltColor = isDark ? BrandColors.accentStrongDark : BrandColors.accentStrong;
  const boltRingColor = isDark ? 'rgba(59, 130, 246, 0.35)' : 'rgba(14, 165, 233, 0.35)';

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
        { translateY: progress.value * totalOffset },
      ],
      opacity: 1 - progress.value,
    };
  });

  const animatedQuickMenuStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { scale: menuScale.value },
        { translateY: menuTranslateY.value },
      ],
      opacity: menuOpacity.value,
    };
  });

  const renderTabIcon = (routeName: string, isFocused: boolean) => {
    const color = isFocused ? activeColor : inactiveColor;
    switch (routeName) {
      case 'index':
        return <DynamicDateIcon size={24} color={color} />;
      case 'physique':
        return <Ionicons name={isFocused ? 'pulse' : 'pulse-outline'} size={24} color={color} />;
      case 'social':
        return <Ionicons name={isFocused ? 'trophy' : 'trophy-outline'} size={24} color={color} />;
      case 'profile':
        return <Ionicons name={isFocused ? 'person' : 'person-outline'} size={24} color={color} />;
      default:
        return null;
    }
  };

  const getTabLabel = (routeName: string) => {
    switch (routeName) {
      case 'index':
        return t('tabs.planning', 'Planning');
      case 'physique':
        return t('tabs.progress', 'Progress');
      case 'coach':
        return t('tabs.coach', 'Coach');
      case 'social':
        return t('tabs.social', 'Social');
      case 'profile':
        return t('tabs.profile', 'Profile');
      default:
        return '';
    }
  };

  return (
    <>
      {/* Soft Background Fade Overlay at the Bottom */}
      <View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: insets.bottom + TAB_BAR_HEIGHT + 36,
          zIndex: 998,
        }}
        pointerEvents="none"
      >
        <LinearGradient
          colors={[
            isDark ? 'rgba(15, 23, 42, 0)' : 'rgba(241, 245, 249, 0)',
            isDark ? 'rgba(15, 23, 42, 0.75)' : 'rgba(241, 245, 249, 0.75)',
            isDark ? 'rgba(15, 23, 42, 0.98)' : 'rgba(241, 245, 249, 0.98)',
            isDark ? '#0F172A' : '#F1F5F9',
          ]}
          locations={[0, 0.35, 0.75, 1]}
          style={StyleSheet.absoluteFillObject}
        />
      </View>

      {/* Modal Overlay with Quick Action Bubbles */}
      <Modal
        visible={isQuickMenuOpen}
        transparent
        animationType="none"
        onRequestClose={closeQuickMenu}
      >
        <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
          <Pressable
            style={StyleSheet.absoluteFillObject}
            onPress={closeQuickMenu}
          />

          <View
            style={{
              position: 'absolute',
              bottom: Math.max(insets.bottom, 8) + TAB_BAR_HEIGHT + 16,
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
              <ScalePressable
                onPress={() => handleQuickAction('weight')}
                activeScale={0.92}
                haptic="light"
                style={{
                  backgroundColor: bubbleBg,
                  borderColor: bubbleBorder,
                  borderWidth: 1,
                  borderRadius: 14,
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 5,
                  marginRight: 4,
                  marginBottom: 2,
                }}
              >
                <Ionicons name="scale-outline" size={15} color="#F59E0B" />
                <Text style={{ fontSize: 12, fontWeight: '700', color: textCol }}>Weight</Text>
              </ScalePressable>

              <ScalePressable
                onPress={() => handleQuickAction('workout')}
                activeScale={0.92}
                haptic="light"
                style={{
                  backgroundColor: bubbleBg,
                  borderColor: bubbleBorder,
                  borderWidth: 1,
                  borderRadius: 14,
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 5,
                  marginRight: 4,
                  marginBottom: 16,
                }}
              >
                <Ionicons name="add-circle-outline" size={15} color={boltColor} />
                <Text style={{ fontSize: 12, fontWeight: '700', color: textCol }}>Workout</Text>
              </ScalePressable>

              <ScalePressable
                onPress={() => handleQuickAction('activity')}
                activeScale={0.92}
                haptic="light"
                style={{
                  backgroundColor: bubbleBg,
                  borderColor: bubbleBorder,
                  borderWidth: 1,
                  borderRadius: 14,
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 5,
                  marginLeft: 4,
                  marginBottom: 16,
                }}
              >
                <Ionicons name="fitness-outline" size={15} color="#10B981" />
                <Text style={{ fontSize: 12, fontWeight: '700', color: textCol }}>Activity</Text>
              </ScalePressable>

              <ScalePressable
                onPress={() => handleQuickAction('injury')}
                activeScale={0.92}
                haptic="light"
                style={{
                  backgroundColor: bubbleBg,
                  borderColor: bubbleBorder,
                  borderWidth: 1,
                  borderRadius: 14,
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 5,
                  marginLeft: 4,
                  marginBottom: 2,
                }}
              >
                <Ionicons name="bandage-outline" size={15} color="#EF4444" />
                <Text style={{ fontSize: 12, fontWeight: '700', color: textCol }}>Injury</Text>
              </ScalePressable>
            </Animated.View>
          </View>
        </View>
      </Modal>

      {/* Main Solid Floating Navigation Bar */}
      <View
        style={{
          position: 'absolute',
          bottom: insets.bottom + 8,
          left: 16,
          right: 16,
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 999,
        }}
        pointerEvents={barInteractive ? 'box-none' : 'none'}
      >
        <Animated.View
          onLayout={(e) => {
            setTabBarOccupied(insets.bottom + 8 + e.nativeEvent.layout.height);
          }}
          style={[
            {
              width: '100%',
              maxWidth: 420,
              height: TAB_BAR_HEIGHT,
              borderRadius: 32,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-evenly',
              paddingHorizontal: 8,
              backgroundColor: isDark ? 'rgba(30, 41, 59, 0.96)' : 'rgba(255, 255, 255, 0.96)',
              borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)',
              borderWidth: 1,
              ...Elevation.elevation1,
            },
            animatedStyle,
          ]}
        >
          {/* Background Blur Effect */}
          <View
            style={[
              StyleSheet.absoluteFillObject,
              {
                borderRadius: 32,
                overflow: 'hidden',
              },
            ]}
            pointerEvents="none"
          >
            <GlassView
              colorScheme={isDark ? 'dark' : 'light'}
              glassEffectStyle="regular"
              style={StyleSheet.absoluteFillObject}
            />
          </View>

          {visibleRoutes.map((route) => {
            const { options } = descriptors[route.key];
            const routeIndex = state.routes.findIndex((r) => r.key === route.key);
            const activeRouteName = state.routes[state.index]?.name;
            const isFocused =
              state.index === routeIndex ||
              (route.name === 'index' && activeRouteName === 'planning');
            const isCenterButton = route.name === 'coach';
            const label = getTabLabel(route.name);

            const onPress = () => {
              if (isQuickMenuOpen) {
                closeQuickMenu();
                return;
              }

              const now = Date.now();
              if (now - lastTapTimeRef.current < 350 || isTransitioningRef.current) {
                return;
              }

              Haptics.selectionAsync();

              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });

              if (!isFocused && !event.defaultPrevented) {
                lastTapTimeRef.current = now;
                isTransitioningRef.current = true;
                setTimeout(() => {
                  isTransitioningRef.current = false;
                }, 400);
                navigation.navigate(route.name);
              }
            };

            const onLongPress = () => {
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
                <ScalePressable
                  key={route.key}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: isFocused }}
                  accessibilityLabel={label || options.tabBarAccessibilityLabel || 'Coach'}
                  testID={(options as any).tabBarTestID}
                  onPress={onPress}
                  onLongPress={onLongPress}
                  delayLongPress={280}
                  activeScale={0.92}
                  haptic="selection"
                  style={{
                    flex: 1,
                    height: '100%',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minWidth: 44,
                    minHeight: 44,
                  }}
                >
                  <View
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: 28,
                      backgroundColor: boltColor,
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginTop: -20,
                      borderWidth: isFocused ? 3 : 0,
                      borderColor: boltRingColor,
                      ...Elevation.elevation1,
                    }}
                  >
                    <RookaMark size={26} color="#FFFFFF" />

                    {unreadCount > 0 && !isFocused && (
                      <View
                        style={{
                          position: 'absolute',
                          top: -2,
                          right: -2,
                          minWidth: 18,
                          height: 18,
                          paddingHorizontal: 4,
                          borderRadius: 9,
                          backgroundColor: '#EF4444',
                          borderWidth: 2,
                          borderColor: isDark ? '#1E293B' : '#FFFFFF',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Text
                          style={{
                            color: '#FFFFFF',
                            fontSize: 9,
                            fontWeight: '900',
                            textAlign: 'center',
                          }}
                        >
                          {unreadCount > 9 ? '9+' : unreadCount}
                        </Text>
                      </View>
                    )}
                  </View>
                </ScalePressable>
              );
            }

            return (
              <ScalePressable
                key={route.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: isFocused }}
                accessibilityLabel={label || options.tabBarAccessibilityLabel}
                testID={(options as any).tabBarTestID}
                onPress={onPress}
                onLongPress={onLongPress}
                delayLongPress={280}
                activeScale={0.92}
                haptic="selection"
                style={{
                  flex: 1,
                  height: '100%',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: 44,
                  minHeight: 44,
                  paddingVertical: 6,
                }}
              >
                <View style={{ alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                  <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
                    {renderTabIcon(route.name, isFocused)}
                  </View>
                  <Text
                    numberOfLines={1}
                    style={{
                      fontSize: 10,
                      fontWeight: '600',
                      color: isFocused ? activeColor : inactiveColor,
                    }}
                  >
                    {label}
                  </Text>
                </View>
              </ScalePressable>
            );
          })}
        </Animated.View>
      </View>

      {/* Global Modals */}
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
          sendMessage(
            `I have a niggle / injury to report: ${areaPrefix}${desc} (Severity: ${sev}/10). Can you provide recovery advice?`
          );
          navigation.navigate('coach');
          setActiveModal('none');
        }}
      />
    </>
  );
}

export default CustomTabBar;
