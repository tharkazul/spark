import { useMemo, useRef } from 'react';
import { Animated, PanResponder } from 'react-native';

/**
 * Swipe-down-to-dismiss for bottom sheets.
 *
 * Returns a `dragY` value to add to the sheet's existing entry animation, and
 * pan handlers to spread onto the sheet's grab area.
 *
 * Attach `panHandlers` to the drag handle / header only, never the whole sheet:
 * claiming the gesture at the root would steal vertical drags from any
 * ScrollView, FlatList or text input inside it.
 */
export function useSheetDismiss(
  onClose: () => void,
  options?: { distanceThreshold?: number; velocityThreshold?: number }
) {
  const dragY = useRef(new Animated.Value(0)).current;
  const distanceThreshold = options?.distanceThreshold ?? 110;
  const velocityThreshold = options?.velocityThreshold ?? 0.8;

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        // Only claim clearly-downward drags, so a horizontal swipe or a tap
        // still reaches whatever is underneath.
        onMoveShouldSetPanResponder: (_evt, g) =>
          g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx) * 1.5,
        onPanResponderMove: (_evt, g) => {
          if (g.dy > 0) dragY.setValue(g.dy);
        },
        onPanResponderRelease: (_evt, g) => {
          const shouldClose = g.dy > distanceThreshold || g.vy > velocityThreshold;
          if (shouldClose) {
            onClose();
            // Reset immediately so the sheet is not left offset when reopened.
            dragY.setValue(0);
          } else {
            Animated.spring(dragY, {
              toValue: 0,
              damping: 22,
              stiffness: 260,
              mass: 0.7,
              useNativeDriver: true,
            }).start();
          }
        },
        onPanResponderTerminate: () => {
          Animated.spring(dragY, {
            toValue: 0,
            damping: 22,
            stiffness: 260,
            mass: 0.7,
            useNativeDriver: true,
          }).start();
        },
      }),
    [dragY, distanceThreshold, onClose, velocityThreshold]
  );

  return { dragY, panHandlers: panResponder.panHandlers };
}
