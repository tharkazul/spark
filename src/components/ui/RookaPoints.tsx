import React from 'react';
import { Text, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

import { RookaMarkSvg } from './RookaMarkSvg';

/**
 * The rooka points unit, in one place.
 *
 * The glyph used to exist in two representations at once: a proper Ionicons
 * `flash` in 11 places, and a raw `⚡` emoji in 6 more -- same concept, two
 * renderings, and the emoji brought its own yellow into an orange chip. Both
 * were inherited from when points were called Spark.
 *
 * Everything now routes through RookaMark below, so replacing the bolt with the
 * rooka R mark is a one-line change in one file rather than a 17-site sweep,
 * and the two representations cannot drift apart again.
 */

// Nudged up from 13/16/20: the R carries an interior counter the bolt did
// not, so it needs a little more room before it closes up.
const ICON_SIZE = { sm: 15, md: 19, lg: 24 } as const;
const TEXT_CLASS = { sm: 'text-xs', md: 'text-sm', lg: 'text-base' } as const;

type Size = keyof typeof ICON_SIZE;

/**
 * The points glyph. This is the single place the mark is chosen.
 *
 * Now the real rooka R vector rather than the inherited Ionicons bolt. It is
 * clean at 32px and good at 24px; below ~20px the counter closes up, so the
 * smallest badge still renders it a little soft. That is the drawing's limit,
 * not this file's -- a simplified cut is what would go smaller.
 */
export function RookaMark({ size = 14, color }: { size?: number; color?: string }) {
  const theme = useTheme();
  return <RookaMarkSvg size={size} color={color ?? theme.tint} />;
}

interface RookaPointsProps {
  value: number | string;
  /**
   * Leading `+`. On for a delta earned ("+15"), off for an absolute total or a
   * ratio -- TodaysPlanCard shows a bare `0` and the quest counter shows
   * `2/30`, so this cannot be baked in.
   */
  signed?: boolean;
  size?: Size;
  /** `badge` wraps it in the accent-soft pill the feed and day cards use. */
  variant?: 'plain' | 'badge';
  /** Overrides the glyph + text colour, e.g. white on an accent fill. */
  color?: string;
  className?: string;
}

export function RookaPoints({
  value,
  signed = true,
  size = 'sm',
  variant = 'plain',
  color,
  className = '',
}: RookaPointsProps) {
  const wrapper =
    variant === 'badge'
      ? 'flex-row items-center gap-x-1 px-2.5 py-1 rounded-full bg-theme-accent-soft'
      : 'flex-row items-center gap-x-1';

  return (
    <View className={`${wrapper} ${className}`}>
      <Text
        className={`${TEXT_CLASS[size]} font-rajdhani font-bold ${color ? '' : 'text-theme-accent'}`}
        style={color ? { color } : undefined}
      >
        {signed ? '+' : ''}
        {value}
      </Text>
      <RookaMark size={ICON_SIZE[size]} color={color} />
    </View>
  );
}
