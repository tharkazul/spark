import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, useColorScheme, TouchableWithoutFeedback, Platform } from 'react-native';
import { MaterialTopTabBarProps } from '@react-navigation/material-top-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTabBar } from '../context/TabBarContext';
import { useCoachChat } from '../context/CoachChatStore';
import { useKeyboardMotionContext } from '../context/KeyboardMotionContext';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming, useAnimatedReaction, runOnJS } from 'react-native-reanimated';

const TAB_ORDER = ['index', 'physique', 'coach', 'social', 'profile'];
const TAB_BAR_HEIGHT = 62;

export function CustomTabBar({ state, descriptors, navigation }: MaterialTopTabBarProps) {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { registerScrollListener, setTabBarOccupied } = useTabBar();
  const { unreadCount } = useCoachChat();
  const { progress } = useKeyboardMotionContext();
  
  const [barInteractive, setBarInteractive] = useState(true);

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

            if (isCenterButton) {
              return (
                <TouchableOpacity
                  key={route.key}
                  accessibilityRole="button"
                  accessibilityState={isFocused ? { selected: true } : {}}
                  accessibilityLabel={options.tabBarAccessibilityLabel}
                  testID={(options as any).tabBarTestID}
                  onPress={onPress}
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
  );
}
