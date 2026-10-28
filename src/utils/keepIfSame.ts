/**
 * For state setters: keep the current value when a refresh brings back the same data.
 * React then skips the redraw, which matters because every screen using a store
 * redraws when its value changes, and stores refresh on every focus and app return.
 *
 *   setPlan(keepIfSame(data))
 */
export const keepIfSame =
  <T,>(next: T) =>
  (prev: T): T => {
    if (prev === next) return prev;
    try {
      return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
    } catch {
      return next;
    }
  };
