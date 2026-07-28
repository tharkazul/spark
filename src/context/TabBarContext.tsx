import React, { createContext, useContext, useRef, useCallback } from 'react';

type TabBarContextType = {
  notifyScroll: () => void;
  registerScrollListener: (listener: () => void) => () => void;
};

const TabBarContext = createContext<TabBarContextType>({
  notifyScroll: () => {},
  registerScrollListener: () => () => {},
});

export const TabBarProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const listenersRef = useRef<Set<() => void>>(new Set());

  const notifyScroll = useCallback(() => {
    listenersRef.current.forEach((listener) => listener());
  }, []);

  const registerScrollListener = useCallback((listener: () => void) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  return (
    <TabBarContext.Provider value={{ notifyScroll, registerScrollListener }}>
      {children}
    </TabBarContext.Provider>
  );
};

export const useTabBar = () => useContext(TabBarContext);
