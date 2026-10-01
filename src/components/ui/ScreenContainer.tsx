import React from 'react';
import { View, ScrollView, StyleProp, ViewStyle, ScrollViewProps } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

export interface ScreenContainerProps {
  children: React.ReactNode;
  scrollable?: boolean;
  edges?: ('top' | 'right' | 'bottom' | 'left')[];
  className?: string;
  contentContainerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  showsVerticalScrollIndicator?: boolean;
  scrollViewProps?: Partial<ScrollViewProps>;
}

/**
 * ScreenContainer adheres to Rooka UI/UX Spec (Ticket R2-13):
 * - Page gutters: exactly 16pt (px-4).
 * - Background: bg-theme-bg (#F1F5F9 in light mode, #0F172A in dark mode).
 * - Ensures cards sit against bg-theme-bg and separate cleanly.
 */
export function ScreenContainer({
  children,
  scrollable = true,
  edges = ['top'],
  className = '',
  contentContainerStyle,
  style,
  showsVerticalScrollIndicator = false,
  scrollViewProps,
}: ScreenContainerProps) {
  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView edges={edges} className="flex-1 bg-theme-bg" style={style}>
      {scrollable ? (
        <ScrollView
          className={`flex-1 ${className}`}
          contentContainerStyle={[
            {
              paddingHorizontal: 16,
              paddingBottom: Math.max(insets.bottom, 24) + 64, // tab bar clearance
            },
            contentContainerStyle,
          ]}
          showsVerticalScrollIndicator={showsVerticalScrollIndicator}
          {...scrollViewProps}
        >
          {children}
        </ScrollView>
      ) : (
        <View
          className={`flex-1 px-4 ${className}`}
          style={[
            { paddingBottom: Math.max(insets.bottom, 24) },
            contentContainerStyle,
          ]}
        >
          {children}
        </View>
      )}
    </SafeAreaView>
  );
}
