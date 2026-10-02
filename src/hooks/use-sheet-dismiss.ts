import { useMemo, useRef } from 'react';
import { Animated, PanResponder, Dimensions } from 'react-native';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export interface UseSheetDismissOptions {
  distanceThreshold?: number;
  velocityThreshold?: number;
  animY?: Animated.Value;
  backdropOpacity?: Animated.Value;
  onWillClose?: () => void;
}

/**
 * Swipe-down-to-dismiss and tap-to-dismiss for bottom sheets.
 *
 * Drives the sheet's `animY` (or an internal `dragY`) continuously,
 * smoothly sliding off-screen without any intermediate reset glitches.
 */
export function useSheetDismiss(
  onClose: () => void,
  options?: UseSheetDismissOptions
) {
  const fallbackDragY = useRef(new Animated.Value(0)).current;
  const activeY = options?.animY ?? fallbackDragY;
  const isDirectAnim = Boolean(options?.animY);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const optionsRef = useRef(options);
  optionsRef.current = options;

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_evt, g) =>
          g.dy > 4 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderMove: (_evt, g) => {
          if (g.dy > 0) {
            activeY.setValue(g.dy);
            const backdrop = optionsRef.current?.backdropOpacity;
            if (backdrop) {
              const remaining = Math.max(0, 1 - g.dy / (SCREEN_HEIGHT * 0.45));
              backdrop.setValue(remaining);
            }
          }
        },
        onPanResponderRelease: (_evt, g) => {
          const opts = optionsRef.current;
          const distanceThreshold = opts?.distanceThreshold ?? 60;
          const velocityThreshold = opts?.velocityThreshold ?? 0.4;
          const isTap = Math.abs(g.dy) < 6 && Math.abs(g.dx) < 6;
          const shouldClose = isTap || g.dy > distanceThreshold || g.vy > velocityThreshold;

          if (shouldClose) {
            opts?.onWillClose?.();

            const animations: Animated.CompositeAnimation[] = [
              Animated.timing(activeY, {
                toValue: SCREEN_HEIGHT,
                duration: 200,
                useNativeDriver: true,
              }),
            ];

            if (opts?.backdropOpacity) {
              animations.push(
                Animated.timing(opts.backdropOpacity, {
                  toValue: 0,
                  duration: 180,
                  useNativeDriver: true,
                })
              );
            }

            Animated.parallel(animations).start(() => {
              onCloseRef.current();
              if (!isDirectAnim) {
                setTimeout(() => fallbackDragY.setValue(0), 100);
              }
            });
          } else {
            const resetAnimations: Animated.CompositeAnimation[] = [
              Animated.spring(activeY, {
                toValue: 0,
                damping: 22,
                stiffness: 260,
                mass: 0.7,
                useNativeDriver: true,
              }),
            ];

            if (opts?.backdropOpacity) {
              resetAnimations.push(
                Animated.timing(opts.backdropOpacity, {
                  toValue: 1,
                  duration: 150,
                  useNativeDriver: true,
                })
              );
            }

            Animated.parallel(resetAnimations).start();
          }
        },
        onPanResponderTerminate: () => {
          Animated.spring(activeY, {
            toValue: 0,
            damping: 22,
            stiffness: 260,
            mass: 0.7,
            useNativeDriver: true,
          }).start();

          const backdrop = optionsRef.current?.backdropOpacity;
          if (backdrop) {
            Animated.timing(backdrop, {
              toValue: 1,
              duration: 150,
              useNativeDriver: true,
            }).start();
          }
        },
      }),
    [activeY, isDirectAnim, fallbackDragY]
  );

  return { dragY: activeY, panHandlers: panResponder.panHandlers };
}
