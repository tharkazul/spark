import { createContext, useContext } from 'react';

// Lets a child that owns a horizontal drag (e.g. a scrubbable chart) pause the
// surrounding swipe pager so the drag doesn't flip pages. No-op outside a pager.
export const PagerLockContext = createContext<(locked: boolean) => void>(() => {});

export const usePagerLock = () => useContext(PagerLockContext);
