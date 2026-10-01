import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, LayoutChangeEvent } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  useReducedMotion,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

export interface SegmentItem {
  key: string;
  label: string;
}

export interface SegmentedControlProps {
  items: SegmentItem[];
  value: string;
  onChange: (key: string) => void;
  size?: 'md' | 'sm';
  className?: string;
}

/**
 * Standard SegmentedControl adhering to Rooka UI/UX Spec (Ticket R2-15):
 * - Container: bg-theme-inset (234 239 245), radius 10, 4pt padding, equal-width segments
 * - Selected pill: bg-theme-card (pure white in light mode), radius 7, subtle shadow
 * - Selected text: text-theme-text font-bold
 * - Unselected text: text-theme-muted font-medium
 * - Height: 36pt (md) or 32pt (sm)
 * - Animated spring translateX with useReducedMotion()
 * - Selection haptic on item press
 */
export function SegmentedControl({
  items,
  value,
  onChange,
  size = 'md',
  className = '',
}: SegmentedControlProps) {
  const [containerWidth, setContainerWidth] = useState(0);
  const reducedMotion = useReducedMotion();

  const activeIndex = Math.max(
    0,
    items.findIndex((item) => item.key === value)
  );

  const containerPadding = 4;
  const isSm = size === 'sm';
  const controlHeight = isSm ? 32 : 36;
  const pillHeight = controlHeight - containerPadding * 2;

  const segmentWidth =
    containerWidth > 0 && items.length > 0
      ? (containerWidth - containerPadding * 2) / items.length
      : 0;

  const translateX = useSharedValue(0);

  useEffect(() => {
    if (segmentWidth > 0) {
      const targetX = activeIndex * segmentWidth;
      if (reducedMotion) {
        translateX.value = targetX;
      } else {
        translateX.value = withSpring(targetX, {
          damping: 24,
          stiffness: 300,
          mass: 0.8,
        });
      }
    }
  }, [activeIndex, segmentWidth, reducedMotion]);

  const animatedPillStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: translateX.value }],
    };
  });

  const onLayout = (e: LayoutChangeEvent) => {
    const width = e.nativeEvent.layout.width;
    setContainerWidth(width);
  };

  const handleSelect = (key: string) => {
    if (key !== value) {
      Haptics.selectionAsync();
      onChange(key);
    }
  };

  return (
    <View
      onLayout={onLayout}
      style={{ height: controlHeight, padding: containerPadding }}
      className={`bg-theme-inset rounded-[10px] flex-row items-center relative overflow-hidden ${className}`}
    >
      {/* Animated Sliding White Thumb Pill */}
      {segmentWidth > 0 && (
        <Animated.View
          style={[
            {
              position: 'absolute',
              top: containerPadding,
              left: containerPadding,
              width: segmentWidth,
              height: pillHeight,
            },
            animatedPillStyle,
          ]}
          className="bg-theme-card rounded-[7px] shadow-xs"
        />
      )}

      {/* Segments */}
      {items.map((item) => {
        const isSelected = item.key === value;

        return (
          <Pressable
            key={item.key}
            onPress={() => handleSelect(item.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={item.label}
            className="flex-1 h-full items-center justify-center px-1.5 z-10"
          >
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
              className={`text-center ${
                isSm ? 'text-xs' : 'text-[13px]'
              } ${isSelected ? 'text-theme-text font-bold' : 'text-theme-muted font-medium'}`}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default SegmentedControl;
