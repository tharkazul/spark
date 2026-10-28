import { useMemo, useRef } from 'react';

type Fns = Record<string, (...args: any[]) => any>;

/**
 * Wraps a store's functions in wrappers that never change identity but always call
 * the latest version. A store's context value then only changes when its data does,
 * so screens that just call refreshX() stop redrawing on every update of that store.
 */
export function useStableFns<T extends Fns>(fns: T): T {
  const latest = useRef(fns);
  latest.current = fns;
  return useMemo(() => {
    const stable: Fns = {};
    for (const key of Object.keys(latest.current)) {
      stable[key] = (...args: any[]) => latest.current[key](...args);
    }
    return stable as T;
  }, []);
}
