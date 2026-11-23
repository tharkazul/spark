import React, { useState } from 'react';
import { Animated, TouchableOpacity, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

export interface PagerTab {
  key: string;
  label: string;
}

interface PagerTabsProps {
  tabs: PagerTab[];
  /** Horizontal offset of the pager these tabs drive (contentOffset.x). */
  scrollX: Animated.Value;
  /** Width of one pager page; usually the screen width. */
  pageWidth: number;
  onPressTab: (index: number) => void;
  className?: string;
}

/**
 * Sub-tab switcher for a horizontal swipe pager (Progress, Planning). The
 * pill and the label colours follow the pager's scroll position, so the
 * pill slides along with the finger instead of jumping when a page settles.
 *
 * The selected pill is a raised neutral surface, as in SegmentedControl, not
 * the accent. A solid accent pill sat at the top of every tab screen, so the
 * accent's biggest shape on each screen was "which tab is open" rather than
 * the screen's one action.
 */
export function PagerTabs({ tabs, scrollX, pageWidth, onPressTab, className = '' }: PagerTabsProps) {
  const theme = useTheme();
  // Start from the usual full-width guess so the pill is there on first paint;
  // onLayout corrects it.
  const [width, setWidth] = useState(pageWidth - 32);
  const tabWidth = Math.max(0, (width - 8) / tabs.length);

  const indicatorLeft =
    tabs.length > 1
      ? scrollX.interpolate({
          inputRange: tabs.map((_, i) => i * pageWidth),
          outputRange: tabs.map((_, i) => 4 + tabWidth * i),
          extrapolate: 'clamp',
        })
      : 4;

  return (
    <View
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width;
        if (w > 0 && w !== width) setWidth(w);
      }}
      className={`relative flex-row bg-theme-inset rounded-tile p-1 overflow-hidden ${className}`}
    >
      <Animated.View
        className="absolute top-1 bottom-1 bg-theme-card dark:bg-theme-border rounded-button"
        style={{ left: indicatorLeft, width: tabWidth }}
      />

      {tabs.map((tab, i) => {
        const color =
          tabs.length > 1
            ? scrollX.interpolate({
                inputRange: [(i - 0.5) * pageWidth, i * pageWidth, (i + 0.5) * pageWidth],
                outputRange: [theme.textSecondary, theme.text, theme.textSecondary],
                extrapolate: 'clamp',
              })
            : theme.text;
        return (
          <TouchableOpacity
            key={tab.key}
            onPress={() => onPressTab(i)}
            activeOpacity={0.8}
            accessibilityRole="tab"
            className="flex-1 py-2.5 items-center justify-center z-10"
          >
            <Animated.Text className="text-sm font-extrabold" style={{ color }} numberOfLines={1}>
              {tab.label}
            </Animated.Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
