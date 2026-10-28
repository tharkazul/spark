import React, { createContext, useContext, ReactNode, useEffect } from 'react';
import { AppState, Keyboard } from 'react-native';
import { useKeyboardHandler } from 'react-native-keyboard-controller';
import { useSharedValue, SharedValue, withTiming } from 'react-native-reanimated';

interface KeyboardMotionContextValue {
  height: SharedValue<number>;
  progress: SharedValue<number>;
}

const KeyboardMotionContext = createContext<KeyboardMotionContextValue | null>(null);

export function KeyboardMotionProvider({ children }: { children: ReactNode }) {
  const height = useSharedValue(0);
  const progress = useSharedValue(0);

  useKeyboardHandler(
    {
      onMove: (e) => {
        'worklet';
        height.value = e.height;
        progress.value = e.progress;
      },
      onInteractive: (e) => {
        'worklet';
        height.value = e.height;
        progress.value = e.progress;
      },
      onEnd: (e) => {
        'worklet';
        height.value = e.height;
        progress.value = e.progress;
      },
    },
    []
  );

  // keyboard-controller sometimes misses a show or hide (after a modal closes with the
  // keyboard up, or an app switch). Its value then sticks: the tab bar stayed hidden with
  // no keyboard, or the chat input stayed under an open keyboard. React Native's own
  // keyboard events come straight from iOS/Android, so they settle any disagreement.
  useEffect(() => {
    const settle = (open: boolean, keyboardHeight: number) => {
      setTimeout(() => {
        if (open && progress.get() < 0.5 && keyboardHeight > 0) {
          height.set(withTiming(keyboardHeight, { duration: 200 }));
          progress.set(withTiming(1, { duration: 200 }));
        } else if (!open && progress.get() > 0.5) {
          height.set(withTiming(0, { duration: 200 }));
          progress.set(withTiming(0, { duration: 200 }));
        }
      }, 150);
    };
    const shown = Keyboard.addListener('keyboardDidShow', (e) => settle(true, e.endCoordinates.height));
    const hidden = Keyboard.addListener('keyboardDidHide', () => settle(false, 0));
    const app = AppState.addEventListener('change', (s) => {
      if (s === 'active' && !Keyboard.isVisible()) settle(false, 0);
    });
    return () => {
      shown.remove();
      hidden.remove();
      app.remove();
    };
  }, [height, progress]);

  return (
    <KeyboardMotionContext.Provider value={{ height, progress }}>
      {children}
    </KeyboardMotionContext.Provider>
  );
}

export function useKeyboardMotionContext() {
  const context = useContext(KeyboardMotionContext);
  if (!context) {
    throw new Error('useKeyboardMotionContext must be used within a KeyboardMotionProvider');
  }
  return context;
}
