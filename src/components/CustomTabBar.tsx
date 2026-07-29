import React, { useRef, useEffect, useState } from 'react';
import { View, TouchableOpacity, useColorScheme, Animated, TouchableWithoutFeedback, Keyboard, Platform } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTabBar } from '../context/TabBarContext';

const TAB_ORDER = ['index', 'physique', 'coach', 'social', 'profile'];

export function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { registerScrollListener } = useTabBar();
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  const scaleAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(1)).current;

  const expandBar = () => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 6,
        tension: 80,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const shrinkBar = () => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 0.9,
        friction: 7,
        tension: 70,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0.88,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();
  };

  useEffect(() => {
    const unsubscribe = registerScrollListener(() => {
      shrinkBar();
    });
    return unsubscribe;
  }, [registerScrollListener]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, () => setIsKeyboardVisible(true));
    const hideSub = Keyboard.addListener(hideEvent, () => setIsKeyboardVisible(false));

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  if (isKeyboardVisible) return null;

  const bgColor = isDark ? 'rgba(28, 33, 36, 0.90)' : 'rgba(255, 255, 255, 0.90)';
  const borderColor = isDark ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.08)';
  const activeBlobBg = isDark ? 'rgba(22, 172, 189, 0.25)' : 'rgba(22, 172, 189, 0.15)';

  // Filter routes to only include the 5 primary tab screens
  const visibleRoutes = state.routes.filter((route) => {
    const { options } = descriptors[route.key];
    if ((options as any).href === null) return false;
    return TAB_ORDER.includes(route.name);
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
      pointerEvents="box-none"
    >
      <TouchableWithoutFeedback onPress={expandBar}>
        <Animated.View 
          style={{
            width: '85%',
            maxWidth: 380,
            height: 62,
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
            transform: [{ scale: scaleAnim }],
            opacity: opacityAnim,
          }}
        >
          {visibleRoutes.map((route) => {
            const { options } = descriptors[route.key];
            const routeIndex = state.routes.findIndex((r) => r.key === route.key);
            const isFocused = state.index === routeIndex;
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
                      backgroundColor: '#16ACBD',
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
                    {options.tabBarIcon && options.tabBarIcon({ focused: isFocused, color: '#FFFFFF', size: 26 })}
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
                  {options.tabBarIcon && options.tabBarIcon({ 
                    focused: isFocused, 
                    color: isFocused ? '#16ACBD' : (isDark ? '#8E9BA4' : '#64748B'), 
                    size: 22 
                  })}
                </View>
              </TouchableOpacity>
            );
          })}
        </Animated.View>
      </TouchableWithoutFeedback>
    </View>
  );
}
