import { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions } from 'react-native';

import { useSheetDismiss } from './use-sheet-dismiss';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface SheetPresentationOptions {
  /** How far below its resting place the sheet starts. A full screen for bottom sheets; a centred dialog only rises a little. */
  offset?: number;
}

/**
 * Opening and closing a sheet that lives in a transparent Modal: the backdrop fades in while
 * the sheet slides up, and the reverse on close (or a drag down via `panHandlers`).
 *
 * Put `onSheetLayout` on the full-screen View directly inside the Modal. The slide starts on
 * that first layout, once the sheet is really on screen. Started any earlier (from the effect
 * that opens the Modal) it ran while iOS was still presenting the Modal and the sheet was
 * still rendering, so the sheet appeared at its final position instead of sliding in.
 * Modal's onShow would be the obvious hook, but it doesn't fire in this app.
 */
export function useSheetPresentation(visible: boolean, onClose: () => void, { offset = SCREEN_HEIGHT }: SheetPresentationOptions = {}) {
  const [showModal, setShowModal] = useState(visible);
  const [slideAnim] = useState(() => new Animated.Value(offset));
  const [backdropOpacity] = useState(() => new Animated.Value(0));
  const isClosingRef = useRef(false);
  const isPresentedRef = useRef(false);

  if (visible && !showModal) {
    setShowModal(true);
  }

  const { panHandlers } = useSheetDismiss(onClose, {
    animY: slideAnim,
    backdropOpacity,
    onWillClose: () => {
      isClosingRef.current = true;
    },
  });

  const animateOpen = () => {
    Animated.parallel([
      Animated.timing(backdropOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, damping: 24, stiffness: 220, mass: 0.8, useNativeDriver: true }),
    ]).start();
  };

  const hideModal = () => {
    isPresentedRef.current = false;
    setShowModal(false);
  };

  useEffect(() => {
    if (visible) {
      isClosingRef.current = false;
      // Reopened while still closing: the sheet is still laid out, so no new first layout comes.
      if (isPresentedRef.current) animateOpen();
      return;
    }
    if (isClosingRef.current) {
      // Dragged down: useSheetDismiss already animated it away.
      isClosingRef.current = false;
      hideModal();
      return;
    }
    Animated.parallel([
      Animated.timing(backdropOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: offset, duration: 200, useNativeDriver: true }),
    ]).start(({ finished }) => {
      // Not finished: it was reopened halfway and is sliding back up.
      if (finished) hideModal();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const onSheetLayout = () => {
    if (isPresentedRef.current || !visible) return;
    isPresentedRef.current = true;
    slideAnim.setValue(offset);
    backdropOpacity.setValue(0);
    animateOpen();
  };

  return { showModal, slideAnim, backdropOpacity, panHandlers, onSheetLayout };
}
