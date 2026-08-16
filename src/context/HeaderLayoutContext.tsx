import React, { createContext, useContext, useState, useCallback } from 'react';

type HeaderLayoutContextType = {
  headerHeight: number;
  setHeaderHeight: (h: number) => void;
};

const HeaderLayoutContext = createContext<HeaderLayoutContextType>({
  headerHeight: 140,
  setHeaderHeight: () => {},
});

export const HeaderLayoutProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [headerHeight, setHeaderHeightState] = useState(140);
  const isMountedRef = React.useRef(true);

  React.useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const setHeaderHeight = useCallback((h: number) => {
    requestAnimationFrame(() => {
      if (isMountedRef.current) {
        setHeaderHeightState((prev) => (Math.abs(prev - h) > 1 ? h : prev));
      }
    });
  }, []);

  return (
    <HeaderLayoutContext.Provider value={{ headerHeight, setHeaderHeight }}>
      {children}
    </HeaderLayoutContext.Provider>
  );
};

export const useHeaderLayout = () => useContext(HeaderLayoutContext);
