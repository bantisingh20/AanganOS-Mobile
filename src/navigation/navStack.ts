import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler } from 'react-native';

/**
 * A tiny route stack with Android hardware-back handling — a JS-only alternative to a native
 * navigation library (ponytail: React Navigation would pull in native modules →
 * `react-native-screens` / `react-native-safe-area-context` and another native rebuild, which this
 * Windows+NDK setup makes slow/fragile; a stack + {@link BackHandler} is the smallest thing that
 * fixes per-route rendering AND the hardware-back-closes-the-app bug).
 *
 * - {@link NavStack.push} opens a screen on top (per-route rendering: only the top route renders).
 * - {@link NavStack.pop} goes back one screen; the Android back button is wired to it.
 * - When the stack is at its base (depth 1), back is NOT consumed, so the OS does its default
 *   (leave/background the app) instead of the app silently closing on every back press.
 *
 * The generic `R` is the app's route union. The base route is supplied once; it can never be popped.
 */
export interface NavStack<R> {
  /** The current (top) route — the only one a renderer should show. */
  readonly current: R;
  /** Stack depth (1 = at the base route). */
  readonly depth: number;
  /** Push a new route on top. */
  readonly push: (route: R) => void;
  /** Pop one route; returns true if it popped, false if already at the base. */
  readonly pop: () => boolean;
  /** Replace the top route in place (no depth change). */
  readonly replace: (route: R) => void;
  /** Reset the stack back to just the base route (e.g. switching tabs). */
  readonly resetToBase: () => void;
  /** Replace the base route (e.g. the active tab) and clear anything pushed on top. */
  readonly setBase: (route: R) => void;
  /** Replace the ENTIRE stack with the given routes (last = current). Lets callers model tab history. */
  readonly replaceAll: (routes: R[]) => void;
}

export function useNavStack<R>(base: R): NavStack<R> {
  const [stack, setStack] = useState<R[]>([base]);
  // Keep a ref so the BackHandler callback always sees the latest depth without re-subscribing.
  const depthRef = useRef(1);
  depthRef.current = stack.length;

  const push = useCallback((route: R) => setStack((s) => [...s, route]), []);

  const pop = useCallback((): boolean => {
    let popped = false;
    setStack((s) => {
      if (s.length <= 1) {
        return s;
      }
      popped = true;
      return s.slice(0, -1);
    });
    return popped;
  }, []);

  const replace = useCallback(
    (route: R) => setStack((s) => [...s.slice(0, -1), route]),
    [],
  );

  const resetToBase = useCallback(() => setStack((s) => [s[0] as R]), []);

  const setBase = useCallback((route: R) => setStack([route]), []);

  const replaceAll = useCallback((routes: R[]) => {
    setStack((s) => (routes.length > 0 ? [...routes] : s));
  }, []);

  // Android hardware back: pop when we have something to pop; otherwise let the OS handle it
  // (returning false means "not consumed" → default behaviour, i.e. the app is NOT force-closed
  // from inside a screen; the user leaves the app only from the base route as expected).
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (depthRef.current > 1) {
        setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, []);

  return {
    current: stack[stack.length - 1] as R,
    depth: stack.length,
    push,
    pop,
    replace,
    resetToBase,
    setBase,
    replaceAll,
  };
}
