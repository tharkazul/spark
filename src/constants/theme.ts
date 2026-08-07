/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const BrandColors = {
  primary: '#FF5F3B',
  deep: '#E8481F',
  ink: '#1B1B1F',
  accentDark: '#FF6B45',
} as const;

export const NeutralColors = {
  50: '#F7F7F9',
  100: '#EAEAED',
  200: '#DEDEE3',
  400: '#B4B4BD',
  600: '#6F6F79',
  800: '#3A3A40',
} as const;

export const SemanticColors = {
  success: { main: '#2FB673', bg: '#E9F7EF', text: '#0F5C34' },
  warning: { main: '#F5A623', bg: '#FDF2E3', text: '#7A4A0A' },
  error: { main: '#E5484D', bg: '#FCEAEA', text: '#7A1F1F' },
  info: { main: '#3B82F6', bg: '#E8F0FE', text: '#123E80' },
} as const;

export const SportColors = {
  light: {
    SWIM: { color: '#2E8FE0', darkText: '#04263F' },
    BIKE: { color: '#4CAF6D', darkText: '#0E3A20' },
    RIDE: { color: '#4CAF6D', darkText: '#0E3A20' },
    RUN: { color: '#D9A62E', darkText: '#4A3705' },
    CARDIO: { color: '#E0625A', darkText: '#4A1D19' },
    HIIT: { color: '#E0625A', darkText: '#4A1D19' },
    STRENGTH: { color: '#B36AE0', darkText: '#3A1A4A' },
    YOGA: { color: '#2EBFAF', darkText: '#053E38' },
    MOBILITY: { color: '#2EBFAF', darkText: '#053E38' },
    WALK: { color: '#8FA82E', darkText: '#2C3705' },
    HIKE: { color: '#8FA82E', darkText: '#2C3705' },
    REST: { color: '#6F6F79', darkText: '#1B1B1F' },
  },
  dark: {
    SWIM: { color: '#5BA8E8', darkText: '#04263F' },
    BIKE: { color: '#6FC48A', darkText: '#0E3A20' },
    RIDE: { color: '#6FC48A', darkText: '#0E3A20' },
    RUN: { color: '#E0B94F', darkText: '#4A3705' },
    CARDIO: { color: '#E8837C', darkText: '#4A1D19' },
    HIIT: { color: '#E8837C', darkText: '#4A1D19' },
    STRENGTH: { color: '#C48AEA', darkText: '#3A1A4A' },
    YOGA: { color: '#4FD1C0', darkText: '#053E38' },
    MOBILITY: { color: '#4FD1C0', darkText: '#053E38' },
    WALK: { color: '#A8C24F', darkText: '#2C3705' },
    HIKE: { color: '#A8C24F', darkText: '#2C3705' },
    REST: { color: '#9A9AA2', darkText: '#F5F5F7' },
  },
} as const;

export const Colors = {
  light: {
    text: '#1B1B1F',
    textSecondary: '#6F6F79',
    background: '#F7F7F9',
    card: '#FFFFFF',
    border: '#DEDEE3',
    tint: '#FF5F3B',
    backgroundElement: '#EAEAED',
    backgroundSelected: '#DEDEE3',
  },
  dark: {
    text: '#F5F5F7',
    textSecondary: '#9A9AA2',
    background: '#17171A',
    card: '#212226',
    border: '#2D2E33',
    tint: '#FF6B45',
    backgroundElement: '#212226',
    backgroundSelected: '#2D2E33',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
