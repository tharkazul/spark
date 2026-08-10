import React, { createContext, useContext, useRef, useCallback, useState } from 'react';

type TabBarContextType = {
  notifyScroll: () => void;
  registerScrollListener: (listener: () => void) => () => void;
  tabBarOccupied: number;
  setTabBarOccupied: React.Dispatch<React.SetStateAction<number>>;
};

const TabBarContext = createContext<TabBarContextType>({
  notifyScroll: () => {},
  registerScrollListener: () => () => {},
  tabBarOccupied: 104,
  setTabBarOccupied: () => {},
});

export const TabBarProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tabBarOccupied, setTabBarOccupied] = useState(104);
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
    <TabBarContext.Provider value={{ notifyScroll, registerScrollListener, tabBarOccupied, setTabBarOccupied }}>
      {children}
    </TabBarContext.Provider>
  );
};

export const useTabBar = () => useContext(TabBarContext);
