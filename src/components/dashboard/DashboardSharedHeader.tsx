import React from 'react';
import { View, Animated, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHeaderLayout } from '../../context/HeaderLayoutContext';
import { ScreenHeaderTitleRow } from '../ui/ScreenHeaderTitleRow';

export function DashboardSharedHeader({ position }: { position: Animated.AnimatedInterpolation<number> }) {
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { setHeaderHeight } = useHeaderLayout();

  const opacity = position.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 0, 0],
    extrapolate: 'clamp',
  });

  const headerTranslateX = position.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -SCREEN_WIDTH],
    extrapolate: 'clamp',
  });

  return (
    <Animated.View 
      className="absolute top-0 left-0 right-0 z-50 bg-theme-bg" 
      pointerEvents="box-none"
      style={{
        paddingTop: insets.top,
        opacity,
        transform: [{ translateX: headerTranslateX }],
      }}
      onLayout={(e) => {
        const h = e.nativeEvent.layout.height;
        if (h > 0) {
          requestAnimationFrame(() => {
            setHeaderHeight(h);
          });
        }
      }}
    >
      <View className="px-5 pt-3 pb-2 bg-theme-bg" pointerEvents="box-none">
        <ScreenHeaderTitleRow title="Planning" />
      </View>
    </Animated.View>
  );
}
