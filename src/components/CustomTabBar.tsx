import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, useColorScheme, TouchableWithoutFeedback, Alert } from 'react-native';
import { MaterialTopTabBarProps } from '@react-navigation/material-top-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useTabBar } from '../context/TabBarContext';
import { useCoachChat } from '../context/CoachChatStore';
import { useKeyboardMotionContext } from '../context/KeyboardMotionContext';
import { BottomSheetModal } from './ui/BottomSheetModal';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming, useAnimatedReaction, runOnJS } from 'react-native-reanimated';

const TAB_ORDER = ['index', 'physique', 'coach', 'social', 'profile'];
const TAB_BAR_HEIGHT = 62;

export function CustomTabBar({ state, descriptors, navigation }: MaterialTopTabBarProps) {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { registerScrollListener, setTabBarOccupied } = useTabBar();
  const { unreadCount, sendMessage, clearHistory } = useCoachChat();
  const { progress } = useKeyboardMotionContext();
  
  const [barInteractive, setBarInteractive] = useState(true);
  const [isQuickCoachModalOpen, setIsQuickCoachModalOpen] = useState(false);

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
  };

  useEffect(() => {
    const unsubscribe = registerScrollListener(() => {
      shrinkBar();
    });
    return unsubscribe;
  }, [registerScrollListener]);

  const bgColor = isDark ? 'rgba(30, 41, 59, 0.90)' : 'rgba(255, 255, 255, 0.90)';
  const borderColor = isDark ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.08)';
  const activeBlobBg = isDark ? 'rgba(255, 107, 53, 0.20)' : 'rgba(255, 90, 31, 0.15)';

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

  return (
    <View 
      style={{
        position: 'absolute',
        bottom: Math.max(insets.bottom, 16),
        left: 0,
        right: 0,
        alignItems: 'center',
        justifyContent: 'center',
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
                setIsQuickCoachModalOpen(true);
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

      {/* Quick Coach Actions Bottom Sheet on Long Press */}
      <BottomSheetModal
        visible={isQuickCoachModalOpen}
        onClose={() => setIsQuickCoachModalOpen(false)}
        showHandle={true}
        contentClassName="bg-theme-card rounded-t-3xl p-6 border-t border-theme-border/50"
      >
        <View className="mb-4">
          <View className="flex-row items-center justify-between mb-3">
            <View className="flex-row items-center gap-3">
              <View className="w-10 h-10 rounded-full bg-theme-accent items-center justify-center shadow-sm">
                <Ionicons name="sparkles" size={20} color="#FFFFFF" />
              </View>
              <View>
                <Text className="text-base font-extrabold text-theme-text">Spark AI Coach</Text>
                <Text className="text-xs text-theme-muted">Quick Actions</Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={() => setIsQuickCoachModalOpen(false)}
              className="w-8 h-8 rounded-full bg-theme-bg items-center justify-center"
            >
              <Ionicons name="close" size={18} color={isDark ? '#94A3B8' : '#64748B'} />
            </TouchableOpacity>
          </View>
          
          <View className="gap-2.5 mt-2">
            <TouchableOpacity
              onPress={() => {
                setIsQuickCoachModalOpen(false);
                navigation.navigate('coach');
              }}
              activeOpacity={0.75}
              className="flex-row items-center p-3.5 rounded-2xl bg-theme-bg border border-theme-border/60 gap-3"
            >
              <View className="w-9 h-9 rounded-xl bg-theme-accent/15 items-center justify-center">
                <Ionicons name="chatbubble-ellipses-outline" size={20} color={isDark ? '#FF6B35' : '#FF5A1F'} />
              </View>
              <View className="flex-1">
                <Text className="text-sm font-bold text-theme-text">Open Conversation</Text>
                <Text className="text-xs text-theme-muted">Chat directly with your AI coach</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={isDark ? '#94A3B8' : '#64748B'} />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                setIsQuickCoachModalOpen(false);
                navigation.navigate('coach');
                sendMessage("I'd like to adapt my workout plan for today. How should we adjust it?");
              }}
              activeOpacity={0.75}
              className="flex-row items-center p-3.5 rounded-2xl bg-theme-bg border border-theme-border/60 gap-3"
            >
              <View className="w-9 h-9 rounded-xl bg-amber-500/15 items-center justify-center">
                <Ionicons name="flash-outline" size={20} color="#F59E0B" />
              </View>
              <View className="flex-1">
                <Text className="text-sm font-bold text-theme-text">Adapt Today's Plan</Text>
                <Text className="text-xs text-theme-muted">Adjust workout volume or intensity</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={isDark ? '#94A3B8' : '#64748B'} />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                setIsQuickCoachModalOpen(false);
                navigation.navigate('coach');
                sendMessage("I have a niggle / pain to report. Can you provide recovery advice?");
              }}
              activeOpacity={0.75}
              className="flex-row items-center p-3.5 rounded-2xl bg-theme-bg border border-theme-border/60 gap-3"
            >
              <View className="w-9 h-9 rounded-xl bg-red-500/15 items-center justify-center">
                <Ionicons name="medkit-outline" size={20} color="#EF4444" />
              </View>
              <View className="flex-1">
                <Text className="text-sm font-bold text-theme-text">Report Niggle or Injury</Text>
                <Text className="text-xs text-theme-muted">Get recovery and load guidance</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={isDark ? '#94A3B8' : '#64748B'} />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                Alert.alert(
                  'Start Fresh Session',
                  'Are you sure you want to clear the active conversation history with your coach?',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Clear Chat',
                      style: 'destructive',
                      onPress: () => {
                        setIsQuickCoachModalOpen(false);
                        clearHistory();
                        navigation.navigate('coach');
                      },
                    },
                  ]
                );
              }}
              activeOpacity={0.75}
              className="flex-row items-center p-3.5 rounded-2xl bg-theme-bg border border-theme-border/60 gap-3"
            >
              <View className="w-9 h-9 rounded-xl bg-slate-500/15 items-center justify-center">
                <Ionicons name="refresh-outline" size={20} color={isDark ? '#94A3B8' : '#64748B'} />
              </View>
              <View className="flex-1">
                <Text className="text-sm font-bold text-theme-text">New Session</Text>
                <Text className="text-xs text-theme-muted">Clear context and start clean</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={isDark ? '#94A3B8' : '#64748B'} />
            </TouchableOpacity>
          </View>
        </View>
      </BottomSheetModal>
    </View>
  );
}
