import React, { createContext, useContext, ReactNode } from 'react';
import { useKeyboardHandler } from 'react-native-keyboard-controller';
import { useSharedValue, SharedValue } from 'react-native-reanimated';

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
      onEnd: (e) => {
        'worklet';
        height.value = e.height;
        progress.value = e.progress;
      },
    },
    []
  );

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
