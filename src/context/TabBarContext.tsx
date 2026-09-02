import React, { createContext, useContext, useRef, useCallback, useState } from 'react';

type TabBarContextType = {
  notifyScroll: () => void;
  /**
   * Scrolling has settled. Wire this to BOTH `onScrollEndDrag` and
   * `onMomentumScrollEnd` -- a flick fires only the latter, a slow drag only
   * the former. Without this half the bar hid on the first scroll and stayed
   * hidden until tapped.
   */
  notifyScrollEnd: () => void;
  registerScrollListener: (listener: () => void) => () => void;
  registerScrollEndListener: (listener: () => void) => () => void;
  tabBarOccupied: number;
  setTabBarOccupied: React.Dispatch<React.SetStateAction<number>>;
};

const TabBarContext = createContext<TabBarContextType>({
  notifyScroll: () => {},
  notifyScrollEnd: () => {},
  registerScrollListener: () => () => {},
  registerScrollEndListener: () => () => {},
  tabBarOccupied: 104,
  setTabBarOccupied: () => {},
});

export const TabBarProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tabBarOccupied, setTabBarOccupied] = useState(104);
  const listenersRef = useRef<Set<() => void>>(new Set());
  const endListenersRef = useRef<Set<() => void>>(new Set());

  const notifyScroll = useCallback(() => {
    listenersRef.current.forEach((listener) => listener());
  }, []);

  const notifyScrollEnd = useCallback(() => {
    endListenersRef.current.forEach((listener) => listener());
  }, []);

  const registerScrollListener = useCallback((listener: () => void) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  const registerScrollEndListener = useCallback((listener: () => void) => {
    endListenersRef.current.add(listener);
    return () => {
      endListenersRef.current.delete(listener);
    };
  }, []);

  return (
    <TabBarContext.Provider
      value={{
        notifyScroll,
        notifyScrollEnd,
        registerScrollListener,
        registerScrollEndListener,
        tabBarOccupied,
        setTabBarOccupied,
      }}
    >
      {children}
    </TabBarContext.Provider>
  );
};

export const useTabBar = () => useContext(TabBarContext);
