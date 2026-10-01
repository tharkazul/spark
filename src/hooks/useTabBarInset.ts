import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Standard bottom inset for scrollable views sitting above the floating bottom tab bar.
 * Formula per UI/UX Improvement Spec:
 * 64 (bar height) + insets.bottom + 8 (bottom offset) + 24 (breathing room)
 */
export function useTabBarInset(): number {
  const insets = useSafeAreaInsets();
  return 64 + insets.bottom + 8 + 24;
}

export default useTabBarInset;
