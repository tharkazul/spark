import React, { createContext, useContext } from 'react';
import {
  Animated,
  Dimensions,
  Platform,
  StyleProp,
  StyleSheet,
  useColorScheme,
  ViewStyle,
} from 'react-native';
import * as Device from 'expo-device';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * The shell every bottom sheet in rooka sits in: the iOS 26/27 floating sheet.
 *
 * On iPhones with rounded displays the sheet lifts off the edges by
 * SHEET_INSET and its corners are the display's corner radius minus that
 * inset, so the gap stays the same width all the way around the curve. A
 * curve that is slightly off reads worse than no gap at all, so any device
 * whose radius we do not know for certain (home-button iPhones, iPads,
 * Android, an ambiguous simulator) gets the old flush sheet instead.
 *
 * React Native has no API for the display radius; the only native source is
 * the private `_displayCornerRadius`, which is an App Store risk. The values
 * below are Apple's, in points.
 */

export const SHEET_INSET = 8;

/** Backdrop dim behind a sheet. Lighter than the old 0.6 so the glass has something to refract. */
export const SHEET_BACKDROP = 'rgba(0,0,0,0.4)';

const FLUSH_TOP_RADIUS = 32;

// Screen size (portrait points) → display corner radius. Every iPhone at one
// of these sizes shares the radius, including ones released after this table.
const RADIUS_BY_SCREEN: Record<string, number> = {
  '390x844': 47.33, // 12, 12 Pro, 13, 13 Pro, 14, 16e
  '428x926': 53.33, // 12 Pro Max, 13 Pro Max, 14 Plus
  '393x852': 55, // 14 Pro, 15, 15 Pro, 16
  '430x932': 55, // 14 Pro Max, 15 Plus, 15 Pro Max, 16 Plus
  '402x874': 62, // 16 Pro, 17, 17 Pro
  '440x956': 62, // 16 Pro Max, 17 Pro Max
};

// Two screen sizes are shared by phones with different radii; only the model
// identifier tells them apart. On the simulator modelId is "arm64", so these
// stay flush there.
const RADIUS_BY_MODEL: Record<string, number> = {
  'iPhone10,3': 39, // X
  'iPhone10,6': 39, // X
  'iPhone11,2': 39, // XS
  'iPhone11,4': 39, // XS Max
  'iPhone11,6': 39, // XS Max
  'iPhone12,3': 39, // 11 Pro
  'iPhone12,5': 39, // 11 Pro Max
  'iPhone11,8': 41.5, // XR
  'iPhone12,1': 41.5, // 11
  'iPhone13,1': 44, // 12 mini
  'iPhone14,4': 44, // 13 mini
};

function displayCornerRadius(): number {
  if (Platform.OS !== 'ios' || Platform.isPad) return 0;
  const byModel = Device.modelId ? RADIUS_BY_MODEL[Device.modelId] : undefined;
  if (byModel) return byModel;
  const { width, height } = Dimensions.get('screen');
  const key = `${Math.round(Math.min(width, height))}x${Math.round(Math.max(width, height))}`;
  return RADIUS_BY_SCREEN[key] ?? 0;
}

const DISPLAY_RADIUS = displayCornerRadius();

/**
 * The sheet's geometry on this device. `safeBottom` is the home-indicator
 * clearance left once the sheet has already been lifted by `inset`; sheets
 * that pad their own footer should use it instead of `insets.bottom`.
 */
export function useSheetShape() {
  const insets = useSafeAreaInsets();
  const floating = DISPLAY_RADIUS > 0;
  const inset = floating ? SHEET_INSET : 0;
  return {
    floating,
    inset,
    topRadius: floating ? DISPLAY_RADIUS - SHEET_INSET : FLUSH_TOP_RADIUS,
    bottomRadius: floating ? DISPLAY_RADIUS - SHEET_INSET : 0,
    safeBottom: Math.max(insets.bottom - inset, 0),
  };
}

const GLASS = isLiquidGlassAvailable();

const InSheetContext = createContext(false);

/** True inside a SheetSurface. Buttons use it to take the capsule shape iOS sheets use. */
export const useInSheet = () => useContext(InSheetContext);

export interface SheetSurfaceProps {
  children?: React.ReactNode;
  /** Layout only (padding, height, flex). Background, corners and border belong to the surface. */
  className?: string;
  style?: StyleProp<ViewStyle> | any;
  /** Minimum bottom padding; the home-indicator clearance is added on top when larger. Omit when the sheet pads its own footer. */
  padBottom?: number;
  /** Background where liquid glass is unavailable (Android, iOS < 26). */
  solidClassName?: string;
}

export function SheetSurface({
  children,
  className = '',
  style,
  padBottom,
  solidClassName = 'bg-theme-card',
}: SheetSurfaceProps) {
  const isDark = useColorScheme() === 'dark';
  const { floating, inset, topRadius, bottomRadius, safeBottom } = useSheetShape();

  const corners = {
    borderTopLeftRadius: topRadius,
    borderTopRightRadius: topRadius,
    borderBottomLeftRadius: bottomRadius,
    borderBottomRightRadius: bottomRadius,
  };

  return (
    <Animated.View
      style={[
        corners,
        {
          marginHorizontal: inset,
          marginBottom: inset,
          overflow: 'hidden',
          borderCurve: 'continuous',
          // The rim: a hairline of light around the whole sheet when it
          // floats, only along the top when it sits flush.
          borderColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.7)',
          borderWidth: floating ? StyleSheet.hairlineWidth * 2 : 0,
          borderTopWidth: StyleSheet.hairlineWidth * 2,
        },
        padBottom != null && { paddingBottom: Math.max(safeBottom, padBottom) },
        style,
      ]}
      className={`${GLASS ? '' : solidClassName} ${className}`}
    >
      {GLASS && (
        <GlassView
          pointerEvents="none"
          glassEffectStyle="regular"
          colorScheme={isDark ? 'dark' : 'light'}
          style={[StyleSheet.absoluteFill, corners]}
        />
      )}
      <InSheetContext.Provider value={true}>{children}</InSheetContext.Provider>
    </Animated.View>
  );
}
